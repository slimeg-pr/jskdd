/* Non-blocking webfont load, done in JS so the page needs no inline
   handlers and the CSP can stay free of 'unsafe-inline' for scripts.
   If the request never completes, the system-font stack stands in. */
(function () {
  'use strict';
  var href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900' +
             '&family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap';
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.media = 'print';
  l.crossOrigin = 'anonymous';
  l.addEventListener('load', function () { l.media = 'all'; });
  document.head.appendChild(l);
})();
