/* Monéta — market engine.
   Deterministic seeded history + a live random-walk tick loop.
   Simulated time runs fast: one tick == one chart minute, so the
   candles actually crawl while you watch them. */

(function (global) {
  'use strict';

  var M = global.Moneta = global.Moneta || {};

  var TICK_MS = 620;      // wall-clock between ticks
  var MINS_PER_DAY = 1440;
  var DAYS = 730;         // two years of daily closes

  /* ── deterministic PRNG ─────────────────────────────────── */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Box–Muller, folded into the PRNG
  function gauss(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ── per-asset state ────────────────────────────────────── */
  var state = {};   // symbol -> { mins:[], days:[], price, prev, open24, rnd, vol, ... }
  var listeners = [];
  var timer = null;
  var tickCount = 0;

  function buildSeries(coin) {
    var rnd = mulberry32(hash(coin.symbol + '::moneta'));
    var dailySigma = coin.vol * 0.036;          // daily stdev of log return
    var drift = (0.22 + rnd() * 0.85) * 0.0022;  // long-run trend, tilted up

    // ── two years of daily closes, walked backwards from the seed price
    var days = new Array(DAYS);
    var p = coin.seed;
    days[DAYS - 1] = p;
    for (var i = DAYS - 2; i >= 0; i--) {
      var r = drift + gauss(rnd) * dailySigma;
      // regime bursts — crypto doesn't move like a metronome
      if (rnd() < 0.012) r *= 3.4;
      p = p / Math.exp(r);
      days[i] = p;
    }
    // Pin the two-year trend: keep the walk's shape, but bend it so the
    // asset ends up on a deterministic multiple of where it started.
    var targetMult = 1.6 + rnd() * 6.4;
    var bend = Math.pow(targetMult / (days[DAYS - 1] / days[0]), 1 / (DAYS - 1));
    for (i = 0; i < DAYS; i++) days[i] *= Math.pow(bend, i);

    // Overlay a slow market cycle so the long charts have real peaks and
    // troughs — otherwise every asset would sit at its all-time high.
    var cycles = 1.3 + rnd() * 1.5;
    var amp = 0.16 + rnd() * 0.26;
    var phase = rnd() * Math.PI * 2;
    for (i = 0; i < DAYS; i++) {
      days[i] *= 1 + amp * Math.sin((i / DAYS) * Math.PI * 2 * cycles + phase);
    }

    // normalise so the final close is exactly the seed
    var scale = coin.seed / days[DAYS - 1];
    for (i = 0; i < DAYS; i++) days[i] *= scale;

    // ── last 24h at one-minute resolution, bridged from yesterday's close
    var minSigma = dailySigma / Math.sqrt(MINS_PER_DAY);
    var mins = new Array(MINS_PER_DAY);
    var start = days[DAYS - 2];
    var end = days[DAYS - 1];
    var q = start;
    for (i = 0; i < MINS_PER_DAY; i++) {
      q *= Math.exp(gauss(rnd) * minSigma * 1.25);
      // Brownian bridge pull toward the known close
      var w = i / (MINS_PER_DAY - 1);
      var target = start * Math.pow(end / start, w);
      q += (target - q) * 0.06;
      mins[i] = q;
    }
    mins[MINS_PER_DAY - 1] = end;

    return {
      symbol: coin.symbol,
      coin: coin,
      days: days,
      mins: mins,
      price: end,
      prev: end,
      minSigma: minSigma * 1.6,
      drift: drift / MINS_PER_DAY,
      minuteCursor: 0
    };
  }

  function init() {
    if (Object.keys(state).length) return;
    M.COINS.forEach(function (c) { state[c.symbol] = buildSeries(c); });
  }

  /* ── the live loop ──────────────────────────────────────── */
  function tick() {
    tickCount++;
    var moved = [];
    M.COINS.forEach(function (c) {
      var s = state[c.symbol];
      var r = s.drift + (Math.random() * 2 - 1) * s.minSigma * 1.35;
      if (Math.random() < 0.02) r *= 4.2;                 // spike
      if (Math.random() < 0.004) r = -Math.abs(r) * 5.5;  // flush
      s.prev = s.price;
      s.price = Math.max(s.price * Math.exp(r), s.coin.seed * 0.02);

      s.mins.push(s.price);
      if (s.mins.length > MINS_PER_DAY) s.mins.shift();

      s.minuteCursor++;
      if (s.minuteCursor >= 60) {         // roll a new "day" every 60 ticks
        s.minuteCursor = 0;
        s.days.push(s.price);
        if (s.days.length > DAYS) s.days.shift();
      } else {
        s.days[s.days.length - 1] = s.price;
      }
      moved.push(c.symbol);
    });
    for (var i = 0; i < listeners.length; i++) listeners[i](moved, tickCount);
  }

  function start() {
    init();
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }
  function stop() { clearInterval(timer); timer = null; }

  /* ── reads ──────────────────────────────────────────────── */
  function price(sym) { var s = state[sym]; return s ? s.price : 0; }
  function prev(sym) { var s = state[sym]; return s ? s.prev : 0; }

  var TF = {
    '1H':  { from: 'mins', span: 60,            points: 60,  label: 'past hour' },
    '1D':  { from: 'mins', span: MINS_PER_DAY,  points: 220, label: 'past day' },
    '1W':  { from: 'days', span: 7,             points: 168, label: 'past week' },
    '1M':  { from: 'days', span: 30,            points: 200, label: 'past month' },
    '1Y':  { from: 'days', span: 365,           points: 240, label: 'past year' },
    'ALL': { from: 'days', span: DAYS,          points: 280, label: 'all time' }
  };

  /** Down-sampled price series for a timeframe. Returns a plain number[]. */
  function series(sym, tf) {
    var s = state[sym];
    if (!s) return [];
    var cfg = TF[tf] || TF['1D'];
    var src = cfg.from === 'mins' ? s.mins : s.days;
    var slice = src.slice(Math.max(0, src.length - cfg.span));

    // 1W needs sub-daily shape — splice the minute tape onto the tail
    if (tf === '1W') {
      var head = s.days.slice(Math.max(0, s.days.length - 7), s.days.length - 1);
      var tail = s.mins.filter(function (_, i) { return i % 8 === 0; });
      slice = head.concat(tail);
    }
    if (slice.length <= cfg.points) return slice.slice();

    var step = slice.length / cfg.points;
    var out = new Array(cfg.points);
    for (var i = 0; i < cfg.points; i++) out[i] = slice[Math.floor(i * step)];
    out[cfg.points - 1] = slice[slice.length - 1];
    return out;
  }

  /** Percentage change over a timeframe. */
  function change(sym, tf) {
    var a = series(sym, tf || '1D');
    if (a.length < 2) return 0;
    return (a[a.length - 1] - a[0]) / a[0] * 100;
  }

  function sparkline(sym) {
    var s = state[sym];
    if (!s) return [];
    var src = s.mins;
    var out = [];
    for (var i = src.length - 240; i < src.length; i += 4) out.push(src[Math.max(0, i)]);
    return out;
  }

  /** OHLC buckets for a timeframe — used by the candlestick view. */
  function candles(sym, tf, count) {
    var s = state[sym];
    if (!s) return [];
    var cfg = TF[tf] || TF['1D'];
    var src = cfg.from === 'mins' ? s.mins : s.days;
    var raw = src.slice(Math.max(0, src.length - cfg.span));
    var n = Math.min(count || 60, raw.length);
    var size = Math.max(1, Math.floor(raw.length / n));
    var out = [];
    for (var i = 0; i < raw.length; i += size) {
      var chunk = raw.slice(i, i + size);
      if (!chunk.length) continue;
      out.push({
        o: chunk[0],
        c: chunk[chunk.length - 1],
        h: Math.max.apply(null, chunk),
        l: Math.min.apply(null, chunk)
      });
    }
    return out;
  }

  function marketCap(sym) { return price(sym) * (M.coin(sym).supply || 0); }
  function volume24(sym) {
    var c = M.coin(sym);
    var turn = 0.018 + c.vol * 0.021 + (hash(sym) % 100) / 4200;
    return marketCap(sym) * turn;
  }
  function high24(sym) { return Math.max.apply(null, state[sym].mins); }
  function low24(sym) { return Math.min.apply(null, state[sym].mins); }
  function allTimeHigh(sym) { return Math.max.apply(null, state[sym].days); }

  M.market = {
    TICK_MS: TICK_MS,
    TF: TF,
    init: init,
    start: start,
    stop: stop,
    tick: tick,
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    price: price,
    prev: prev,
    series: series,
    candles: candles,
    change: change,
    sparkline: sparkline,
    marketCap: marketCap,
    volume24: volume24,
    high24: high24,
    low24: low24,
    ath: allTimeHigh
  };
})(window);
