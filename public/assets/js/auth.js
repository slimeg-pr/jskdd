/* Monéta — sign in / create account.
   Passwords go straight to the server over the same origin and are never
   stored, cached, or echoed anywhere on this page. */

(function () {
  'use strict';
  var M = window.Moneta;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var DEST = '/portal.html';

  /* ── static chrome ── */
  $('#mark').innerHTML = M.markSVG();

  // The wordmark is outlined vector when a font has been run through
  // tools/make-wordmark.py; otherwise the live gradient text stands in.
  if (M.wordmarkSVG) {
    var wm = $('#wordmark');
    wm.innerHTML = M.wordmarkSVG(null, { gradient: ['#ffffff', '#e6d4ff', '#a855f7'] });
    wm.classList.add('is-outlined');
  }
  $$('[data-icon]').forEach(function (n) {
    n.innerHTML = M.icon(n.dataset.icon, 18);
  });
  $$('[data-reveal]').forEach(function (btn) {
    var input = document.getElementById(btn.dataset.reveal);
    var shown = false;
    btn.innerHTML = M.icon('eye', 17);
    btn.addEventListener('click', function () {
      shown = !shown;
      input.type = shown ? 'text' : 'password';
      btn.innerHTML = M.icon(shown ? 'eyeOff' : 'eye', 17);
      btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
      input.focus();
    });
  });

  /* ── tabs ── */
  var tabs = $('.tabs');
  var loginForm = $('#loginForm');
  var signupForm = $('#signupForm');

  function showTab(which) {
    var signup = which === 'signup';
    tabs.classList.toggle('signup', signup);
    $('#tabLogin').classList.toggle('active', !signup);
    $('#tabSignup').classList.toggle('active', signup);
    $('#tabLogin').setAttribute('aria-selected', String(!signup));
    $('#tabSignup').setAttribute('aria-selected', String(signup));
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    clear($('#loginMsg'));
    clear($('#signupMsg'));
    setTimeout(function () { (signup ? $('#suEmail') : $('#liEmail')).focus(); }, 60);
    if (location.hash !== (signup ? '#create' : '')) {
      history.replaceState(null, '', signup ? '#create' : location.pathname);
    }
  }
  $('#tabLogin').addEventListener('click', function () { showTab('login'); });
  $('#tabSignup').addEventListener('click', function () { showTab('signup'); });
  if (location.hash === '#create') showTab('signup');

  /* ── messages ── */
  function say(node, text, ok) {
    node.textContent = text;
    node.classList.toggle('ok', !!ok);
    node.classList.add('show');
  }
  function clear(node) { node.classList.remove('show'); node.textContent = ''; }

  function markBad(input) {
    var wrap = input.closest('.input-wrap');
    wrap.classList.remove('bad');
    void wrap.offsetWidth;
    wrap.classList.add('bad');
    input.focus();
  }
  $$('.input-wrap input').forEach(function (i) {
    i.addEventListener('input', function () { i.closest('.input-wrap').classList.remove('bad'); });
  });

  /* ── password strength ── */
  // A rough pool-size entropy estimate. It guides; the server decides.
  function strength(pw) {
    if (!pw) return { score: 0, label: 'Use something long and unguessable.', color: 'var(--down)' };
    var pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
    var bits = pw.length * (Math.log(pool || 1) / Math.LN2);
    if (/^(.)\1+$/.test(pw)) bits = 4;
    var pct = Math.max(4, Math.min(100, Math.round(bits / 90 * 100)));
    if (pw.length < 10) return { score: Math.min(pct, 30), label: 'Too short — at least 10 characters.', color: 'var(--down)' };
    if (bits < 45) return { score: pct, label: 'Weak. Add length or variety.', color: 'var(--down)' };
    if (bits < 65) return { score: pct, label: 'Reasonable.', color: 'var(--gold)' };
    if (bits < 90) return { score: pct, label: 'Strong.', color: 'var(--up)' };
    return { score: 100, label: 'Very strong.', color: 'var(--up)' };
  }

  var suPass = $('#suPass');
  suPass.addEventListener('input', function () {
    var s = strength(suPass.value);
    $('#meterBar').style.width = s.score + '%';
    $('#meterBar').style.background = s.color;
    $('#meterText').textContent = s.label;
    $('#meterText').style.color = suPass.value ? s.color : '';
  });

  /* ── leaving ── */
  var leaving = false;
  function enter() {
    if (leaving) return;
    leaving = true;
    $('#flash').classList.add('go');
    $('#auth').classList.add('leaving');
    setTimeout(function () { window.location.replace(DEST); }, 640);
  }

  /* ── submit ── */
  function busy(btn, on, label) {
    btn.disabled = on;
    btn.textContent = on ? label : btn.dataset.idle;
  }
  $('#loginBtn').dataset.idle = 'Sign in';
  $('#signupBtn').dataset.idle = 'Create account';

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#liEmail').value.trim();
    var pass = $('#liPass').value;
    var msg = $('#loginMsg');
    clear(msg);

    if (!email) { markBad($('#liEmail')); return say(msg, 'Enter your email.'); }
    if (!pass) { markBad($('#liPass')); return say(msg, 'Enter your password.'); }

    busy($('#loginBtn'), true, 'Signing in…');
    try {
      await M.api.login(email, pass);
      say(msg, 'Welcome back — opening the terminal…', true);
      enter();
    } catch (err) {
      busy($('#loginBtn'), false);
      say(msg, err.message);
      if (err.status === 401) markBad($('#liPass'));
    }
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#suEmail').value.trim();
    var handle = $('#suHandle').value.trim();
    var pass = suPass.value;
    var msg = $('#signupMsg');
    clear(msg);

    if (!email) { markBad($('#suEmail')); return say(msg, 'Enter your email.'); }
    if (handle.length < 3) { markBad($('#suHandle')); return say(msg, 'Pick a handle of at least 3 characters.'); }
    if (pass.length < 10) { markBad(suPass); return say(msg, 'Password must be at least 10 characters.'); }

    busy($('#signupBtn'), true, 'Creating…');
    try {
      await M.api.signup(email, handle, pass);
      say(msg, 'Account created — opening the terminal…', true);
      enter();
    } catch (err) {
      busy($('#signupBtn'), false);
      say(msg, err.message);
      if (/handle/i.test(err.message)) markBad($('#suHandle'));
      else if (/password/i.test(err.message)) markBad(suPass);
      else if (/email/i.test(err.message)) markBad($('#suEmail'));
    }
  });

  /* ── already signed in? go straight through ── */
  M.api.session().then(function (s) {
    if (s && s.authenticated) window.location.replace(DEST);
  }).catch(function () { /* offline: stay on the form */ });

  /* ── public ticker strip ── */
  var strip = document.getElementById('strip');
  function paintTicker(rows) {
    strip.innerHTML = rows.map(function (r) {
      var col = r.up ? 'var(--up)' : 'var(--down)';
      return '<span class="tick-chip">' + M.logoFor(r) +
        '<b>' + esc(r.symbol) + '</b><span class="mono" style="color:' + col + '">' +
        esc(r.price) + '</span></span>';
    }).join('');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // The gate does not load the full coin registry; the server sends a mark.
  M.logoFor = function (r) {
    return '<svg viewBox="0 0 32 32" width="15" height="15" aria-hidden="true">' +
      '<circle cx="16" cy="16" r="16" fill="' + (/^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#241c3d') + '"/>' +
      '<text x="16" y="17" text-anchor="middle" dominant-baseline="central" ' +
      'font-family="sans-serif" font-weight="800" font-size="13" fill="#fff">' +
      esc(String(r.symbol).slice(0, 1)) + '</text></svg>';
  };

  async function pollTicker() {
    try {
      var res = await fetch('/api/ticker', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return;
      var data = await res.json();
      if (Array.isArray(data.rows)) paintTicker(data.rows);
    } catch (e) { /* the strip is decoration; silence is fine */ }
  }
  pollTicker();
  var tickerTimer = setInterval(pollTicker, 2000);
  window.addEventListener('pagehide', function () { clearInterval(tickerTimer); });

  $('#liEmail').focus();
})();
