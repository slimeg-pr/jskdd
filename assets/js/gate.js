/* Monéta — gate logic. One key, one door. */
(function () {
  'use strict';
  var M = window.Moneta;
  var $ = M.dom.$;

  var KEY = 'slimegeo';           // compared case-insensitively, trimmed
  var DEST = 'portal.html';

  var form = $('#keyForm');
  var input = $('#keyInput');
  var field = $('#keyField');
  var msg = $('#msg');
  var btn = $('#openBtn');
  var flash = $('#flash');
  var gate = $('#gate');
  var attempts = 0;

  $('#revealBtn').addEventListener('click', function () {
    input.type = input.type === 'password' ? 'text' : 'password';
    input.focus();
  });

  function say(text, ok) {
    msg.textContent = text;
    msg.classList.toggle('ok', !!ok);
    msg.classList.add('show');
  }
  function quiet() { msg.classList.remove('show'); }

  input.addEventListener('input', function () {
    field.classList.remove('bad');
    quiet();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = (input.value || '').trim();

    if (!val) {
      field.classList.remove('bad');
      void field.offsetWidth;
      field.classList.add('bad');
      say('A key is required.');
      return;
    }

    if (val.toLowerCase() !== KEY) {
      attempts++;
      field.classList.remove('bad');
      void field.offsetWidth;
      field.classList.add('bad');
      say(attempts >= 3 ? 'Rejected. The portal does not negotiate.' : 'Invalid key. Access denied.');
      input.select();
      return;
    }

    // ── accepted
    say('Key accepted — decrypting terminal…', true);
    btn.disabled = true;
    btn.textContent = 'OPENING…';
    M.store.gate.pass();
    var s = M.store.get();
    s.stats.opens = (s.stats.opens || 0) + 1;
    M.store.save();

    flash.classList.add('go');
    gate.classList.add('unlocking');
    setTimeout(function () { window.location.href = DEST; }, 720);
  });

  input.focus();

  /* ── live ticker strip under the card ── */
  var STRIP = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
  var strip = $('#strip');
  M.market.init();
  M.market.start();

  strip.innerHTML = STRIP.map(function (s) {
    return '<span class="tick-chip" data-s="' + s + '">' + M.logo(s, 15) +
      '<b>' + s + '</b><span class="v mono"></span></span>';
  }).join('');

  function paint() {
    STRIP.forEach(function (s) {
      var chip = strip.querySelector('[data-s="' + s + '"] .v');
      if (!chip) return;
      var p = M.market.price(s);
      var up = p >= M.market.prev(s);
      chip.textContent = M.fmt.price(p);
      chip.style.color = up ? 'var(--up)' : 'var(--down)';
    });
  }
  paint();
  M.market.on(paint);
})();
