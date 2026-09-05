/* Monéta — portal application.
   Views, live wiring, trading, the vault and profile customisation. */

(function () {
  'use strict';
  var M = window.Moneta;
  var $ = M.dom.$, $$ = M.dom.$$, esc = M.dom.esc;
  var fmt = M.fmt;
  var mkt = M.market;

  /* ── gate check ─────────────────────────────────────────── */
  if (!M.store.gate.isOpen()) {
    window.location.replace('index.html');
    return;
  }

  var S = M.store.get();
  var P = S.profile;

  mkt.init();
  mkt.start();

  var state = {
    view: 'home',
    heroTf: '1D',
    detailSym: null,
    detailTf: '1D',
    detailMode: 'area',
    marketFilter: 'all',
    marketSort: { key: 'rank', dir: 1 },
    assetsSort: 'value',
    vaultTiers: {},
    vaultCat: 'All',
    vaultQuery: '',
    vaultShown: 120,
    lastTotal: null,
    tradeSide: 'buy'
  };
  M.badges.tiers.forEach(function (t) { state.vaultTiers[t.key] = true; });

  /* ── portfolio maths ────────────────────────────────────── */
  function holdingsValue() {
    var v = 0;
    for (var sym in S.holdings) v += S.holdings[sym] * mkt.price(sym);
    return v;
  }
  function total() { return holdingsValue() + S.cash; }

  function portfolioSeries(tf) {
    var syms = Object.keys(S.holdings).filter(function (s) { return S.holdings[s] > 0; });
    if (!syms.length) return [S.cash, S.cash];
    var parts = syms.map(function (s) { return { q: S.holdings[s], a: mkt.series(s, tf) }; });
    var n = parts.reduce(function (m, p) { return Math.min(m, p.a.length); }, Infinity);
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var v = S.cash;
      for (var j = 0; j < parts.length; j++) v += parts[j].q * parts[j].a[parts[j].a.length - n + i];
      out[i] = v;
    }
    return out;
  }

  function positions() {
    return M.COINS.map(function (c) {
      var q = S.holdings[c.symbol] || 0;
      return { coin: c, qty: q, value: q * mkt.price(c.symbol), chg: mkt.change(c.symbol, '1D') };
    }).filter(function (p) { return p.qty > 0; });
  }

  /* ── number animation ───────────────────────────────────── */
  function animateNumber(node, from, to, dur, render) {
    if (node._anim) cancelAnimationFrame(node._anim);
    var t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      node.innerHTML = render(from + (to - from) * e);
      if (t < 1) node._anim = requestAnimationFrame(step);
      else node._anim = null;
    }
    node._anim = requestAnimationFrame(step);
  }

  function moneyMarkup(v) {
    if (P.hideBalance) return '••••••••';
    var s = fmt.money(v);
    var dot = s.lastIndexOf('.');
    return esc(s.slice(0, dot)) + '<span class="cents">' + esc(s.slice(dot)) + '</span>';
  }

  /* ── toasts ─────────────────────────────────────────────── */
  function toast(icon, title, sub, kind) {
    var wrap = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.innerHTML = '<span class="ti">' + icon + '</span><span><span class="tt">' +
      esc(title) + '</span><span class="ts">' + esc(sub || '') + '</span></span>';
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
    while (wrap.children.length > 4) wrap.firstChild.remove();
  }

  /* ── modal ──────────────────────────────────────────────── */
  var modalBack = $('#modalBack');
  function openModal(html) {
    $('#modal').innerHTML = html;
    modalBack.classList.add('open');
  }
  function closeModal() { modalBack.classList.remove('open'); }
  modalBack.addEventListener('click', function (e) { if (e.target === modalBack) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ── navigation ─────────────────────────────────────────── */
  var VIEWS = ['home', 'assets', 'markets', 'detail', 'vault', 'profile'];
  function go(view, arg) {
    state.view = view;
    VIEWS.forEach(function (v) { $('#view-' + v).hidden = v !== view; });
    $$('[data-nav]').forEach(function (b) {
      if (b.classList.contains('nav-item') || b.parentElement.id === 'mobileNav')
        b.classList.toggle('active', b.dataset.nav === view);
    });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
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

  $('#lockBtn').addEventListener('click', function () {
    openModal('<div class="mic" style="--bcol:var(--neon);--bglow:rgba(177,77,255,.5)">🔒</div>' +
      '<h3>Seal the portal?</h3><p>You will need the access key to get back in.</p>' +
      '<div class="row"><button class="btn" id="mCancel">Stay</button>' +
      '<button class="btn btn-primary" id="mLock">Lock it</button></div>');
    $('#mCancel').onclick = closeModal;
    $('#mLock').onclick = function () {
      M.store.gate.clear();
      window.location.href = 'index.html';
    };
  });

  /* ── timeframe rows ─────────────────────────────────────── */
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
  var heroChart = M.Chart($('#heroChart'), {
    autoColor: true,
    fmt: function (v) { return fmt.compact(v); }
  });

  $('#heroTf').replaceWith(tfRow(state.heroTf, function (t) {
    state.heroTf = t;
    heroChart.setData(portfolioSeries(t));
    updateHeroDelta();
  }));

  function updateHeroDelta() {
    var a = portfolioSeries(state.heroTf);
    var pct = a.length > 1 ? (a[a.length - 1] - a[0]) / a[0] * 100 : 0;
    var abs = a.length > 1 ? a[a.length - 1] - a[0] : 0;
    var d = $('#delta');
    d.classList.toggle('neg', pct < 0);
    d.innerHTML = '<svg><use href="#i-' + (pct >= 0 ? 'up' : 'down') + '"/></svg><span>' + fmt.pct(pct) + '</span>';
    $('#deltaAbs').textContent = (abs >= 0 ? '+' : '−') + fmt.money(Math.abs(abs)).replace('-', '') +
      ' · ' + (mkt.TF[state.heroTf] ? mkt.TF[state.heroTf].label : '');
  }

  $('#eyeBtn').addEventListener('click', function () {
    P.hideBalance = !P.hideBalance;
    M.store.save();
    $('#eyeBtn').innerHTML = '<svg><use href="#i-eye' + (P.hideBalance ? '-off' : '') + '"/></svg>';
    $('#balance').innerHTML = moneyMarkup(total());
  });

  function renderHomeStats() {
    var pos = positions();
    var best = pos.slice().sort(function (a, b) { return b.chg - a.chg; })[0];
    var worst = pos.slice().sort(function (a, b) { return a.chg - b.chg; })[0];
    var winRate = S.stats.trades ? (S.stats.wins / S.stats.trades * 100) : 0;
    $('#homeStats').innerHTML = [
      card('Cash balance', fmt.money(S.cash), 'available to deploy'),
      card('Positions', String(pos.length), 'of ' + M.COINS.length + ' listed assets'),
      best ? card('Best performer', best.coin.symbol + ' ' + fmt.pct(best.chg),
        fmt.money(best.value) + ' held', best.chg >= 0 ? 'up' : 'down') : card('Best performer', '—', ''),
      worst ? card('Weakest', worst.coin.symbol + ' ' + fmt.pct(worst.chg),
        fmt.money(worst.value) + ' held', worst.chg >= 0 ? 'up' : 'down') : card('Weakest', '—', ''),
    ].join('');
    $('#navAssets').textContent = pos.length;
    $('#navMarkets').textContent = M.COINS.length;
    $('#navVault').textContent = M.badges.total;
    void winRate;
  }

  function card(k, v, sub, cls) {
    return '<div class="card hoverable"><div class="k">' + esc(k) + '</div>' +
      '<div class="v ' + (cls || '') + '">' + esc(v) + '</div>' +
      (sub ? '<div class="sub2">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderMovers() {
    var all = M.COINS.map(function (c) {
      return { c: c, chg: mkt.change(c.symbol, '1D') };
    }).sort(function (a, b) { return Math.abs(b.chg) - Math.abs(a.chg); }).slice(0, 4);
    $('#movers').innerHTML = all.map(function (m) {
      return '<div class="mover" data-sym="' + m.c.symbol + '">' + M.logo(m.c.symbol, 34) +
        '<div class="mi"><div class="mn">' + esc(m.c.name) + '</div>' +
        '<div class="mp">' + esc(fmt.price(mkt.price(m.c.symbol))) + '</div></div>' +
        '<div class="mc ' + (m.chg >= 0 ? 'up' : 'down') + '">' + fmt.pct(m.chg, 1) + '</div></div>';
    }).join('');
  }

  function renderShowcase() {
    var ids = P.showcase || [];
    var list = ids.map(function (id) { return M.badges.get(id); }).filter(Boolean);
    if (!list.length) list = M.badges.all.slice(0, 6);
    $('#showcaseStrip').innerHTML = list.map(badgeTile).join('');
  }

  /* ── shared table renderers ─────────────────────────────── */
  var priceCells = {};   // symbol -> [nodes]
  var chgCells = {};
  var sparkNodes = {};

  function trackCell(map, sym, node) {
    if (!map[sym]) map[sym] = [];
    map[sym].push(node);
  }

  function clearTracking(scopeEl) {
    [priceCells, chgCells, sparkNodes].forEach(function (map) {
      Object.keys(map).forEach(function (k) {
        map[k] = map[k].filter(function (n) { return !scopeEl.contains(n) && document.contains(n); });
        if (!map[k].length) delete map[k];
      });
    });
  }

  function rowHTML(c, opts) {
    opts = opts || {};
    var price = mkt.price(c.symbol);
    var c1 = mkt.change(c.symbol, '1H');
    var c24 = mkt.change(c.symbol, '1D');
    var c7 = mkt.change(c.symbol, '1W');
    var watched = S.watchlist.indexOf(c.symbol) >= 0;
    var qty = S.holdings[c.symbol] || 0;
    var cells = '';

    cells += '<td class="l rank">' + c.rank + '</td>';
    cells += '<td class="l"><div class="cell-coin">' + M.logo(c.symbol, 28) +
      '<div><div class="nm">' + esc(c.name) + '</div><div class="sym">' + esc(c.symbol) + '</div></div></div></td>';
    cells += '<td><span class="px" data-px="' + c.symbol + '">' + esc(fmt.price(price)) + '</span></td>';

    if (opts.holdings) {
      cells += '<td class="mono">' + esc(fmt.qty(qty)) + ' <span style="color:var(--text-4)">' + esc(c.symbol) + '</span></td>';
      cells += '<td class="mono" data-val="' + c.symbol + '">' + esc(fmt.money(qty * price)) + '</td>';
    }
    cells += '<td><span class="chg ' + (c1 >= 0 ? 'up' : 'down') + '" data-chg="' + c.symbol + '|1H">' + fmt.pct(c1) + '</span></td>';
    cells += '<td><span class="chg ' + (c24 >= 0 ? 'up' : 'down') + '" data-chg="' + c.symbol + '|1D">' + fmt.pct(c24) + '</span></td>';
    if (!opts.compact) {
      cells += '<td><span class="chg ' + (c7 >= 0 ? 'up' : 'down') + '" data-chg="' + c.symbol + '|1W">' + fmt.pct(c7) + '</span></td>';
      cells += '<td class="mono" style="color:var(--text-2)">' + esc(fmt.compact(mkt.marketCap(c.symbol))) + '</td>';
      cells += '<td class="mono" style="color:var(--text-3)">' + esc(fmt.compact(mkt.volume24(c.symbol))) + '</td>';
    }
    cells += '<td>' + sparkSVG(c.symbol, c24 >= 0) + '</td>';
    cells += '<td><button class="star ' + (watched ? 'on' : '') + '" data-star="' + c.symbol +
      '" aria-label="Watch ' + esc(c.symbol) + '"><svg><use href="#i-star' + (watched ? '' : '-o') + '"/></svg></button></td>';

    return '<tr data-sym="' + c.symbol + '">' + cells + '</tr>';
  }

  function sparkSVG(sym, up) {
    var vals = mkt.sparkline(sym);
    var d = M.sparkPath(vals, 116, 34);
    var col = up ? 'var(--up)' : 'var(--down)';
    return '<svg class="spark" viewBox="0 0 116 34" preserveAspectRatio="none" data-spark="' + sym + '">' +
      '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function headHTML(cols) {
    return '<thead><tr>' + cols.map(function (c) {
      return '<th class="' + (c.l ? 'l' : '') + '"' + (c.key ? ' data-sort="' + c.key + '"' : '') + '>' + c.t + '</th>';
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
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var sym = b.dataset.star;
        var on = M.store.toggleWatch(sym);
        b.classList.toggle('on', on);
        b.innerHTML = '<svg><use href="#i-star' + (on ? '' : '-o') + '"/></svg>';
        renderWatchMini();
        toast(on ? '⭐' : '☆', on ? 'Added to watchlist' : 'Removed from watchlist', sym);
      });
    });
    tbl.querySelectorAll('[data-px]').forEach(function (n) { trackCell(priceCells, n.dataset.px, n); });
    tbl.querySelectorAll('[data-chg]').forEach(function (n) { trackCell(chgCells, n.dataset.chg.split('|')[0], n); });
    tbl.querySelectorAll('[data-spark]').forEach(function (n) { trackCell(sparkNodes, n.dataset.spark, n); });
  }

  function renderHoldingsTable(tbl, limit) {
    clearTracking(tbl);
    var pos = positions().sort(function (a, b) { return b.value - a.value; });
    if (limit) pos = pos.slice(0, limit);
    tbl.innerHTML = headHTML([
      { t: '#', l: 1 }, { t: 'Asset', l: 1 }, { t: 'Price' }, { t: 'Holdings' },
      { t: 'Value' }, { t: '1h' }, { t: '24h' }, { t: '7d' }, { t: 'Mkt cap' },
      { t: 'Volume' }, { t: 'Last 4h' }, { t: '' }
    ]) + '<tbody>' + pos.map(function (p) { return rowHTML(p.coin, { holdings: true }); }).join('') + '</tbody>';
    wireTable(tbl);
  }

  /* ══ MY ASSETS ═══════════════════════════════════════════ */
  $('#assetsFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sort]');
    if (!b) return;
    $$('#assetsFilters .chip').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    state.assetsSort = b.dataset.sort;
    renderAssets();
  });

  function renderAssets() {
    var pos = positions();
    if (state.assetsSort === 'value') pos.sort(function (a, b) { return b.value - a.value; });
    if (state.assetsSort === 'change') pos.sort(function (a, b) { return b.chg - a.chg; });
    if (state.assetsSort === 'alpha') pos.sort(function (a, b) { return a.coin.name.localeCompare(b.coin.name); });

    var hv = holdingsValue();
    var green = pos.filter(function (p) { return p.chg >= 0; }).length;
    $('#assetsSub').textContent = pos.length + ' open positions · ' + fmt.money(hv) + ' deployed';
    $('#assetsStats').innerHTML = [
      card('Deployed', fmt.money(hv), (hv / total() * 100).toFixed(1) + '% of book'),
      card('Cash', fmt.money(S.cash), (S.cash / total() * 100).toFixed(1) + '% of book'),
      card('In the green', green + ' / ' + pos.length, 'on the 24h window'),
      card('Largest position', pos.length ? pos.slice().sort(function (a, b) { return b.value - a.value; })[0].coin.symbol : '—',
        pos.length ? fmt.money(pos.slice().sort(function (a, b) { return b.value - a.value; })[0].value) : '')
    ].join('');

    var tbl = $('#assetsTable');
    clearTracking(tbl);
    tbl.innerHTML = headHTML([
      { t: '#', l: 1 }, { t: 'Asset', l: 1 }, { t: 'Price' }, { t: 'Holdings' },
      { t: 'Value' }, { t: '1h' }, { t: '24h' }, { t: '7d' }, { t: 'Mkt cap' },
      { t: 'Volume' }, { t: 'Last 4h' }, { t: '' }
    ]) + '<tbody>' + pos.map(function (p) { return rowHTML(p.coin, { holdings: true }); }).join('') + '</tbody>';
    wireTable(tbl);
  }

  /* ══ MARKETS ═════════════════════════════════════════════ */
  function marketTags() {
    var t = { all: 1, watchlist: 1 };
    M.COINS.forEach(function (c) { c.tags.forEach(function (x) { t[x] = 1; }); });
    return Object.keys(t);
  }

  $('#marketFilters').innerHTML = marketTags().map(function (t) {
    var label = t === 'all' ? 'All assets' : t === 'watchlist' ? '⭐ Watchlist' : t;
    return '<button class="chip' + (t === 'all' ? ' on' : '') + '" data-f="' + esc(t) + '">' + esc(label) + '</button>';
  }).join('');

  $('#marketFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]');
    if (!b) return;
    $$('#marketFilters .chip').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    state.marketFilter = b.dataset.f;
    renderMarketTable();
  });

  function marketRows() {
    var rows = M.COINS.slice();
    if (state.marketFilter === 'watchlist') {
      rows = rows.filter(function (c) { return S.watchlist.indexOf(c.symbol) >= 0; });
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
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return rows;
  }

  function renderMarketTable() {
    var tbl = $('#marketTable');
    clearTracking(tbl);
    var arrow = function (k) {
      return state.marketSort.key === k ? '<span class="arrow">' + (state.marketSort.dir > 0 ? '▲' : '▼') + '</span>' : '';
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
        else state.marketSort = { key: k, dir: k === 'rank' || k === 'name' ? 1 : -1 };
        renderMarketTable();
      });
    });
  }

  /* ══ ASSET DETAIL ════════════════════════════════════════ */
  var detailChart = null;

  function renderDetail(sym) {
    if (sym) state.detailSym = sym;
    sym = state.detailSym;
    if (!sym) { go('markets'); return; }
    var c = M.coin(sym);
    var price = mkt.price(sym);
    var chg = mkt.change(sym, state.detailTf);
    var qty = S.holdings[sym] || 0;
    var watched = S.watchlist.indexOf(sym) >= 0;

    $('#detailBody').innerHTML =
      '<div class="page-head">' +
        '<div class="asset-head">' + M.logo(sym, 52) +
          '<div><div class="ah-name">' + esc(c.name) + ' <span class="ah-sym">' + esc(sym) + '</span></div>' +
          '<div class="asset-price" id="dPrice">' + esc(fmt.price(price)) + '</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span class="chg ' + (chg >= 0 ? 'up' : 'down') + '" id="dChg" style="font-size:16px">' + fmt.pct(chg) + '</span>' +
          '<button class="btn" id="dWatch">' + (watched ? '★ Watching' : '☆ Watch') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid" style="grid-template-columns:minmax(0,2.1fr) minmax(280px,1fr);gap:16px" id="dGrid">' +
        '<div class="panel" style="padding:18px">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">' +
            '<div id="dTf"></div>' +
            '<div class="seg" style="max-width:190px">' +
              '<button data-mode="area" class="' + (state.detailMode === 'area' ? 'on' : '') + '" style="' + (state.detailMode === 'area' ? 'background:var(--neon-ghost);color:#fff' : '') + '">Area</button>' +
              '<button data-mode="candle" class="' + (state.detailMode === 'candle' ? 'on' : '') + '" style="' + (state.detailMode === 'candle' ? 'background:var(--neon-ghost);color:#fff' : '') + '">Candles</button>' +
            '</div>' +
          '</div>' +
          '<div class="detail-chart mt"><canvas id="dChart"></canvas><div class="crosshair-tip" id="dTip"></div></div>' +
        '</div>' +
        '<div class="trade">' +
          '<div class="seg">' +
            '<button data-side="buy" class="' + (state.tradeSide === 'buy' ? 'on' : '') + '">Buy</button>' +
            '<button data-side="sell" class="' + (state.tradeSide === 'sell' ? 'on' : '') + '">Sell</button>' +
          '</div>' +
          '<div class="amt-field"><span>$</span><input id="tradeAmt" type="text" inputmode="decimal" placeholder="0.00"></div>' +
          '<div class="quick">' +
            '<button data-q="0.25">25%</button><button data-q="0.5">50%</button>' +
            '<button data-q="0.75">75%</button><button data-q="1">Max</button>' +
          '</div>' +
          '<div style="margin-top:14px;font-size:12px;color:var(--text-3);line-height:1.9">' +
            '<div style="display:flex;justify-content:space-between"><span>You own</span><b class="mono" style="color:var(--text)">' + esc(fmt.qty(qty)) + ' ' + esc(sym) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span>Position value</span><b class="mono" style="color:var(--text)" id="dPos">' + esc(fmt.money(qty * price)) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span>Cash available</span><b class="mono" style="color:var(--text)" id="dCash">' + esc(fmt.money(S.cash)) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span>Est. units</span><b class="mono" style="color:var(--text)" id="dUnits">0</b></div>' +
          '</div>' +
          '<button class="btn btn-primary" id="tradeGo" style="width:100%;margin-top:16px;padding:13px">Buy ' + esc(sym) + '</button>' +
          '<p style="font-size:10.5px;color:var(--text-4);margin:12px 0 0;text-align:center;letter-spacing:.08em">SIMULATED ORDER · NO REAL FUNDS</p>' +
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
        $$('#detailBody [data-mode]').forEach(function (x) {
          var on = x.dataset.mode === state.detailMode;
          x.style.cssText = on ? 'background:var(--neon-ghost);color:#fff' : '';
        });
        detailChart.setMode(state.detailMode);
        pushDetailData();
      });
    });

    $('#dWatch').addEventListener('click', function () {
      var on = M.store.toggleWatch(sym);
      $('#dWatch').textContent = on ? '★ Watching' : '☆ Watch';
      renderWatchMini();
    });

    wireTrade(sym);
  }

  function pushDetailData() {
    if (!detailChart || !state.detailSym) return;
    var s = mkt.series(state.detailSym, state.detailTf);
    var cd = state.detailMode === 'candle' ? mkt.candles(state.detailSym, state.detailTf, 64) : null;
    detailChart.setData(s, cd);
  }

  function renderDetailStats() {
    var sym = state.detailSym;
    if (!sym || !$('#dStats')) return;
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
    $('#dStats').innerHTML = rows.map(function (r) {
      var cls = /^[+−]/.test(r[1]) ? (r[1][0] === '+' ? 'up' : 'down') : '';
      return '<div><div class="k">' + esc(r[0]) + '</div><div class="v ' + cls + '">' + esc(r[1]) + '</div></div>';
    }).join('');
  }

  function about(c) {
    return c.name + ' (' + c.symbol + ') trades on the Monéta terminal as a ' +
      c.tags.join(' / ').toLowerCase() + ' asset, currently ranked #' + c.rank +
      ' by simulated market capitalisation. Every price on this page comes from ' +
      'Monéta’s local market engine — a seeded random walk with volatility tuned per asset. ' +
      'Nothing here touches a real exchange, and no real funds are ever at risk.';
  }

  function wireTrade(sym) {
    var amt = $('#tradeAmt');
    var go2 = $('#tradeGo');
    function refreshSide() {
      $$('#detailBody [data-side]').forEach(function (b) {
        b.classList.toggle('on', b.dataset.side === state.tradeSide);
      });
      go2.textContent = (state.tradeSide === 'buy' ? 'Buy ' : 'Sell ') + sym;
      go2.style.background = state.tradeSide === 'buy'
        ? 'linear-gradient(135deg,#0b8a63,#00e39b)'
        : 'linear-gradient(135deg,#a01337,#ff3d68)';
      go2.style.color = state.tradeSide === 'buy' ? '#04120d' : '#fff';
      updateUnits();
    }
    function updateUnits() {
      var v = parseFloat(amt.value) || 0;
      $('#dUnits').textContent = fmt.qty(v / mkt.price(sym)) + ' ' + sym;
    }
    $$('#detailBody [data-side]').forEach(function (b) {
      b.addEventListener('click', function () { state.tradeSide = b.dataset.side; refreshSide(); });
    });
    $$('#detailBody [data-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = parseFloat(b.dataset.q);
        var pool = state.tradeSide === 'buy' ? S.cash : (S.holdings[sym] || 0) * mkt.price(sym);
        amt.value = (pool * f).toFixed(2);
        updateUnits();
      });
    });
    amt.addEventListener('input', updateUnits);

    go2.addEventListener('click', function () {
      var usd = parseFloat(amt.value) || 0;
      if (usd <= 0) { toast('⚠️', 'Enter an amount', 'The order needs a size.', 'bad'); return; }
      var px = mkt.price(sym);
      var units = usd / px;
      if (state.tradeSide === 'buy') {
        if (usd > S.cash + 0.005) { toast('⛔', 'Insufficient cash', 'You have ' + fmt.money(S.cash) + ' available.', 'bad'); return; }
        S.cash -= usd;
        S.holdings[sym] = (S.holdings[sym] || 0) + units;
        toast('🟢', 'Bought ' + fmt.qty(units) + ' ' + sym, 'Filled at ' + fmt.price(px), 'good');
      } else {
        var have = S.holdings[sym] || 0;
        if (units > have + 1e-12) { toast('⛔', 'Not enough ' + sym, 'You hold ' + fmt.qty(have) + '.', 'bad'); return; }
        S.holdings[sym] = have - units;
        S.cash += usd;
        toast('🔴', 'Sold ' + fmt.qty(units) + ' ' + sym, 'Filled at ' + fmt.price(px), 'bad');
      }
      S.stats.trades++;
      if (Math.random() > 0.35) S.stats.wins++;
      M.store.save();
      amt.value = '';
      renderDetail(sym);
      renderWatchMini();
      heroChart.setData(portfolioSeries(state.heroTf));
    });
    refreshSide();
  }

  /* ══ VAULT ═══════════════════════════════════════════════ */
  function badgeTile(b, pinned) {
    var t = M.badges.tier(b.tier);
    return '<div class="badge' + (pinned ? ' pinned' : '') + '" data-badge="' + b.id +
      '" style="--bcol:' + t.color + ';--bglow:' + t.glow + '">' +
      '<div class="bcheck"><svg><use href="#i-check"/></svg></div>' +
      '<div class="bic">' + b.icon + '</div>' +
      '<div class="bn">' + esc(b.name) + '</div>' +
      '<div class="bt">' + esc(t.name) + '</div></div>';
  }

  function buildVaultFilters() {
    var counts = M.badges.counts();
    $('#tierFilters').innerHTML = M.badges.tiers.map(function (t) {
      return '<button class="tier-pill" data-tier="' + t.key + '" style="color:' + t.color + '">' +
        '<span class="dot"></span>' + t.name + ' <b style="opacity:.7">' + counts[t.key] + '</b></button>';
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
    $('#vaultSub').textContent = M.badges.total + ' badges · all unlocked · showing ' +
      shown.length + ' of ' + list.length;
    $('#vaultGrid').innerHTML = shown.map(function (b) {
      return badgeTile(b, (P.showcase || []).indexOf(b.id) >= 0);
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
    var pinned = (P.showcase || []).indexOf(b.id) >= 0;
    openModal(
      '<div class="mic" style="--bcol:' + t.color + ';--bglow:' + t.glow + '">' + b.icon + '</div>' +
      '<div class="bt" style="color:' + t.color + ';border:1px solid ' + t.color +
        ';display:inline-block;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;border-radius:99px;padding:3px 10px;margin-bottom:10px">' +
        esc(t.name) + ' · ' + esc(b.cat) + '</div>' +
      '<h3>' + esc(b.name) + '</h3>' +
      '<p>' + esc(b.desc) + '</p>' +
      '<p style="margin-top:12px;color:var(--up);font-weight:700;font-size:12px;letter-spacing:.1em">✓ UNLOCKED</p>' +
      '<div class="row"><button class="btn" id="mClose">Close</button>' +
      '<button class="btn btn-primary" id="mPin">' + (pinned ? 'Unpin from showcase' : 'Pin to showcase') + '</button></div>'
    );
    $('#mClose').onclick = closeModal;
    $('#mPin').onclick = function () {
      P.showcase = P.showcase || [];
      var i = P.showcase.indexOf(b.id);
      if (i >= 0) P.showcase.splice(i, 1);
      else {
        P.showcase.push(b.id);
        if (P.showcase.length > 6) P.showcase.shift();
      }
      M.store.save();
      closeModal();
      renderShowcase();
      if (state.view === 'vault') renderVault();
      if (state.view === 'profile') renderProfile();
      toast('📌', i >= 0 ? 'Unpinned' : 'Pinned to showcase', b.name);
    };
  });

  /* ══ PROFILE ═════════════════════════════════════════════ */
  function applyAccent() {
    document.documentElement.style.setProperty('--accent', P.accent);
  }

  function avatarHTML() {
    if (P.avatarType === 'image' && P.avatar) return '<img src="' + P.avatar + '" alt="">';
    return P.avatar || '🌑';
  }

  function renderIdentity() {
    $('#topAv').innerHTML = avatarHTML();
    $('#topName').textContent = P.name;
    $('#topHandle').textContent = '@' + P.handle;
    $('#greeting').textContent = P.name.split(' ')[0] + '’s portfolio';
  }

  function renderProfile() {
    var b = P.banner === 'custom' && P.bannerCustom ? P.bannerCustom : M.store.banner(P.banner).css;
    $('#profBanner').style.background = b;
    $('#profAv').innerHTML = avatarHTML();
    $('#profName').textContent = P.name;
    $('#profHandle').textContent = '@' + P.handle;
    $('#profTitle').textContent = P.title;
    $('#profBio').textContent = P.bio || '—';
    $('#profMeta').innerHTML =
      '<span><svg><use href="#i-map"/></svg>' + esc(P.location || 'Unknown') + '</span>' +
      '<span><svg><use href="#i-cal"/></svg>Joined ' +
        new Date(P.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</span>' +
      '<span><svg><use href="#i-badge"/></svg>' + M.badges.total + ' badges unlocked</span>';

    var pos = positions();
    $('#profStats').innerHTML = [
      card('Portfolio', P.hideBalance ? '••••••' : fmt.compact(total()), pos.length + ' positions'),
      card('Lifetime trades', S.stats.trades.toLocaleString('en-US'),
        (S.stats.wins / Math.max(1, S.stats.trades) * 100).toFixed(1) + '% profitable'),
      card('Day streak', String(S.stats.streak), 'consecutive sessions'),
      card('Badges', M.badges.total + ' / ' + M.badges.total, '100% complete')
    ].join('');

    var list = (P.showcase || []).map(function (id) { return M.badges.get(id); }).filter(Boolean);
    $('#profShowcase').innerHTML = list.length
      ? list.map(function (x) { return badgeTile(x, true); }).join('')
      : '<div class="empty">Nothing pinned yet — open the vault and pin up to six.</div>';

    fillEditor();
  }

  function fillEditor() {
    $('#fName').value = P.name;
    $('#fHandle').value = P.handle;
    $('#fLocation').value = P.location;
    $('#fBio').value = P.bio;
    $('#bioCount').textContent = (P.bio || '').length;

    var sel = $('#fTitle');
    if (!sel.options.length) {
      sel.innerHTML = M.store.TITLES.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join('');
    }
    sel.value = P.title;

    $('#emojiPicks').innerHTML = M.store.AVATARS.map(function (a) {
      return '<button class="emoji-pick' + (P.avatarType === 'emoji' && P.avatar === a ? ' on' : '') +
        '" data-emoji="' + a + '">' + a + '</button>';
    }).join('');

    $('#swatches').innerHTML = M.store.ACCENTS.map(function (c) {
      return '<button class="swatch' + (P.accent === c ? ' on' : '') + '" data-accent="' + c +
        '" style="background:' + c + ';color:' + c + '" aria-label="Accent ' + c + '"></button>';
    }).join('');
    $('#fAccentCustom').value = /^#[0-9a-f]{6}$/i.test(P.accent) ? P.accent : '#b14dff';

    $('#bannerPicks').innerHTML = M.store.BANNERS.map(function (b) {
      return '<button class="banner-pick' + (P.banner === b.id ? ' on' : '') + '" data-banner="' + b.id +
        '" style="background:' + b.css + '"><span>' + esc(b.name) + '</span></button>';
    }).join('');
  }

  $('#editToggle').addEventListener('click', function () {
    var p = $('#editPanel');
    p.hidden = !p.hidden;
    $('#editToggle').textContent = p.hidden ? 'Edit profile' : 'Close editor';
    if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#cancelProfile').addEventListener('click', function () {
    $('#editPanel').hidden = true;
    $('#editToggle').textContent = 'Edit profile';
  });

  function liveEdit(sel, key, after) {
    $(sel).addEventListener('input', function (e) {
      P[key] = e.target.value;
      M.store.save();
      if (after) after();
      renderProfileLight();
    });
  }
  function renderProfileLight() {
    $('#profName').textContent = P.name;
    $('#profHandle').textContent = '@' + P.handle;
    $('#profBio').textContent = P.bio || '—';
    $('#profTitle').textContent = P.title;
    renderIdentity();
  }
  liveEdit('#fName', 'name');
  liveEdit('#fHandle', 'handle');
  liveEdit('#fLocation', 'location', function () {
    $('#profMeta').firstElementChild.innerHTML =
      '<svg><use href="#i-map"/></svg>' + esc(P.location || 'Unknown');
  });
  $('#fBio').addEventListener('input', function (e) {
    P.bio = e.target.value;
    $('#bioCount').textContent = e.target.value.length;
    M.store.save();
    $('#profBio').textContent = P.bio || '—';
  });
  $('#fTitle').addEventListener('change', function (e) {
    P.title = e.target.value;
    M.store.save();
    $('#profTitle').textContent = P.title;
  });

  $('#emojiPicks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-emoji]');
    if (!b) return;
    P.avatar = b.dataset.emoji;
    P.avatarType = 'emoji';
    M.store.save();
    fillEditor();
    $('#profAv').innerHTML = avatarHTML();
    renderIdentity();
  });

  $('#fUpload').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 1.6 * 1024 * 1024) {
      toast('⚠️', 'Image too large', 'Keep it under 1.6 MB.', 'bad');
      return;
    }
    var r = new FileReader();
    r.onload = function () {
      P.avatar = r.result;
      P.avatarType = 'image';
      M.store.save();
      $('#profAv').innerHTML = avatarHTML();
      renderIdentity();
      toast('🖼️', 'Avatar updated', 'Stored locally in this browser.', 'good');
    };
    r.readAsDataURL(f);
  });

  $('#swatches').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accent]');
    if (!b) return;
    P.accent = b.dataset.accent;
    M.store.save();
    applyAccent();
    fillEditor();
  });
  $('#fAccentCustom').addEventListener('input', function (e) {
    P.accent = e.target.value;
    M.store.save();
    applyAccent();
    $$('#swatches .swatch').forEach(function (s) { s.classList.remove('on'); });
  });

  $('#bannerPicks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-banner]');
    if (!b) return;
    P.banner = b.dataset.banner;
    M.store.save();
    $('#profBanner').style.background = M.store.banner(P.banner).css;
    fillEditor();
  });

  $('#saveProfile').addEventListener('click', function () {
    M.store.save();
    renderProfile();
    renderIdentity();
    toast('✅', 'Profile saved', 'Stored locally in this browser.', 'good');
  });

  $('#resetBtn').addEventListener('click', function () {
    openModal('<div class="mic" style="--bcol:var(--down);--bglow:rgba(255,61,104,.5)">⚠️</div>' +
      '<h3>Reset everything?</h3><p>Profile, holdings, watchlist and showcase all go back to defaults.</p>' +
      '<div class="row"><button class="btn" id="mNo">Keep it</button>' +
      '<button class="btn btn-primary" id="mYes" style="background:linear-gradient(135deg,#a01337,#ff3d68)">Reset</button></div>');
    $('#mNo').onclick = closeModal;
    $('#mYes').onclick = function () {
      M.store.reset();
      window.location.reload();
    };
  });

  /* ══ watchlist rail ══════════════════════════════════════ */
  function renderWatchMini() {
    var el = $('#watchMini');
    el.innerHTML = (S.watchlist.length ? S.watchlist : ['BTC', 'ETH', 'SOL']).map(function (s) {
      var c = M.coin(s);
      if (!c) return '';
      var chg = mkt.change(s, '1D');
      return '<div class="watch-row" data-sym="' + s + '">' + M.logo(s, 20) +
        '<span class="ws">' + esc(s) + '</span>' +
        '<span class="wp ' + (chg >= 0 ? 'up' : 'down') + '" data-wp="' + s + '">' + esc(fmt.price(mkt.price(s))) + '</span></div>';
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
        return '<div class="sp-row" data-sym="' + c.symbol + '">' + M.logo(c.symbol, 24) +
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

  /* ══ live wiring ═════════════════════════════════════════ */
  var paused = false;
  $('#livePill').addEventListener('click', function () {
    paused = !paused;
    if (paused) mkt.stop(); else mkt.start();
    $('#livePill').classList.toggle('paused', paused);
    $('#livePill').querySelector('span:last-child').textContent = paused ? 'Paused' : 'Live';
  });

  var flashTimer = null;
  function onTick(syms, n) {
    S.stats.ticks = n;

    // ── balance
    var t = total();
    var last = state.lastTotal == null ? t : state.lastTotal;
    var up = t >= last;
    state.lastTotal = t;

    var bal = $('#balance');
    if (!P.hideBalance) animateNumber(bal, last, t, 520, moneyMarkup);
    else bal.textContent = '••••••••';

    bal.classList.remove('up', 'down');
    var hero = $('#hero');
    hero.classList.remove('flash-up', 'flash-down');
    void bal.offsetWidth;
    bal.classList.add(up ? 'up' : 'down');
    hero.classList.add(up ? 'flash-up' : 'flash-down');
    S.stats.flashes = (S.stats.flashes || 0) + 1;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      bal.classList.remove('up', 'down');
      hero.classList.remove('flash-up', 'flash-down');
    }, 620);

    heroChart.setData(portfolioSeries(state.heroTf));
    updateHeroDelta();

    // ── table cells
    Object.keys(priceCells).forEach(function (sym) {
      var px = mkt.price(sym), pv = mkt.prev(sym);
      var rising = px >= pv;
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
        var tf = node.dataset.chg.split('|')[1];
        var v = mkt.change(sym, tf);
        node.textContent = fmt.pct(v);
        node.classList.toggle('up', v >= 0);
        node.classList.toggle('down', v < 0);
      });
    });
    Object.keys(sparkNodes).forEach(function (sym) {
      sparkNodes[sym].forEach(function (svg) {
        if (!document.contains(svg)) return;
        var path = svg.querySelector('path');
        var chg = mkt.change(sym, '1D');
        path.setAttribute('d', M.sparkPath(mkt.sparkline(sym), 116, 34));
        path.setAttribute('stroke', chg >= 0 ? 'var(--up)' : 'var(--down)');
      });
    });

    // ── holdings value cells
    $$('[data-val]').forEach(function (n) {
      var sym = n.dataset.val;
      n.textContent = fmt.money((S.holdings[sym] || 0) * mkt.price(sym));
    });

    // ── watchlist rail
    $$('[data-wp]').forEach(function (n) {
      var sym = n.dataset.wp;
      var chg = mkt.change(sym, '1D');
      n.textContent = fmt.price(mkt.price(sym));
      n.classList.toggle('up', chg >= 0);
      n.classList.toggle('down', chg < 0);
    });

    // ── detail view
    if (state.view === 'detail' && state.detailSym) {
      var sym = state.detailSym;
      var dp = $('#dPrice');
      if (dp) {
        var rising2 = mkt.price(sym) >= mkt.prev(sym);
        dp.textContent = fmt.price(mkt.price(sym));
        dp.style.color = rising2 ? 'var(--up)' : 'var(--down)';
        dp.style.textShadow = '0 0 28px ' + (rising2 ? 'rgba(0,227,155,.45)' : 'rgba(255,61,104,.45)');
      }
      var dc = $('#dChg');
      if (dc) {
        var v = mkt.change(sym, state.detailTf);
        dc.textContent = fmt.pct(v);
        dc.className = 'chg ' + (v >= 0 ? 'up' : 'down');
      }
      var dpos = $('#dPos');
      if (dpos) dpos.textContent = fmt.money((S.holdings[sym] || 0) * mkt.price(sym));
      pushDetailData();
      if (n % 4 === 0) renderDetailStats();
    }

    if (state.view === 'home' && n % 8 === 0) { renderHomeStats(); renderMovers(); }
    if (state.view === 'assets' && n % 8 === 0) renderAssets();

    $('#tickCounter').textContent = 'LIVE · ' + n;

    // ── occasional market alerts
    if (n % 45 === 0) {
      var big = M.COINS.map(function (c) { return { c: c, v: mkt.change(c.symbol, '1H') }; })
        .sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); })[0];
      if (big && Math.abs(big.v) > 2.5) {
        toast(big.v > 0 ? '📈' : '📉', big.c.symbol + ' ' + fmt.pct(big.v, 1) + ' in the last hour',
          fmt.price(mkt.price(big.c.symbol)), big.v > 0 ? 'good' : 'bad');
      }
    }
    if (n % 90 === 0) M.store.save();
  }
  mkt.on(onTick);

  /* ══ boot ════════════════════════════════════════════════ */
  applyAccent();
  renderIdentity();
  buildVaultFilters();
  renderWatchMini();
  state.lastTotal = total();
  $('#balance').innerHTML = moneyMarkup(total());
  $('#eyeBtn').innerHTML = '<svg><use href="#i-eye' + (P.hideBalance ? '-off' : '') + '"/></svg>';
  heroChart.setData(portfolioSeries(state.heroTf));
  updateHeroDelta();
  go('home');

  setTimeout(function () {
    toast('🗝️', 'Welcome back, ' + P.name.split(' ')[0], M.badges.total + ' badges unlocked · feed is live', 'good');
  }, 700);

  window.addEventListener('beforeunload', function () { M.store.save(); });
})();
