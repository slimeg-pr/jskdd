/* Monéta — portal application.
   State of record lives on the server: this file renders it, and asks the
   server to change it. Nothing sensitive is written to localStorage, and
   every string that came from a person is escaped before it reaches the DOM. */

(function () {
  'use strict';
  var M = window.Moneta;
  var $ = M.dom.$, $$ = M.dom.$$, esc = M.dom.esc;
  var fmt = M.fmt;
  var mkt = M.market;
  var icon = M.icon;
  var api = M.api;
  var prefs = M.prefs;

  /* ── session state (memory only) ────────────────────────── */
  var me = null;                   // the signed-in user, as the server sees them
  var es = null;                   // live price stream

  var state = {
    view: prefs.get('view'),
    heroTf: prefs.get('heroTf'),
    detailSym: null,
    detailTf: prefs.get('detailTf'),
    detailMode: prefs.get('detailMode'),
    marketFilter: 'all',
    marketSort: { key: 'rank', dir: 1 },
    assetsSort: prefs.get('assetsSort'),
    vaultTiers: {},
    vaultCat: 'All',
    vaultQuery: '',
    vaultShown: 120,
    lastTotal: null,
    tradeSide: 'buy',
    paused: false
  };
  M.badges.tiers.forEach(function (t) { state.vaultTiers[t.key] = true; });

  function profile() { return me.profile; }

  /* ── portfolio maths (display only — the server owns the book) ── */
  function holdingsValue() {
    var v = 0;
    for (var sym in me.holdings) v += me.holdings[sym] * mkt.price(sym);
    return v;
  }
  function total() { return holdingsValue() + me.cash; }

  function portfolioSeries(tf) {
    var syms = Object.keys(me.holdings).filter(function (s) { return me.holdings[s] > 0; });
    if (!syms.length) return [me.cash, me.cash];
    var parts = syms.map(function (s) { return { q: me.holdings[s], a: mkt.series(s, tf) }; });
    var n = parts.reduce(function (m2, p) { return Math.min(m2, p.a.length); }, Infinity);
    if (!isFinite(n) || n < 2) return [me.cash, me.cash];
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var v = me.cash;
      for (var j = 0; j < parts.length; j++) v += parts[j].q * parts[j].a[parts[j].a.length - n + i];
      out[i] = v;
    }
    return out;
  }

  function positions() {
    return M.COINS.map(function (c) {
      var q = me.holdings[c.symbol] || 0;
      return { coin: c, qty: q, value: q * mkt.price(c.symbol), chg: mkt.change(c.symbol, '1D') };
    }).filter(function (p) { return p.qty > 0; });
  }

  /* ── small helpers ──────────────────────────────────────── */
  function animateNumber(node, from, to, dur, render) {
    if (node._anim) cancelAnimationFrame(node._anim);
    var t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      node.innerHTML = render(from + (to - from) * e);
      node._anim = t < 1 ? requestAnimationFrame(step) : null;
    }
    node._anim = requestAnimationFrame(step);
  }

  function moneyMarkup(v) {
    if (profile().hideBalance) return '••••••••';
    var s = fmt.money(v);
    var dot = s.lastIndexOf('.');
    return esc(s.slice(0, dot)) + '<span class="cents">' + esc(s.slice(dot)) + '</span>';
  }

  function toast(iconName, title, sub, kind) {
    var wrap = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.innerHTML = '<span class="ti">' + icon(iconName, 20) + '</span>' +
      '<span><span class="tt">' + esc(title) + '</span>' +
      '<span class="ts">' + esc(sub || '') + '</span></span>';
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
    while (wrap.children.length > 4) wrap.firstChild.remove();
  }

  /** Turns an API rejection into a toast, and bounces to sign-in on 401. */
  function fail(err, what) {
    if (err && err.status === 401) {
      if (es) { es.close(); es = null; }
      window.location.replace('/');
      return;
    }
    toast('alert', what || 'That did not work', (err && err.message) || 'Unknown error.', 'bad');
  }

  var modalBack = $('#modalBack');
  function openModal(html) {
    $('#modal').innerHTML = html;
    modalBack.classList.add('open');
  }
  function closeModal() { modalBack.classList.remove('open'); }
  modalBack.addEventListener('click', function (e) { if (e.target === modalBack) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ── avatar ─────────────────────────────────────────────── */
  // avatarUrl is built by the server; the sigil is one of a fixed set of
  // icon names. Neither is free text, so neither can inject markup.
  function avatarHTML(size) {
    var p = profile();
    if (p.avatarKind === 'image' && me.avatarUrl) {
      return '<img src="' + esc(me.avatarUrl) + '" alt="" width="' + size + '" height="' + size + '">';
    }
    var name = M.hasIcon(p.avatarSigil) ? p.avatarSigil : 'crown';
    return icon(name, Math.round(size * 0.56), { width: 1.5 });
  }

  /* ── navigation ─────────────────────────────────────────── */
  var VIEWS = ['home', 'assets', 'markets', 'detail', 'vault', 'profile'];
  function go(view, arg) {
    state.view = view;
    VIEWS.forEach(function (v) { $('#view-' + v).hidden = v !== view; });
    $$('[data-nav]').forEach(function (b) {
      if (b.classList.contains('nav-item') || (b.parentElement && b.parentElement.id === 'mobileNav')) {
        b.classList.toggle('active', b.dataset.nav === view);
      }
    });
    if (view !== 'detail') prefs.set('view', view);
    window.scrollTo(0, 0);
    if (view === 'assets') renderAssets();
    if (view === 'markets') renderMarketTable();
    if (view === 'vault') renderVault();
    if (view === 'profile') renderProfile();
    if (view === 'detail') renderDetail(arg);
    if (view === 'home') { renderHomeStats(); renderMovers(); renderHoldingsTable($('#homeHoldings'), 6); renderShowcase(); }
  }
  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-nav]');
    if (n) { e.preventDefault(); go(n.dataset.nav); }
  });
  $('#backBtn').addEventListener('click', function () { go('markets'); });

  /* ── sign out ───────────────────────────────────────────── */
  $('#signOutBtn').addEventListener('click', function () {
    openModal(
      '<div class="mic" style="--bcol:var(--neon);--bglow:rgba(177,77,255,.5)">' + icon('logout', 34) + '</div>' +
      '<h3>Sign out of Monéta?</h3><p>Your portfolio stays on the server. You will need your password to come back.</p>' +
      '<div class="row"><button class="btn" id="mCancel">Stay</button>' +
      '<button class="btn btn-primary" id="mOut">Sign out</button></div>');
    $('#mCancel').onclick = closeModal;
    $('#mOut').onclick = async function () {
      $('#mOut').disabled = true;
      if (es) { es.close(); es = null; }   // stop the feed retrying on a dead session
      try { await api.logout(); } catch (e) { /* leaving regardless */ }
      prefs.clear();
      window.location.replace('/');
    };
  });

  /* ── timeframes ─────────────────────────────────────────── */
  var TFS = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];
  function tfRow(active, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'tf-row';
    TFS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tf' + (t === active ? ' active' : '');
      b.textContent = t;
      b.onclick = function () {
        wrap.querySelectorAll('.tf').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onPick(t);
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ══ HOME ════════════════════════════════════════════════ */
  var heroChart = null;

  function initHero() {
    heroChart = M.Chart($('#heroChart'), {
      autoColor: true,
      fmt: function (v) { return fmt.compact(v); }
    });
    $('#heroTf').replaceWith(tfRow(state.heroTf, function (t) {
      state.heroTf = t;
      prefs.set('heroTf', t);
      heroChart.setData(portfolioSeries(t));
      updateHeroDelta();
    }));
    $('#eyeBtn').addEventListener('click', function () {
      var next = !profile().hideBalance;
      profile().hideBalance = next;
      paintEye();
      $('#balance').innerHTML = moneyMarkup(total());
      api.patchProfile({ hideBalance: next }).catch(fail);
    });
    paintEye();
  }

  function paintEye() {
    $('#eyeBtn').innerHTML = icon(profile().hideBalance ? 'eyeOff' : 'eye', 15);
  }

  function updateHeroDelta() {
    var a = portfolioSeries(state.heroTf);
    var pct = a.length > 1 && a[0] ? (a[a.length - 1] - a[0]) / a[0] * 100 : 0;
    var abs = a.length > 1 ? a[a.length - 1] - a[0] : 0;
    var d = $('#delta');
    d.classList.toggle('neg', pct < 0);
    d.innerHTML = icon(pct >= 0 ? 'arrowUp' : 'arrowDown', 13, { width: 2.4 }) +
      '<span>' + esc(fmt.pct(pct)) + '</span>';
    $('#deltaAbs').textContent = (abs >= 0 ? '+' : '−') + fmt.money(Math.abs(abs)) +
      ' · ' + (mkt.TF[state.heroTf] ? mkt.TF[state.heroTf].label : '');
  }

  function card(k, v, sub, cls) {
    return '<div class="card hoverable"><div class="k">' + esc(k) + '</div>' +
      '<div class="v ' + (cls || '') + '">' + esc(v) + '</div>' +
      (sub ? '<div class="sub2">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderHomeStats() {
    var pos = positions();
    var byChg = pos.slice().sort(function (a, b) { return b.chg - a.chg; });
    var best = byChg[0], worst = byChg[byChg.length - 1];
    $('#homeStats').innerHTML = [
      card('Cash balance', fmt.money(me.cash), 'available to deploy'),
      card('Positions', String(pos.length), 'of ' + M.COINS.length + ' listed assets'),
      best ? card('Best performer', best.coin.symbol + ' ' + fmt.pct(best.chg),
        fmt.money(best.value) + ' held', best.chg >= 0 ? 'up' : 'down')
           : card('Best performer', '—', ''),
      worst ? card('Weakest', worst.coin.symbol + ' ' + fmt.pct(worst.chg),
        fmt.money(worst.value) + ' held', worst.chg >= 0 ? 'up' : 'down')
            : card('Weakest', '—', '')
    ].join('');
    $('#navAssets').textContent = pos.length;
    $('#navMarkets').textContent = M.COINS.length;
    $('#navVault').textContent = M.badges.total;
  }

  function renderMovers() {
    var all = M.COINS.map(function (c) { return { c: c, chg: mkt.change(c.symbol, '1D') }; })
      .sort(function (a, b) { return Math.abs(b.chg) - Math.abs(a.chg); }).slice(0, 4);
    $('#movers').innerHTML = all.map(function (m2) {
      return '<div class="mover" data-sym="' + esc(m2.c.symbol) + '">' + M.logo(m2.c.symbol, 34) +
        '<div class="mi"><div class="mn">' + esc(m2.c.name) + '</div>' +
        '<div class="mp">' + esc(fmt.price(mkt.price(m2.c.symbol))) + '</div></div>' +
        '<div class="mc ' + (m2.chg >= 0 ? 'up' : 'down') + '">' + esc(fmt.pct(m2.chg, 1)) + '</div></div>';
    }).join('');
    $$('#movers .mover').forEach(function (n) {
      n.addEventListener('click', function () { go('detail', n.dataset.sym); });
    });
  }

  function renderShowcase() {
    var ids = profile().showcase || [];
    var list = ids.map(function (id) { return M.badges.get(id); }).filter(Boolean);
    if (!list.length) list = M.badges.all.slice(0, 6);
    $('#showcaseStrip').innerHTML = list.map(function (b) { return badgeTile(b); }).join('');
  }

  /* ── table rendering ────────────────────────────────────── */
  var priceCells = {}, chgCells = {}, sparkNodes = {};

  function track(map, sym, node) {
    if (!map[sym]) map[sym] = [];
    map[sym].push(node);
  }
  function untrack(scopeEl) {
    [priceCells, chgCells, sparkNodes].forEach(function (map) {
      Object.keys(map).forEach(function (k) {
        map[k] = map[k].filter(function (n) { return !scopeEl.contains(n) && document.contains(n); });
        if (!map[k].length) delete map[k];
      });
    });
  }

  function sparkSVG(sym, up) {
    var d = M.sparkPath(mkt.sparkline(sym), 116, 34);
    return '<svg class="spark" viewBox="0 0 116 34" preserveAspectRatio="none" data-spark="' + esc(sym) + '">' +
      '<path d="' + d + '" fill="none" stroke="' + (up ? 'var(--up)' : 'var(--down)') +
      '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function rowHTML(c, opts) {
    opts = opts || {};
    var price = mkt.price(c.symbol);
    var c1 = mkt.change(c.symbol, '1H');
    var c24 = mkt.change(c.symbol, '1D');
    var c7 = mkt.change(c.symbol, '1W');
    var watched = me.watchlist.indexOf(c.symbol) >= 0;
    var qty = me.holdings[c.symbol] || 0;
    var cells = '';

    cells += '<td class="l rank">' + c.rank + '</td>';
    cells += '<td class="l"><div class="cell-coin">' + M.logo(c.symbol, 28) +
      '<div><div class="nm">' + esc(c.name) + '</div><div class="sym">' + esc(c.symbol) + '</div></div></div></td>';
    cells += '<td><span class="px" data-px="' + esc(c.symbol) + '">' + esc(fmt.price(price)) + '</span></td>';

    if (opts.holdings) {
      cells += '<td class="mono">' + esc(fmt.qty(qty)) + ' <span style="color:var(--text-4)">' + esc(c.symbol) + '</span></td>';
      cells += '<td class="mono" data-val="' + esc(c.symbol) + '">' + esc(fmt.money(qty * price)) + '</td>';
    }
    cells += '<td><span class="chg ' + (c1 >= 0 ? 'up' : 'down') + '" data-chg="' + esc(c.symbol) + '|1H">' + esc(fmt.pct(c1)) + '</span></td>';
    cells += '<td><span class="chg ' + (c24 >= 0 ? 'up' : 'down') + '" data-chg="' + esc(c.symbol) + '|1D">' + esc(fmt.pct(c24)) + '</span></td>';
    if (!opts.compact) {
      cells += '<td><span class="chg ' + (c7 >= 0 ? 'up' : 'down') + '" data-chg="' + esc(c.symbol) + '|1W">' + esc(fmt.pct(c7)) + '</span></td>';
      cells += '<td class="mono" style="color:var(--text-2)">' + esc(fmt.compact(mkt.marketCap(c.symbol))) + '</td>';
      cells += '<td class="mono" style="color:var(--text-3)">' + esc(fmt.compact(mkt.volume24(c.symbol))) + '</td>';
    }
    cells += '<td>' + sparkSVG(c.symbol, c24 >= 0) + '</td>';
    cells += '<td><button class="star ' + (watched ? 'on' : '') + '" data-star="' + esc(c.symbol) +
      '" aria-label="Watch ' + esc(c.symbol) + '">' + icon('star', 15, watched ? { fill: 'currentColor' } : null) + '</button></td>';

    return '<tr data-sym="' + esc(c.symbol) + '">' + cells + '</tr>';
  }

  function headHTML(cols) {
    return '<thead><tr>' + cols.map(function (c) {
      return '<th class="' + (c.l ? 'l' : '') + '"' + (c.key ? ' data-sort="' + esc(c.key) + '"' : '') + '>' + c.t + '</th>';
    }).join('') + '</tr></thead>';
  }

  function wireTable(tbl) {
    tbl.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.star')) return;
        go('detail', tr.dataset.sym);
      });
    });
    tbl.querySelectorAll('[data-star]').forEach(function (b) {
      b.addEventListener('click', async function (e) {
        e.stopPropagation();
        var sym = b.dataset.star;
        b.disabled = true;
        try {
          var r = await api.toggleWatch(sym);
          me.watchlist = r.watchlist;
          b.classList.toggle('on', r.watching);
          b.innerHTML = icon('star', 15, r.watching ? { fill: 'currentColor' } : null);
          renderWatchMini();
          toast('star', r.watching ? 'Added to watchlist' : 'Removed from watchlist', sym);
        } catch (err) { fail(err, 'Watchlist not updated'); }
        b.disabled = false;
      });
    });
    tbl.querySelectorAll('[data-px]').forEach(function (n) { track(priceCells, n.dataset.px, n); });
    tbl.querySelectorAll('[data-chg]').forEach(function (n) { track(chgCells, n.dataset.chg.split('|')[0], n); });
    tbl.querySelectorAll('[data-spark]').forEach(function (n) { track(sparkNodes, n.dataset.spark, n); });
  }

  var HOLD_COLS = [
    { t: '#', l: 1 }, { t: 'Asset', l: 1 }, { t: 'Price' }, { t: 'Holdings' },
    { t: 'Value' }, { t: '1h' }, { t: '24h' }, { t: '7d' }, { t: 'Mkt cap' },
    { t: 'Volume' }, { t: 'Last 4h' }, { t: '' }
  ];

  function renderHoldingsTable(tbl, limit) {
    untrack(tbl);
    var pos = positions().sort(function (a, b) { return b.value - a.value; });
    if (limit) pos = pos.slice(0, limit);
    tbl.innerHTML = headHTML(HOLD_COLS) + '<tbody>' +
      pos.map(function (p) { return rowHTML(p.coin, { holdings: true }); }).join('') + '</tbody>';
    wireTable(tbl);
  }

  /* ══ MY ASSETS ═══════════════════════════════════════════ */
  $('#assetsFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sort]');
    if (!b) return;
    $$('#assetsFilters .chip').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    state.assetsSort = b.dataset.sort;
    prefs.set('assetsSort', state.assetsSort);
    renderAssets();
  });

  function renderAssets() {
    var pos = positions();
    if (state.assetsSort === 'value') pos.sort(function (a, b) { return b.value - a.value; });
    if (state.assetsSort === 'change') pos.sort(function (a, b) { return b.chg - a.chg; });
    if (state.assetsSort === 'alpha') pos.sort(function (a, b) { return a.coin.name.localeCompare(b.coin.name); });

    var hv = holdingsValue();
    var t = total() || 1;
    var green = pos.filter(function (p) { return p.chg >= 0; }).length;
    var biggest = pos.slice().sort(function (a, b) { return b.value - a.value; })[0];

    $('#assetsSub').textContent = pos.length + ' open positions · ' + fmt.money(hv) + ' deployed';
    $('#assetsStats').innerHTML = [
      card('Deployed', fmt.money(hv), (hv / t * 100).toFixed(1) + '% of book'),
      card('Cash', fmt.money(me.cash), (me.cash / t * 100).toFixed(1) + '% of book'),
      card('In the green', green + ' / ' + pos.length, 'on the 24h window'),
      card('Largest position', biggest ? biggest.coin.symbol : '—', biggest ? fmt.money(biggest.value) : '')
    ].join('');

    var tbl = $('#assetsTable');
    untrack(tbl);
    tbl.innerHTML = headHTML(HOLD_COLS) + '<tbody>' +
      pos.map(function (p) { return rowHTML(p.coin, { holdings: true }); }).join('') + '</tbody>';
    wireTable(tbl);
  }

  /* ══ MARKETS ═════════════════════════════════════════════ */
  function marketTags() {
    var t = { all: 1, watchlist: 1 };
    M.COINS.forEach(function (c) { c.tags.forEach(function (x) { t[x] = 1; }); });
    return Object.keys(t);
  }

  function initMarketFilters() {
    $('#marketFilters').innerHTML = marketTags().map(function (t) {
      var label = t === 'all' ? 'All assets' : t === 'watchlist' ? 'Watchlist' : t;
      return '<button class="chip' + (t === 'all' ? ' on' : '') + '" data-f="' + esc(t) + '">' +
        (t === 'watchlist' ? icon('star', 12, { fill: 'currentColor' }) : '') + esc(label) + '</button>';
    }).join('');
    $('#marketFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      $$('#marketFilters .chip').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      state.marketFilter = b.dataset.f;
      renderMarketTable();
    });
  }

  function marketRows() {
    var rows = M.COINS.slice();
    if (state.marketFilter === 'watchlist') {
      rows = rows.filter(function (c) { return me.watchlist.indexOf(c.symbol) >= 0; });
    } else if (state.marketFilter !== 'all') {
      rows = rows.filter(function (c) { return c.tags.indexOf(state.marketFilter) >= 0; });
    }
    var k = state.marketSort.key, dir = state.marketSort.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (k === 'rank') { va = a.rank; vb = b.rank; }
      else if (k === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (k === 'price') { va = mkt.price(a.symbol); vb = mkt.price(b.symbol); }
      else if (k === 'cap') { va = mkt.marketCap(a.symbol); vb = mkt.marketCap(b.symbol); }
      else if (k === 'vol') { va = mkt.volume24(a.symbol); vb = mkt.volume24(b.symbol); }
      else { va = mkt.change(a.symbol, k); vb = mkt.change(b.symbol, k); }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
    return rows;
  }

  function renderMarketTable() {
    var tbl = $('#marketTable');
    untrack(tbl);
    var arrow = function (k) {
      return state.marketSort.key === k
        ? '<span class="arrow">' + (state.marketSort.dir > 0 ? '▲' : '▼') + '</span>' : '';
    };
    tbl.innerHTML = headHTML([
      { t: '#' + arrow('rank'), l: 1, key: 'rank' },
      { t: 'Asset' + arrow('name'), l: 1, key: 'name' },
      { t: 'Price' + arrow('price'), key: 'price' },
      { t: '1h' + arrow('1H'), key: '1H' },
      { t: '24h' + arrow('1D'), key: '1D' },
      { t: '7d' + arrow('1W'), key: '1W' },
      { t: 'Market cap' + arrow('cap'), key: 'cap' },
      { t: '24h volume' + arrow('vol'), key: 'vol' },
      { t: 'Last 4h' },
      { t: '' }
    ]) + '<tbody>' + marketRows().map(function (c) { return rowHTML(c); }).join('') + '</tbody>';
    wireTable(tbl);
    tbl.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort;
        if (state.marketSort.key === k) state.marketSort.dir *= -1;
        else state.marketSort = { key: k, dir: (k === 'rank' || k === 'name') ? 1 : -1 };
        renderMarketTable();
      });
    });
  }

  /* ══ ASSET DETAIL ════════════════════════════════════════ */
  var detailChart = null;

  function renderDetail(sym) {
    if (sym) state.detailSym = sym;
    sym = state.detailSym;
    if (!sym || !M.coin(sym)) { go('markets'); return; }
    var c = M.coin(sym);
    var price = mkt.price(sym);
    var chg = mkt.change(sym, state.detailTf);
    var qty = me.holdings[sym] || 0;
    var watched = me.watchlist.indexOf(sym) >= 0;

    $('#detailBody').innerHTML =
      '<div class="page-head">' +
        '<div class="asset-head">' + M.logo(sym, 52) +
          '<div><div class="ah-name">' + esc(c.name) + ' <span class="ah-sym">' + esc(sym) + '</span></div>' +
          '<div class="asset-price" id="dPrice">' + esc(fmt.price(price)) + '</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span class="chg ' + (chg >= 0 ? 'up' : 'down') + '" id="dChg" style="font-size:16px">' + esc(fmt.pct(chg)) + '</span>' +
          '<button class="btn" id="dWatch">' + (watched ? 'Watching' : 'Watch') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid detail-grid" id="dGrid">' +
        '<div class="panel" style="padding:18px">' +
          '<div class="chart-head">' +
            '<div id="dTf"></div>' +
            '<div class="seg mode-seg">' +
              '<button data-mode="area" class="' + (state.detailMode === 'area' ? 'on' : '') + '">Area</button>' +
              '<button data-mode="candle" class="' + (state.detailMode === 'candle' ? 'on' : '') + '">Candles</button>' +
            '</div>' +
          '</div>' +
          '<div class="detail-chart mt"><canvas id="dChart"></canvas><div class="crosshair-tip" id="dTip"></div></div>' +
        '</div>' +
        '<div class="trade">' +
          '<div class="seg">' +
            '<button data-side="buy" class="' + (state.tradeSide === 'buy' ? 'on' : '') + '">Buy</button>' +
            '<button data-side="sell" class="' + (state.tradeSide === 'sell' ? 'on' : '') + '">Sell</button>' +
          '</div>' +
          '<div class="amt-field"><span>$</span><input id="tradeAmt" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>' +
          '<div class="quick">' +
            '<button data-q="0.25">25%</button><button data-q="0.5">50%</button>' +
            '<button data-q="0.75">75%</button><button data-q="1">Max</button>' +
          '</div>' +
          '<div class="trade-rows">' +
            '<div><span>You own</span><b class="mono">' + esc(fmt.qty(qty)) + ' ' + esc(sym) + '</b></div>' +
            '<div><span>Position value</span><b class="mono" id="dPos">' + esc(fmt.money(qty * price)) + '</b></div>' +
            '<div><span>Cash available</span><b class="mono" id="dCash">' + esc(fmt.money(me.cash)) + '</b></div>' +
            '<div><span>Est. units</span><b class="mono" id="dUnits">0 ' + esc(sym) + '</b></div>' +
          '</div>' +
          '<button class="btn btn-primary" id="tradeGo" style="width:100%;margin-top:16px;padding:13px">Buy ' + esc(sym) + '</button>' +
          '<p class="trade-note">SIMULATED ORDER · PRICED BY THE SERVER · NO REAL FUNDS</p>' +
        '</div>' +
      '</div>' +

      '<div class="sec-head"><h2>Statistics</h2></div>' +
      '<div class="stat-list" id="dStats"></div>' +

      '<div class="sec-head"><h2>About ' + esc(c.name) + '</h2></div>' +
      '<div class="card" style="line-height:1.75;font-size:13.5px;color:var(--text-2)">' +
        esc(about(c)) +
        '<div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">' +
          c.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') +
        '</div>' +
      '</div>';

    $('#dTf').replaceWith(tfRow(state.detailTf, function (t) {
      state.detailTf = t;
      prefs.set('detailTf', t);
      pushDetailData();
      renderDetailStats();
    }));

    var tip = $('#dTip');
    detailChart = M.Chart($('#dChart'), {
      mode: state.detailMode,
      color: c.color,
      onHover: function (v, i, n, x, y) {
        if (v == null) { tip.classList.remove('on'); return; }
        tip.classList.add('on');
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
        tip.textContent = fmt.price(v);
      }
    });
    pushDetailData();
    renderDetailStats();

    $$('#detailBody [data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.detailMode = b.dataset.mode;
        prefs.set('detailMode', state.detailMode);
        $$('#detailBody [data-mode]').forEach(function (x) {
          x.classList.toggle('on', x.dataset.mode === state.detailMode);
        });
        detailChart.setMode(state.detailMode);
        pushDetailData();
      });
    });

    $('#dWatch').addEventListener('click', async function () {
      var btn = $('#dWatch');
      btn.disabled = true;
      try {
        var r = await api.toggleWatch(sym);
        me.watchlist = r.watchlist;
        btn.textContent = r.watching ? 'Watching' : 'Watch';
        renderWatchMini();
      } catch (err) { fail(err, 'Watchlist not updated'); }
      btn.disabled = false;
    });

    wireTrade(sym);
  }

  function pushDetailData() {
    if (!detailChart || !state.detailSym) return;
    detailChart.setData(
      mkt.series(state.detailSym, state.detailTf),
      state.detailMode === 'candle' ? mkt.candles(state.detailSym, state.detailTf, 64) : null
    );
  }

  function renderDetailStats() {
    var sym = state.detailSym;
    var host = $('#dStats');
    if (!sym || !host) return;
    var c = M.coin(sym);
    var rows = [
      ['Price', fmt.price(mkt.price(sym))],
      ['24h high', fmt.price(mkt.high24(sym))],
      ['24h low', fmt.price(mkt.low24(sym))],
      ['All-time high', fmt.price(mkt.ath(sym))],
      ['Market cap', fmt.compact(mkt.marketCap(sym))],
      ['24h volume', fmt.compact(mkt.volume24(sym))],
      ['Circulating supply', fmt.num(c.supply) + ' ' + sym],
      ['Rank', '#' + c.rank],
      ['1h', fmt.pct(mkt.change(sym, '1H'))],
      ['24h', fmt.pct(mkt.change(sym, '1D'))],
      ['7d', fmt.pct(mkt.change(sym, '1W'))],
      ['1y', fmt.pct(mkt.change(sym, '1Y'), 1)]
    ];
    host.innerHTML = rows.map(function (r) {
      var cls = /^[+−]/.test(r[1]) ? (r[1][0] === '+' ? 'up' : 'down') : '';
      return '<div><div class="k">' + esc(r[0]) + '</div><div class="v ' + cls + '">' + esc(r[1]) + '</div></div>';
    }).join('');
  }

  function about(c) {
    return c.name + ' (' + c.symbol + ') trades on the Monéta terminal as a ' +
      c.tags.join(' / ').toLowerCase() + ' asset, currently ranked #' + c.rank +
      ' by simulated market capitalisation. Prices come from Monéta’s own market ' +
      'engine — a seeded random walk with volatility tuned per asset, running on the ' +
      'server so every session sees the same tape. Nothing here touches a real ' +
      'exchange, and no real funds are ever at risk.';
  }

  function wireTrade(sym) {
    var amt = $('#tradeAmt');
    var btn = $('#tradeGo');

    function updateUnits() {
      var v = parseFloat(amt.value) || 0;
      $('#dUnits').textContent = fmt.qty(v / mkt.price(sym)) + ' ' + sym;
    }
    function refreshSide() {
      $$('#detailBody [data-side]').forEach(function (b) {
        b.classList.toggle('on', b.dataset.side === state.tradeSide);
      });
      btn.textContent = (state.tradeSide === 'buy' ? 'Buy ' : 'Sell ') + sym;
      btn.classList.toggle('sell', state.tradeSide === 'sell');
      updateUnits();
    }

    $$('#detailBody [data-side]').forEach(function (b) {
      b.addEventListener('click', function () { state.tradeSide = b.dataset.side; refreshSide(); });
    });
    $$('#detailBody [data-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = parseFloat(b.dataset.q);
        var pool = state.tradeSide === 'buy' ? me.cash : (me.holdings[sym] || 0) * mkt.price(sym);
        amt.value = (pool * f).toFixed(2);
        updateUnits();
      });
    });
    amt.addEventListener('input', updateUnits);

    btn.addEventListener('click', async function () {
      var usd = parseFloat(amt.value);
      if (!isFinite(usd) || usd <= 0) {
        toast('alert', 'Enter an amount', 'The order needs a size.', 'bad');
        return;
      }
      btn.disabled = true;
      var was = btn.textContent;
      btn.textContent = 'Placing…';
      try {
        var r = await api.trade(sym, state.tradeSide, usd);
        me.cash = r.cash;
        me.holdings = r.holdings;
        me.stats = r.stats;
        toast(r.side === 'buy' ? 'trendUp' : 'trendDown',
          (r.side === 'buy' ? 'Bought ' : 'Sold ') + fmt.qty(r.units) + ' ' + r.symbol,
          'Filled at ' + fmt.price(r.price), r.side === 'buy' ? 'good' : 'bad');
        amt.value = '';
        renderDetail(sym);
        renderWatchMini();
        heroChart.setData(portfolioSeries(state.heroTf));
      } catch (err) {
        btn.disabled = false;
        btn.textContent = was;
        fail(err, 'Order rejected');
      }
    });

    refreshSide();
  }

  /* ══ VAULT ═══════════════════════════════════════════════ */
  function badgeTile(b, pinned) {
    var t = M.badges.tier(b.tier);
    return '<div class="badge' + (pinned ? ' pinned' : '') + '" data-badge="' + esc(b.id) +
      '" style="--bcol:' + t.color + ';--bglow:' + t.glow + '">' +
      '<div class="bcheck">' + icon('check', 9, { width: 3.4 }) + '</div>' +
      '<div class="bic">' + icon(b.icon, 26, { width: 1.5 }) + '</div>' +
      '<div class="bn">' + esc(b.name) + '</div>' +
      '<div class="bt">' + esc(t.name) + '</div></div>';
  }

  function initVaultFilters() {
    var counts = M.badges.counts();
    $('#tierFilters').innerHTML = M.badges.tiers.map(function (t) {
      return '<button class="tier-pill" data-tier="' + esc(t.key) + '" style="color:' + t.color + '">' +
        '<span class="dot"></span>' + esc(t.name) + ' <b style="opacity:.7">' + counts[t.key] + '</b></button>';
    }).join('');
    $('#catFilters').innerHTML = ['All'].concat(M.badges.categories).map(function (c) {
      var n = c === 'All' ? M.badges.total : M.badges.all.filter(function (b) { return b.cat === c; }).length;
      return '<button class="chip' + (c === 'All' ? ' on' : '') + '" data-cat="' + esc(c) + '">' +
        esc(c) + ' <span style="opacity:.55">' + n + '</span></button>';
    }).join('');

    $('#tierFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tier]');
      if (!b) return;
      var k = b.dataset.tier;
      state.vaultTiers[k] = !state.vaultTiers[k];
      b.classList.toggle('off', !state.vaultTiers[k]);
      state.vaultShown = 120;
      renderVault();
    });
    $('#catFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      $$('#catFilters .chip').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      state.vaultCat = b.dataset.cat;
      state.vaultShown = 120;
      renderVault();
    });
    $('#badgeSearch').addEventListener('input', function (e) {
      state.vaultQuery = e.target.value.toLowerCase().trim();
      state.vaultShown = 120;
      renderVault();
    });
    $('#vaultMore').addEventListener('click', function () {
      state.vaultShown += 160;
      renderVault();
    });
  }

  function vaultList() {
    return M.badges.all.filter(function (b) {
      if (!state.vaultTiers[b.tier]) return false;
      if (state.vaultCat !== 'All' && b.cat !== state.vaultCat) return false;
      if (state.vaultQuery) {
        var hay = (b.name + ' ' + b.desc + ' ' + b.cat).toLowerCase();
        if (hay.indexOf(state.vaultQuery) < 0) return false;
      }
      return true;
    });
  }

  function renderVault() {
    var list = vaultList();
    var shown = list.slice(0, state.vaultShown);
    var pinned = profile().showcase || [];
    $('#vaultSub').textContent = M.badges.total + ' badges · all unlocked · showing ' +
      shown.length + ' of ' + list.length;
    $('#vaultGrid').innerHTML = shown.map(function (b) {
      return badgeTile(b, pinned.indexOf(b.id) >= 0);
    }).join('');
    $('#vaultEmpty').hidden = list.length > 0;
    $('#vaultMore').hidden = list.length <= state.vaultShown;
  }

  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-badge]');
    if (!n) return;
    var b = M.badges.get(n.dataset.badge);
    if (!b) return;
    var t = M.badges.tier(b.tier);
    var pinned = (profile().showcase || []).indexOf(b.id) >= 0;
    openModal(
      '<div class="mic" style="--bcol:' + t.color + ';--bglow:' + t.glow + '">' +
        icon(b.icon, 36, { width: 1.4 }) + '</div>' +
      '<div class="modal-tier" style="color:' + t.color + ';border-color:' + t.color + '">' +
        esc(t.name) + ' · ' + esc(b.cat) + '</div>' +
      '<h3>' + esc(b.name) + '</h3>' +
      '<p>' + esc(b.desc) + '</p>' +
      '<p class="modal-unlocked">' + icon('check', 12, { width: 3 }) + ' UNLOCKED</p>' +
      '<div class="row"><button class="btn" id="mClose">Close</button>' +
      '<button class="btn btn-primary" id="mPin">' + (pinned ? 'Unpin' : 'Pin to showcase') + '</button></div>'
    );
    $('#mClose').onclick = closeModal;
    $('#mPin').onclick = async function () {
      var list = (profile().showcase || []).slice();
      var i = list.indexOf(b.id);
      if (i >= 0) list.splice(i, 1);
      else { list.push(b.id); if (list.length > 6) list.shift(); }
      $('#mPin').disabled = true;
      try {
        var r = await api.patchProfile({ showcase: list });
        me = Object.assign(me, r.user);
        closeModal();
        renderShowcase();
        if (state.view === 'vault') renderVault();
        if (state.view === 'profile') renderProfile();
        toast('pin', i >= 0 ? 'Unpinned' : 'Pinned to showcase', b.name);
      } catch (err) { $('#mPin').disabled = false; fail(err, 'Showcase not updated'); }
    };
  });

  /* ══ PROFILE ═════════════════════════════════════════════ */
  var BANNERS = [
    { id: 'obsidian',  name: 'Obsidian',    css: 'linear-gradient(120deg,#0b0716,#2b1350 45%,#0b0716)' },
    { id: 'nebula',    name: 'Nebula',      css: 'linear-gradient(120deg,#160a2e,#7b2ff7 40%,#ff4d8d 78%,#160a2e)' },
    { id: 'aurora',    name: 'Aurora',      css: 'linear-gradient(120deg,#04121a,#00e39b 35%,#57d8ff 62%,#0b0716)' },
    { id: 'ember',     name: 'Ember',       css: 'linear-gradient(120deg,#1a0606,#ff3d68 42%,#ffb02e 75%,#1a0606)' },
    { id: 'voidglass', name: 'Void Glass',  css: 'linear-gradient(120deg,#05040a,#241c3d 50%,#05040a)' },
    { id: 'ultra',     name: 'Ultraviolet', css: 'linear-gradient(120deg,#2d0a4e,#b14dff 50%,#57d8ff 100%)' },
    { id: 'goldleaf',  name: 'Gold Leaf',   css: 'linear-gradient(120deg,#150f04,#ffcb57 46%,#7b5a12 82%,#150f04)' },
    { id: 'circuit',   name: 'Circuit',     css: 'linear-gradient(120deg,#04100f,#0f766e 40%,#b14dff 88%,#04100f)' }
  ];
  var BANNER_BY_ID = {};
  BANNERS.forEach(function (b) { BANNER_BY_ID[b.id] = b; });

  var TITLES = [
    'Obsidian Sovereign', 'Vault Keeper', 'Neon Whale', 'Portal Warden',
    'Chain Cartographer', 'Liquidity Wraith', 'Candle Reader', 'Deep Index Diver',
    'Violet Signal', 'Glasswalker', 'The Watcher', 'Market Force',
    'Silent Accumulator', 'Diamond Custodian', 'Night Trader', 'Founding Member'
  ];
  var SIGILS = ['crown', 'diamond', 'hex', 'orbit', 'spiral', 'sparkle', 'moon', 'flame',
    'wave2', 'void', 'cube', 'gem', 'infinity', 'compass', 'monolith', 'galaxy',
    'whale', 'owl', 'ghost', 'shield'];
  var ACCENTS = ['#b14dff', '#8b5cf6', '#d946ef', '#ff4d8d', '#57d8ff',
    '#00e39b', '#ffb02e', '#ff6b3d', '#7c9cff', '#00d4ff'];

  function applyAccent() {
    document.documentElement.style.setProperty('--accent', profile().accent);
  }

  function renderIdentity() {
    $('#topAv').innerHTML = avatarHTML(30);
    $('#topName').textContent = profile().name;
    $('#topHandle').textContent = '@' + me.handle;
    $('#greeting').textContent = profile().name.split(' ')[0] + '’s portfolio';
  }

  function bannerCss() {
    var b = BANNER_BY_ID[profile().banner] || BANNERS[0];
    return b.css;
  }

  function renderProfile() {
    var p = profile();
    $('#profBanner').style.background = bannerCss();
    $('#profAv').innerHTML = avatarHTML(104);
    $('#profName').textContent = p.name;
    $('#profHandle').textContent = '@' + me.handle;
    $('#profTitle').textContent = p.title;
    $('#profBio').textContent = p.bio || 'No bio yet.';
    $('#profMeta').innerHTML =
      '<span>' + icon('map', 13) + esc(p.location || 'Location not set') + '</span>' +
      '<span>' + icon('calendar', 13) + 'Joined ' +
        esc(new Date(me.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + '</span>' +
      '<span>' + icon('badge', 13) + M.badges.total + ' badges unlocked</span>' +
      '<span>' + icon('mail', 13) + esc(me.email) + '</span>';

    var pos = positions();
    $('#profStats').innerHTML = [
      card('Portfolio', p.hideBalance ? '••••••' : fmt.compact(total()), pos.length + ' positions'),
      card('Lifetime trades', (me.stats.trades || 0).toLocaleString('en-US'),
        ((me.stats.wins || 0) / Math.max(1, me.stats.trades || 0) * 100).toFixed(1) + '% profitable'),
      card('Day streak', String(me.stats.streak || 1), 'consecutive sessions'),
      card('Badges', M.badges.total + ' / ' + M.badges.total, '100% complete')
    ].join('');

    var list = (p.showcase || []).map(function (id) { return M.badges.get(id); }).filter(Boolean);
    $('#profShowcase').innerHTML = list.length
      ? list.map(function (x) { return badgeTile(x, true); }).join('')
      : '<div class="empty">Nothing pinned yet — open the vault and pin up to six.</div>';

    fillEditor();
  }

  function fillEditor() {
    var p = profile();
    $('#fName').value = p.name;
    $('#fHandle').value = me.handle;
    $('#fLocation').value = p.location;
    $('#fBio').value = p.bio;
    $('#bioCount').textContent = (p.bio || '').length;

    var sel = $('#fTitle');
    if (!sel.options.length) {
      sel.innerHTML = TITLES.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join('');
    }
    sel.value = p.title;

    $('#sigilPicks').innerHTML = SIGILS.map(function (s) {
      var on = p.avatarKind === 'sigil' && p.avatarSigil === s;
      return '<button class="sigil-pick' + (on ? ' on' : '') + '" data-sigil="' + esc(s) +
        '" title="' + esc(s) + '" aria-label="Sigil ' + esc(s) + '">' + icon(s, 20, { width: 1.5 }) + '</button>';
    }).join('');

    $('#swatches').innerHTML = ACCENTS.map(function (c) {
      return '<button class="swatch' + (p.accent === c ? ' on' : '') + '" data-accent="' + esc(c) +
        '" style="background:' + esc(c) + ';color:' + esc(c) + '" aria-label="Accent ' + esc(c) + '"></button>';
    }).join('');
    $('#fAccentCustom').value = /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : '#b14dff';

    $('#bannerPicks').innerHTML = BANNERS.map(function (b) {
      return '<button class="banner-pick' + (p.banner === b.id ? ' on' : '') + '" data-banner="' + esc(b.id) +
        '" style="background:' + b.css + '"><span>' + esc(b.name) + '</span></button>';
    }).join('');

    $('#clearAvatar').hidden = p.avatarKind !== 'image';
  }

  /* profile editing — optimistic locally, confirmed by the server */
  var saveTimer = null;
  var pending = {};

  function setSaveState(text, kind) {
    var n = $('#saveState');
    n.textContent = text || '';
    n.className = 'save-state' + (kind ? ' ' + kind : '');
  }

  function queue(patch) {
    Object.assign(pending, patch);
    setSaveState('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushProfile, 550);
  }

  async function flushProfile() {
    if (!Object.keys(pending).length) return;
    var patch = pending;
    pending = {};
    try {
      var r = await api.patchProfile(patch);
      me = Object.assign(me, r.user);
      applyAccent();
      renderIdentity();
      setSaveState('Saved', 'ok');
      setTimeout(function () { setSaveState(''); }, 1600);
    } catch (err) {
      setSaveState((err && err.message) || 'Not saved', 'bad');
      // Pull authoritative state back so the form stops lying to the user.
      try {
        var s = await api.session();
        if (s.authenticated) { me = s.user; fillEditor(); renderProfile(); }
      } catch (e2) { /* offline */ }
    }
  }

  $('#editToggle').addEventListener('click', function () {
    var p = $('#editPanel');
    p.hidden = !p.hidden;
    $('#editToggle').textContent = p.hidden ? 'Edit profile' : 'Close editor';
    if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#closeEditor').addEventListener('click', function () {
    $('#editPanel').hidden = true;
    $('#editToggle').textContent = 'Edit profile';
  });
  $('#saveProfile').addEventListener('click', function () { clearTimeout(saveTimer); flushProfile(); });

  $('#fName').addEventListener('input', function (e) {
    profile().name = e.target.value;
    $('#profName').textContent = e.target.value;
    renderIdentity();
    queue({ name: e.target.value });
  });
  $('#fHandle').addEventListener('input', function (e) {
    queue({ handle: e.target.value.trim() });
  });
  $('#fLocation').addEventListener('input', function (e) {
    profile().location = e.target.value;
    queue({ location: e.target.value });
  });
  $('#fBio').addEventListener('input', function (e) {
    profile().bio = e.target.value;
    $('#bioCount').textContent = e.target.value.length;
    $('#profBio').textContent = e.target.value || 'No bio yet.';
    queue({ bio: e.target.value });
  });
  $('#fTitle').addEventListener('change', function (e) {
    profile().title = e.target.value;
    $('#profTitle').textContent = e.target.value;
    queue({ title: e.target.value });
  });

  $('#sigilPicks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sigil]');
    if (!b) return;
    profile().avatarSigil = b.dataset.sigil;
    profile().avatarKind = 'sigil';
    fillEditor();
    $('#profAv').innerHTML = avatarHTML(104);
    renderIdentity();
    queue({ avatarSigil: b.dataset.sigil });
  });

  $('#swatches').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accent]');
    if (!b) return;
    profile().accent = b.dataset.accent;
    applyAccent();
    fillEditor();
    queue({ accent: b.dataset.accent });
  });
  $('#fAccentCustom').addEventListener('input', function (e) {
    profile().accent = e.target.value;
    applyAccent();
    $$('#swatches .swatch').forEach(function (s) { s.classList.remove('on'); });
    queue({ accent: e.target.value });
  });

  $('#bannerPicks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-banner]');
    if (!b) return;
    profile().banner = b.dataset.banner;
    $('#profBanner').style.background = bannerCss();
    fillEditor();
    queue({ banner: b.dataset.banner });
  });

  $('#fUpload').addEventListener('change', async function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 512 * 1024) {
      toast('alert', 'Image too large', 'Keep it under 512 KB.', 'bad');
      return;
    }
    setSaveState('Uploading…');
    try {
      var r = await api.uploadAvatar(f);
      me = Object.assign(me, r.user);
      $('#profAv').innerHTML = avatarHTML(104);
      renderIdentity();
      fillEditor();
      setSaveState('Saved', 'ok');
      toast('user', 'Avatar updated', 'Stored on the server, visible only to you.', 'good');
    } catch (err) {
      setSaveState('');
      fail(err, 'Upload failed');
    }
  });

  $('#clearAvatar').addEventListener('click', async function () {
    try {
      var r = await api.removeAvatar();
      me = Object.assign(me, r.user);
      $('#profAv').innerHTML = avatarHTML(104);
      renderIdentity();
      fillEditor();
      toast('trash', 'Avatar removed', 'Back to your sigil.');
    } catch (err) { fail(err, 'Could not remove avatar'); }
  });

  /* ══ watchlist rail ══════════════════════════════════════ */
  function renderWatchMini() {
    var el = $('#watchMini');
    var list = me.watchlist.length ? me.watchlist : ['BTC', 'ETH', 'SOL'];
    el.innerHTML = list.map(function (s) {
      var c = M.coin(s);
      if (!c) return '';
      var chg = mkt.change(s, '1D');
      return '<div class="watch-row" data-sym="' + esc(s) + '">' + M.logo(s, 20) +
        '<span class="ws">' + esc(s) + '</span>' +
        '<span class="wp ' + (chg >= 0 ? 'up' : 'down') + '" data-wp="' + esc(s) + '">' +
        esc(fmt.price(mkt.price(s))) + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-sym]').forEach(function (r) {
      r.addEventListener('click', function () { go('detail', r.dataset.sym); });
    });
  }

  /* ══ search ══════════════════════════════════════════════ */
  var searchInput = $('#searchInput'), searchPop = $('#searchPop');
  function runSearch() {
    var q = searchInput.value.toLowerCase().trim();
    if (!q) { searchPop.classList.remove('open'); return; }
    var hits = M.COINS.filter(function (c) {
      return c.name.toLowerCase().indexOf(q) >= 0 || c.symbol.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8);
    if (!hits.length) {
      searchPop.innerHTML = '<div class="empty" style="padding:20px">No asset matches “' + esc(q) + '”.</div>';
    } else {
      searchPop.innerHTML = hits.map(function (c) {
        return '<div class="sp-row" data-sym="' + esc(c.symbol) + '">' + M.logo(c.symbol, 24) +
          '<div><div class="n">' + esc(c.name) + '</div><div class="s">' + esc(c.symbol) + '</div></div>' +
          '<div class="p">' + esc(fmt.price(mkt.price(c.symbol))) + '</div></div>';
      }).join('');
      searchPop.querySelectorAll('[data-sym]').forEach(function (r) {
        r.addEventListener('click', function () {
          searchInput.value = '';
          searchPop.classList.remove('open');
          go('detail', r.dataset.sym);
        });
      });
    }
    searchPop.classList.add('open');
  }
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', runSearch);
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) searchPop.classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchInput &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  /* ══ live feed ═══════════════════════════════════════════ */
  function connectStream() {
    if (es) { es.close(); es = null; }
    es = new EventSource('/api/stream', { withCredentials: true });

    es.addEventListener('hello', function (ev) {
      var d = JSON.parse(ev.data);
      mkt.seedFrom(d.p, d.t);
      onTick(null, d.t);
    });
    es.addEventListener('tick', function (ev) {
      if (state.paused) return;
      var d = JSON.parse(ev.data);
      mkt.ingest(d.p, d.t);
    });
    es.onerror = function () {
      $('#footDot').style.background = 'var(--gold)';
      $('#tickCounter').textContent = 'RECONNECTING';
      // EventSource reconnects on its own; if the session is gone the next
      // /api/session check will bounce us to the sign-in page.
      api.session().then(function (s) {
        if (!s.authenticated) window.location.replace('/');
      }).catch(function () { /* offline */ });
    };
    es.onopen = function () {
      $('#footDot').style.background = '';
      $('#tickCounter').textContent = 'LIVE';
    };
  }

  $('#livePill').addEventListener('click', function () {
    state.paused = !state.paused;
    $('#livePill').classList.toggle('paused', state.paused);
    $('#livePill').querySelector('span:last-child').textContent = state.paused ? 'Paused' : 'Live';
  });

  var flashTimer = null;
  function onTick(syms, n) {
    var t = total();
    var last = state.lastTotal == null ? t : state.lastTotal;
    var up = t >= last;
    state.lastTotal = t;

    var bal = $('#balance');
    if (!profile().hideBalance) animateNumber(bal, last, t, 520, moneyMarkup);
    else bal.textContent = '••••••••';

    var hero = $('#hero');
    bal.classList.remove('up', 'down');
    hero.classList.remove('flash-up', 'flash-down');
    void bal.offsetWidth;
    bal.classList.add(up ? 'up' : 'down');
    hero.classList.add(up ? 'flash-up' : 'flash-down');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      bal.classList.remove('up', 'down');
      hero.classList.remove('flash-up', 'flash-down');
    }, 620);

    heroChart.setData(portfolioSeries(state.heroTf));
    updateHeroDelta();

    Object.keys(priceCells).forEach(function (sym) {
      var px = mkt.price(sym);
      var rising = px >= mkt.prev(sym);
      priceCells[sym].forEach(function (node) {
        if (!document.contains(node)) return;
        node.textContent = fmt.price(px);
        node.classList.remove('tick-up', 'tick-down');
        void node.offsetWidth;
        node.classList.add(rising ? 'tick-up' : 'tick-down');
      });
    });
    Object.keys(chgCells).forEach(function (sym) {
      chgCells[sym].forEach(function (node) {
        if (!document.contains(node)) return;
        var v = mkt.change(sym, node.dataset.chg.split('|')[1]);
        node.textContent = fmt.pct(v);
        node.classList.toggle('up', v >= 0);
        node.classList.toggle('down', v < 0);
      });
    });
    Object.keys(sparkNodes).forEach(function (sym) {
      sparkNodes[sym].forEach(function (svg) {
        if (!document.contains(svg)) return;
        var path = svg.querySelector('path');
        path.setAttribute('d', M.sparkPath(mkt.sparkline(sym), 116, 34));
        path.setAttribute('stroke', mkt.change(sym, '1D') >= 0 ? 'var(--up)' : 'var(--down)');
      });
    });

    $$('[data-val]').forEach(function (n2) {
      n2.textContent = fmt.money((me.holdings[n2.dataset.val] || 0) * mkt.price(n2.dataset.val));
    });
    $$('[data-wp]').forEach(function (n2) {
      var sym = n2.dataset.wp;
      var chg = mkt.change(sym, '1D');
      n2.textContent = fmt.price(mkt.price(sym));
      n2.classList.toggle('up', chg >= 0);
      n2.classList.toggle('down', chg < 0);
    });

    if (state.view === 'detail' && state.detailSym) {
      var sym2 = state.detailSym;
      var dp = $('#dPrice');
      if (dp) {
        var rising2 = mkt.price(sym2) >= mkt.prev(sym2);
        dp.textContent = fmt.price(mkt.price(sym2));
        dp.style.color = rising2 ? 'var(--up)' : 'var(--down)';
        dp.style.textShadow = '0 0 28px ' + (rising2 ? 'rgba(0,227,155,.45)' : 'rgba(255,61,104,.45)');
      }
      var dc = $('#dChg');
      if (dc) {
        var v2 = mkt.change(sym2, state.detailTf);
        dc.textContent = fmt.pct(v2);
        dc.className = 'chg ' + (v2 >= 0 ? 'up' : 'down');
      }
      var dpos = $('#dPos');
      if (dpos) dpos.textContent = fmt.money((me.holdings[sym2] || 0) * mkt.price(sym2));
      pushDetailData();
      if (n % 4 === 0) renderDetailStats();
    }

    if (state.view === 'home' && n % 8 === 0) { renderHomeStats(); renderMovers(); }
    if (state.view === 'assets' && n % 8 === 0) renderAssets();

    $('#tickCounter').textContent = 'LIVE · ' + n;

    if (n % 45 === 0) {
      var big = M.COINS.map(function (c) { return { c: c, v: mkt.change(c.symbol, '1H') }; })
        .sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); })[0];
      if (big && Math.abs(big.v) > 2.5) {
        toast(big.v > 0 ? 'trendUp' : 'trendDown',
          big.c.symbol + ' ' + fmt.pct(big.v, 1) + ' in the last hour',
          fmt.price(mkt.price(big.c.symbol)), big.v > 0 ? 'good' : 'bad');
      }
    }
  }

  /* ══ boot ════════════════════════════════════════════════ */
  function paintStaticIcons() {
    $$('[data-icon]').forEach(function (n) {
      var size = n.classList.contains('search-ic') ? 15 : 18;
      n.innerHTML = icon(n.dataset.icon, size);
    });
    $('#brandMark').innerHTML = M.markSVG();
    $('#bootMark').innerHTML = M.markSVG();
    $('#signOutBtn').innerHTML = icon('logout', 14);
  }

  async function boot() {
    paintStaticIcons();

    var s;
    try {
      s = await api.session();
    } catch (err) {
      $('#boot').innerHTML = '<p>Cannot reach the server. <a href="/">Retry</a></p>';
      return;
    }
    if (!s.authenticated) { window.location.replace('/'); return; }

    api.setCsrf(s.csrf);
    me = s.user;

    mkt.init();
    applyAccent();
    renderIdentity();
    initHero();
    initMarketFilters();
    initVaultFilters();
    renderWatchMini();
    state.lastTotal = total();
    $('#balance').innerHTML = moneyMarkup(total());
    heroChart.setData(portfolioSeries(state.heroTf));
    updateHeroDelta();

    $('#boot').hidden = true;
    $('#shell').hidden = false;
    $('#mobileNav').hidden = false;

    go(state.view || 'home');
    connectStream();

    setTimeout(function () {
      toast('sparkle', 'Welcome back, ' + profile().name.split(' ')[0],
        M.badges.total + ' badges unlocked · feed is live', 'good');
    }, 700);
  }

  window.addEventListener('pagehide', function () { if (es) es.close(); });
  boot();
})();
