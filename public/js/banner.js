/**
 * This file is part of the nginx-auth package.  It inserts a small floating logout button on the page.
 */
document.addEventListener("DOMContentLoaded", function(event) {
  // Add some styles
  var css = [
    '#nginx-auth-banner {',
      'position: absolute;',
      'top: 3px;',
      'right: 3px;',
      'color: #DDD;',
      'background-color: rgba(0,0,0,0.3);',
      'border-radius: 2px;',
      'margin: 0;',
      'padding: 0;',
      'transition: .5s',
    '}',

    '#nginx-auth-banner:hover {',
      'background-color: rgba(0,0,0,0.8);',
    '}'
  ].join('');

  // Insert the CSS above into a new element.  Browsers handle this differently.
  var style = document.createElement('style');
  if (style.styleSheet) {
      style.styleSheet.cssText = css;
  } else {
      style.appendChild(document.createTextNode(css));
  }

  document.getElementsByTagName('head')[0].appendChild(style);

  // Create the div that will house the banner.
  var element = document.createElement('div');
  element.id  = 'nginx-auth-banner';

  // Insert the html for the banner inside the div
  var html = [
    '<p id="nginx-auth-logout" style="cursor: pointer; margin: 0; padding: 5px;">Logout</p>'
  ].join('');

  element.innerHTML = html;

  // Insert the DIV before everything in the body
  document.body.insertBefore(element, document.body.firstChild);

  // Listen on the logout link's click event
  document.getElementById('nginx-auth-logout').addEventListener('click', function (e) {
    var e = e || window.event;
    e.stopPropagation();

    // Delete the cookie, and reload the page
    document.cookie = name + 'connect.sid=;expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.reload();
  });
});
