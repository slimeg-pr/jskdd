/* Monéta — formatting + tiny DOM helpers. */
(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};

  function fmtPrice(n) {
    if (!isFinite(n)) return '$0.00';
    var abs = Math.abs(n);
    if (abs >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1)    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 0.01) return '$' + n.toFixed(4);
    if (abs >= 0.0001) return '$' + n.toFixed(6);
    return '$' + n.toFixed(8);
  }

  function fmtMoney(n) {
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtCompact(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e12) return s + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3)  return s + '$' + (a / 1e3).toFixed(2) + 'K';
    return s + '$' + a.toFixed(2);
  }

  function fmtNum(n) {
    var a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(2);
  }

  function fmtQty(n) {
    if (!n) return '0';
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(3) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(3) + 'M';
    if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (a >= 1) return n.toFixed(4);
    if (a >= 0.001) return n.toFixed(6);
    return n.toExponential(3);
  }

  function fmtPct(n, digits) {
    var d = digits == null ? 2 : digits;
    return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d) + '%';
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  M.fmt = {
    price: fmtPrice, money: fmtMoney, compact: fmtCompact,
    num: fmtNum, qty: fmtQty, pct: fmtPct
  };
  M.dom = { el: el, $: $, $$: $$, esc: esc };
  M.clamp = clamp;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
