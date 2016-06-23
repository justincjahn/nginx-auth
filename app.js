/**
 * A small expressjs application that authenticates and authorizes users using LDAP and the NGINX
 * ngx_http_auth_request_module. By default, the flow is as follows:
 * 
 *     1. The browser's request is sent to NGINX.
 *     2. NGINX makes a subrequest to /auth/check, where it will receive a 200, 401, or 403 status.
 *     3. If the status is not 200, it will rewrite the uri (preserving the original location).
 *     4. The user enters login credentials on the web form, and a POST request is sent to /auth.
 *     5. If the user is authenticated, the user will be redirected to their original location.
 *     6. The cycle continues.
 * 
 * NGINX CONFIGURATION
 * 
 * Please see `/test/nginx.conf.dist` for configuration details.
 * 
 * @module nginx-auth
 */

var path               = require('path'),
    config             = require('config'),
    express            = require('express'),
    express_handlebars = require('express-handlebars'),
    express_session    = require('express-session'),
    express_sass       = require('node-sass-middleware'),
    passport           = require('passport'),
    passport_local     = require('passport-local'),
    bodyParser         = require('body-parser'),
    uuid               = require('node-uuid'),
    ldapjs             = require('ldapjs'),
    debug              = require('debug')('nginx-auth'),
    app                = express(),
    router             = express.Router();

// Set the basePath of the application for future reference in other files
global.basePath = app.basePath = path.resolve(__dirname);

// Set the NODE_ENV variable if it isn't set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
var bDevelopment = process.env.NODE_ENV.toLowerCase() === 'development';

// Export the app object for other files to require()
module.exports = app;

//
// MIDDLEWARE
//

  // Sessions
  app.use(express_session({
    secret:            uuid.v4(),
    resave:            false,
    saveUninitialized: true,
    unset:             'destroy'
  }));

  // SASS - ./sass/site.scss -> /base/css/site.css
  app.use(config.basePath, express_sass({
    src:      path.join(app.basePath, 'sass'),
    dest:     path.join(app.basePath, 'public', 'css'),
    response: bDevelopment,
    debug:    bDevelopment,
    prefix:   '/css'
  }));

  // Static
  app.use(config.basePath, express.static(path.join(app.basePath, 'public'), {
    dotfiles:   'ignore',
    etag:       false,
    extensions: ['html', 'js']
  }));

  // Handlebars
  var hbs = express_handlebars.create({
    extname: '.hbs',

    helpers: {
      base: function (url) {
        return (config.basePath + url).replace('//', '/').replace(/\/+$/, '');
      }
    }
  });

  app.engine('.hbs', hbs.engine);
  app.set('view engine', '.hbs');

