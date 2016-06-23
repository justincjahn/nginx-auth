/**
 * This file is part of the nginx-auth package.  It inserts a small floating logout button on the page.
 * Doesn't use any external libraries or do anything crazy with the DOM.
 */
(function () {
  // The base path of nginx-auth.
  // @todo Dynamically change this script with the running configuration's base path.
  var BASE_PATH = '/auth';

  document.addEventListener("DOMContentLoaded", function(event) {
    var css = [
      '#nginx-auth-banner {',
        'position: fixed;',
        'top: -15px;',
        'right: 3px;',
        'color: #DDD;',
        'background-color: rgba(0,0,0,0.3);',
        'border-radius: 2px;',
        'margin: 0;',
        'padding: 0;',
        'transition: .5s;',
        'z-index: 1000;',
      '}',

      '#nginx-auth-banner:hover {',
        'background-color: rgba(0,0,0,0.8);',
        'top: 3px;',
      '}',

      '#nginx-auth-banner p {',
        'cursor: pointer;',
        'margin: 0;',
        'padding: 5px;',
      '}'
    ].join('');

    // Create and Insert the CSS into a new style element.  Browsers handle this differently.
    var style = document.createElement('style');
    style.id  = 'nginx-auth-banner-style';

    if (style.styleSheet) { style.styleSheet.cssText = css; }
    else { style.appendChild(document.createTextNode(css)); }

    document.getElementsByTagName('head')[0].appendChild(style);

    // Create the div that will house the banner.
    var element       = document.createElement('div');
    element.id        = 'nginx-auth-banner';
    element.innerHTML = '<p>Logout</p>';

    element.addEventListener('click', function (e) {
      e = e || window.event;
      e.stopPropagation();

      // Delete the cookie, and reload the page
      document.cookie = 'connect.sid=;expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      window.location = (BASE_PATH + '/logout').replace('//', '/');
    });

    /**
     * Ensure the banner is injected in the DOM.  Some websites rewrite the DOM occasionally, and
     * we don't want to get caught up in that.
     */
    var ensureInjected = function () {
      // Check to see if we have the banner in the DOM already
      if (document.getElementById('nginx-auth-banner') !== null) { return; }
      document.body.insertBefore(element, document.body.firstChild);
    };

    /**
     * Calls `ensureInjected` every so often.
     */
    var runGenerate = function () {
      setTimeout(runGenerate, 10000);
      ensureInjected();
    };

    runGenerate();
  });
})();
