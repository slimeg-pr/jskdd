/* Monéta — live feed over Server-Sent Events.
   Used by the server build: the market ticks in the Node process and this
   page renders what it is sent. */
(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};
  var es = null;

  function connect(h) {
    close();
    es = new EventSource('/api/stream', { withCredentials: true });

    es.addEventListener('hello', function (ev) {
      var d = JSON.parse(ev.data);
      h.onHello(d.p, d.t);
    });
    es.addEventListener('tick', function (ev) {
      var d = JSON.parse(ev.data);
      h.onTick(d.p, d.t);
    });
    es.onopen = function () { h.onStatus(true); };
    es.onerror = function () {
      h.onStatus(false, 'RECONNECTING');
      // EventSource retries on its own; only bail if the session is gone.
      if (M.api) {
        M.api.session().then(function (s) {
          if (!s.authenticated) h.onLost();
        }).catch(function () { /* offline — keep retrying */ });
      }
    };
  }

  function close() {
    if (es) { es.close(); es = null; }
  }

  M.feed = { connect: connect, close: close };
})(window);