//
// AUTHENTICATION
//

  app.use(passport.initialize());
  app.use(passport.session());

  // Store the entire user object in session.  This isn't great, but will work well for our purpose.
  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  // No deserialization necessary in this case.
  passport.deserializeUser(function(user, done) {
    done(null, user);
  });

  /**
   * An object returned by LDAP containing user information.
   * 
   * @typedef {Object} User
   * @property {object[]|null} data - An array of LDAP entries.
   * @property {string} dn - The DN of the LDAP entry.
   * @property {string} cn - The display name of the LDAP entry.
   * @property {string} sn - The surname of the LDAP entry.
   * @property {string} givenName - The first name of the LDAP entry.
   * @property {string} mail - The email address of the LDAP entry.
   * @property {string[]} memberOf - A list of groups as CNs the LDAP entry is a member of.
   */

  /**
   * Callback used for findUser.
   * 
   * @callback findUserCallback
   * @param {boolean|string} err - The error string, if there was an error.
   * @param {User[]|null} data - A list of `User` objects.
   */

  /**
   * Find a user by a given username.  The sAMAaccountName, email and userPrincipalName fields are searched.
   * 
   * @param {string} username - The user's identity.
   * @param {findUserCallback} callback - Called after the search completes, or on error.
   */
  var findUser = function (username, callback) {
    // Sanity check
    if (typeof username !== 'string') {
      throw 'findUser: `username` param must be a string.';
    }

    if (typeof callback !== 'function') {
      throw 'findUser: `callback` param must be a function.';
    }

    // Create the LDAP server and connect
    var ldap = ldapjs.createClient({ url: 'ldap://dccent1.uconnect.local' });
    ldap.connect();

    // Generate an LDAP filter for sAMAccountName, email, userPrincipalName
    var filter = new ldapjs.OrFilter({
      filters: [
        new ldapjs.EqualityFilter({
          attribute: 'sAMAccountName',
          value:     username
        }),

        new ldapjs.EqualityFilter({
          attribute: 'email',
          value:     username
        }),

        new ldapjs.EqualityFilter({
          attribute: 'userPrincipalName',
          value:     username
        })
      ]
    });

    // Bind as our bindUser and bindPassword from the config
    ldap.bind(config.ldap.bindUser, config.ldap.bindPassword, function (err) {
      if (err) {
        return callback(err, null);
      }

      // Configuration for the search
      var options = {
        scope: 'sub',
        filter: filter,
        attributes: ['dn', 'givenName', 'sn', 'cn', 'mail', 'memberOf']
      };

      // The return data is added here
      var rows = [];

      // Begin the search
      ldap.search(config.ldap.bindDN, options, function (err, ldapevent) {
        if (err) {
          return callback(err, null);
        }

        ldapevent.on('searchEntry', function (entry) {
          rows.push(entry.object);
        });

        ldapevent.on('error', function (err) {
          ldap.unbind();
          callback(err, null);
        });

        ldapevent.on('end', function (err) {
          ldap.unbind();
          callback(false, rows);
        });
      });
    });
  };

  /**
   * Callback used for authn.
   * 
   * @callback authnCallback
   * @param {boolean|string} err - The error string, if there was an error.
   * @param {boolean} result - True if the user was sucessfully authenticated.
   */

  /**
   * Authenticate the user by attempting to bind to LDAP using their provided credentials.
   * 
   * @param {User} user - A user object to process.
   * @param {string} password - The user's credentials.
   * @param {authnCallback} callback - Called when the results are known.
   */
  var authn = function (user, password, callback) {
    // Sanity check
    if (typeof user !== 'object' && typeof user.dn !== 'string') {
      throw 'authn: `user` must be an object of type `User`.';
    }

    if (typeof password !== 'string') {
      throw 'authn: `username` param must be a string.';
    }

    if (typeof callback !== 'function') {
      throw 'authn: `callback` param must be a function.';
    }

    // Create the LDAP server and connect
    var ldap = ldapjs.createClient({ url: 'ldap://dccent1.uconnect.local' });
    ldap.connect();

    // Bind as the user provided in the params
    ldap.bind(user.dn, password, function (err) {
      // There was some error binding.  This may be a server error, or an invalid set of credentials.
      if (err) {
        return callback(err, false);
      }

      // The process was a success
      ldap.unbind();
      return callback(false, true);
    });
  };

  /**
   * Authorize the provided user object.
   * 
   * @param {User} user - An object containing user properties.
   * @param {array} user.memberOf - A list of memberships.
   * @return boolean
   */
  var authz = function (user, groups) {
    groups        = groups || [''];
    user.memberOf = user.memberOf || ['NO_GROUPS'];

    // Loop through each of the member's groups
    for (var i = 0; i < user.memberOf.length; i++) {
      var userGroup = user.memberOf[i].toLowerCase();

      // Loop through each of the groups defined in settings.  By default it is an empty string, which
      /// will return true.
      for (var x = 0; x < groups.length; x++) {
        var configGroup = groups[x].toLowerCase();

        if (userGroup.indexOf(configGroup) > 0) {
          debug("AUTHZ: Success for " + user.username);
          return true;
        }
      }
    }

    // A match was not found
    debug("AUTHZ: Fail for " + user.username);
    return false;
  };

  // Use the local authentication passport to pull from LDAP instead of a traditional DB.
  passport.use('local', new passport_local(function (username, password, done) {
    debug('Authenticating: ' + username);

    // If we are in the development environment, then use test/test to login, unless they provided
    /// a different username.
    if (bDevelopment === true) {
      if (username === 'test' && password === 'test') {
        debug('DEV: Authentication successful.');
        return done(null, {username: username, authorized: true});
      } else if (username === 'test') {
        debug('DEV: Authentication unsuccessful.');
        return done(null, false, { message: 'Invalid username or password.'});
      }
    }

    // Try and find the user in the database.
    findUser(username, function (err, data) {
      if (err) {
        debug('PROD: Authentication unsuccessful: ' + err);
        return done(null, false, { message: 'Error: Unable to bind to the LDAP server.'});
      }

      if (data.length < 1) {
        debug('PROD: Authentication unsuccessful: User not found.');
        return done(null, false, { message: 'Invalid username or password.' });
      }

      // Try to bind the user
      authn(data[0], password, function (err, result) {
        if (err || result !== true) {
          debug('PROD: Authentication unsuccessful: ' + err);
          return done(null, false, { message: 'Invalid username or password.' });
        }

        var oReturn = data[0];
        oReturn.username = username;

        debug('PROD: Authentication successful.');
        return done(null, oReturn);
      });
    });
  }));

//
// ROUTES
//

  // Authenticate and authorize the user.
  app.post(config.basePath, bodyParser.urlencoded({ extended: true }), function (req, res, next) {
    passport.authenticate('local', function (err, user, info) {
      if (err || !user) {
        return res.render('index', { error: info.message || 'Invalid username or password!' });
      }

      req.login(user, function (err) {
        if (err) {
          return res.render('index', { error: err });
        }

        // If JavaScript has provided us a request_uri, use it, but make sure it is within the same domain
        /// our request originated from.  If we don't then attackers could redirect to mallicious sites.
        if (req.body.request_uri) {
          var uri = req.body.request_uri;
          for (var i = 0; i < config.redirectDomains.length; i++) {
            var domain = config.redirectDomains[i].toLowerCase();
            var sTest  = new RegExp('^http(s)?:\/\/' + domain + '(:[0-9]+)?\/.*$');

            var matches = uri.toLowerCase().match(sTest);
            if (matches !== null) {
              return res.redirect(uri);
            }
          }
        }

        return res.redirect(config.redirectPath);
      });
    })(req, res, next);
  });

  // Check the user to see if they are authenticated, authorized, or not logged in at all.
  app.get(config.basePath + '/check', function (req, res, next) {
    if (req.user && authz(req.user, config.ldap.groups)) {
      debug('/check 200');
      return res.status(200).end();
    }

    if (req.user) {
      debug('/check 403');
      return res.status(403).end();
    }

    debug('/check 401');
    res.status(401).end();
  });

  // Destroy the session.
  app.get(config.basePath + '/logout', function (req, res, next) {
    debug('Destroying authentication credentials.');

    req.logout();
    res.redirect(config.basePath);
  });

  // Either authenticate the user, or present them with the authentication page.
  app.get(config.basePath + '*', function (req, res) {
    if (req.user) {
      res.render('authenticated');
    } else {
      res.render('index');
    }
  });
