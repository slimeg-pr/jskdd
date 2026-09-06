/* Monéta — local UI preferences.
   This is the ONLY thing the app puts in localStorage, and it is all
   cosmetic: which tab you were on, which timeframe, which chart style.
   Identity, balances, holdings and profile data live on the server. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};
  var KEY = 'moneta.ui.v1';

  var ALLOWED = {
    view: ['home', 'assets', 'markets', 'vault', 'profile'],
    heroTf: ['1H', '1D', '1W', '1M', '1Y', 'ALL'],
    detailTf: ['1H', '1D', '1W', '1M', '1Y', 'ALL'],
    detailMode: ['area', 'candle'],
    assetsSort: ['value', 'change', 'alpha']
  };

  var DEFAULTS = { view: 'home', heroTf: '1D', detailTf: '1D', detailMode: 'area', assetsSort: 'value' };

  function read() {
    var out = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      // Only known keys with allow-listed values survive the round trip.
      Object.keys(ALLOWED).forEach(function (k) {
        if (ALLOWED[k].indexOf(parsed[k]) >= 0) out[k] = parsed[k];
      });
    } catch (e) { /* blocked, full or corrupt storage — defaults are fine */ }
    return out;
  }

  var cache = null;

  M.prefs = {
    all: function () { return (cache = cache || read()); },
    get: function (k) { return M.prefs.all()[k]; },
    set: function (k, v) {
      if (!ALLOWED[k] || ALLOWED[k].indexOf(v) < 0) return;
      M.prefs.all()[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* non-fatal */ }
    },
    clear: function () {
      cache = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* non-fatal */ }
    }
  };
})(window);
