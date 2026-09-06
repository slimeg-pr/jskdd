/* Monéta — install support for the self-hosted build.
   Registers the service worker so the app can be added to a home screen and
   opens instantly. Entirely optional: the app works without it. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  function register() {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      /* insecure context, blocked by policy, or unsupported — the app is
         perfectly usable online without it */
    });
  }

  // Deliberately not waiting on `load`: that waits on every subresource,
  // including the webfont stylesheet, so a slow or blocked font CDN would
  // delay installability by however long that request takes to fail.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register, { once: true });
  } else {
    register();
  }
})();
