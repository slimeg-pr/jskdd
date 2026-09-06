/* Monéta — standalone build.
   The same portal, running without the Node server behind it. This module
   supplies the two seams portal.js talks through — `Moneta.api` for state
   and `Moneta.feed` for prices — so every view above them is unchanged.

   State lives in the artifact's server-side document store when the runtime
   grants it, so a portfolio built on a phone is there on a laptop. When the
   store is unavailable the app still runs, in memory, and says so.

   What the server build has and this one cannot:
     - passwords. Access is whoever the artifact is shared with; a static
       page cannot verify a credential, and a fake login would be theatre.
     - server-priced fills. The market engine runs in the page here, so a
       determined viewer could price their own trade. It is a simulation
       with no money in it, and the honest note is in the README.
     - avatar image upload. No blob store, so the sigil set is the offer. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};

  M.build = { auth: false, uploads: false, standalone: true };

  var DOC = 'state/portfolio';
  var SCHEMA = 1;

  /* ── the same allow-lists the server enforces ── */
  var TITLES = [
    'Obsidian Sovereign', 'Vault Keeper', 'Neon Whale', 'Portal Warden',
    'Chain Cartographer', 'Liquidity Wraith', 'Candle Reader', 'Deep Index Diver',
    'Violet Signal', 'Glasswalker', 'The Watcher', 'Market Force',
    'Silent Accumulator', 'Diamond Custodian', 'Night Trader', 'Founding Member'
  ];
  var BANNERS = ['obsidian', 'nebula', 'aurora', 'ember', 'voidglass', 'ultra', 'goldleaf', 'circuit'];
  var SIGILS = ['crown', 'diamond', 'hex', 'orbit', 'spiral', 'sparkle', 'moon', 'flame',
    'wave2', 'void', 'cube', 'gem', 'infinity', 'compass', 'monolith', 'galaxy',
    'whale', 'owl', 'ghost', 'shield'];
  var ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
  var CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
  var LIMITS = { name: 32, bio: 220, location: 40, handle: 24, showcase: 6 };

  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(CONTROL_RE, '').trim().slice(0, max);
  }
  function ApiError(msg) {
    var e = new Error(msg);
    e.name = 'ApiError';
    e.status = 400;
    return e;
  }

  /* ── default book ── */
  function defaultState() {
    var holdings = {};
    var weights = {
      BTC: 0.31, ETH: 0.19, SOL: 0.11, BNB: 0.05, XRP: 0.04, LINK: 0.035,
      AVAX: 0.03, DOGE: 0.028, ADA: 0.025, DOT: 0.02, TON: 0.018, SUI: 0.016
    };
    var book = 2847500;
    M.COINS.forEach(function (c, i) {
      var w = weights[c.symbol] != null ? weights[c.symbol] : 0.055 / (i + 1);
      holdings[c.symbol] = (book * w) / c.seed;
    });
    return {
      schema: SCHEMA,
      id: 'local',
      email: '',
      handle: 'operator',
      createdAt: Date.now(),
      profile: {
        name: 'Operator',
        title: TITLES[0],
        bio: '',
        location: '',
        accent: '#b14dff',
        banner: 'nebula',
        avatarKind: 'sigil',
        avatarSigil: SIGILS[Math.floor(Math.random() * SIGILS.length)],
        hideBalance: false,
        showcase: []
      },
      avatarUrl: null,
      cash: 184320.44,
      holdings: holdings,
      watchlist: ['BTC', 'ETH', 'SOL', 'LINK', 'DOGE'],
      stats: { trades: 0, wins: 0, streak: 1, opens: 1 }
    };
  }

  /* ── persistence ── */
  var db = null;
  var ref = null;
  var me = null;
  var saveTimer = null;
  var listeners = [];

  var lastKind = null;
  function onStorageChange(fn) {
    listeners.push(fn);
    // open() can settle before the page subscribes, so replay the last state.
    if (lastKind) fn(lastKind);
  }
  function announce(kind) {
    lastKind = kind;
    listeners.forEach(function (f) { f(kind); });
  }

  function heal(raw) {
    // A document written by an older build, or a hand-edited one, must not
    // be able to crash the page — rebuild anything missing or malformed.
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var out = base;
    out.id = raw.id || base.id;
    out.handle = str(raw.handle, LIMITS.handle) || base.handle;
    out.createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt;
    out.cash = Number.isFinite(raw.cash) && raw.cash >= 0 ? raw.cash : base.cash;

    if (raw.holdings && typeof raw.holdings === 'object') {
      M.COINS.forEach(function (c) {
        var q = raw.holdings[c.symbol];
        out.holdings[c.symbol] = Number.isFinite(q) && q >= 0 ? q : 0;
      });
    }
    if (Array.isArray(raw.watchlist)) {
      out.watchlist = raw.watchlist.filter(function (s) { return M.coin(s); }).slice(0, 40);
    }
    if (raw.stats && typeof raw.stats === 'object') {
      ['trades', 'wins', 'streak', 'opens'].forEach(function (k) {
        if (Number.isFinite(raw.stats[k])) out.stats[k] = raw.stats[k];
      });
    }
    var p = raw.profile;
    if (p && typeof p === 'object') {
      out.profile.name = str(p.name, LIMITS.name) || base.profile.name;
      out.profile.bio = str(p.bio, LIMITS.bio);
      out.profile.location = str(p.location, LIMITS.location);
      if (TITLES.indexOf(p.title) >= 0) out.profile.title = p.title;
      if (BANNERS.indexOf(p.banner) >= 0) out.profile.banner = p.banner;
      if (SIGILS.indexOf(p.avatarSigil) >= 0) out.profile.avatarSigil = p.avatarSigil;
      if (ACCENT_RE.test(p.accent)) out.profile.accent = String(p.accent).toLowerCase();
      out.profile.hideBalance = !!p.hideBalance;
      if (Array.isArray(p.showcase)) {
        out.profile.showcase = p.showcase
          .filter(function (x) { return typeof x === 'string' && /^[a-z0-9-]{1,80}$/.test(x); })
          .slice(0, LIMITS.showcase);
      }
    }
    return out;
  }

  function persist() {
    if (!ref) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      ref.set(JSON.parse(JSON.stringify(me))).then(function () {
        announce('saved');
      }).catch(function () {
        announce('error');
      });
    }, 400);
  }

  /** Resolve the store, load or seed the document. Never throws. */
  async function open() {
    try {
      db = global.claude && global.claude.use ? await global.claude.use('db') : null;
    } catch (e) { db = null; }

    if (!db) {
      me = defaultState();
      announce('ephemeral');
      return me;
    }
    try {
      ref = db.doc(DOC);
      var snap = await ref.get();
      if (snap && snap.exists) {
        me = heal(snap.data());
      } else {
        me = defaultState();
        await ref.set(JSON.parse(JSON.stringify(me)));
      }
      me.stats.opens = (me.stats.opens || 0) + 1;
      persist();
      announce('ready');
    } catch (e) {
      // Store reachable but refused (read-only viewer, policy): run in memory.
      ref = null;
      me = me || defaultState();
      announce('readonly');
    }
    return me;
  }

  /* ── the Moneta.api surface portal.js expects ── */
  function snapshot() { return JSON.parse(JSON.stringify(me)); }

  var api = {
    get csrf() { return null; },
    setCsrf: function () { /* no session to protect */ },

    session: async function () {
      if (!me) await open();
      return { authenticated: true, csrf: null, user: snapshot() };
    },
    state: async function () {
      return { user: snapshot(), tick: M.market.tickCount(), prices: M.market.snapshot() };
    },
    logout: async function () { return { ok: true }; },

    patchProfile: async function (patch) {
      var p = me.profile;
      if (patch.name !== undefined) {
        var n = str(patch.name, LIMITS.name);
        if (!n) throw ApiError('Display name cannot be empty.');
        p.name = n;
      }
      if (patch.handle !== undefined) {
        var h = str(patch.handle, LIMITS.handle).toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9_.]{1,22}[a-z0-9])$/.test(h)) {
          throw ApiError('Handles use letters, numbers, dots and underscores.');
        }
        me.handle = h;
      }
      if (patch.title !== undefined) {
        if (TITLES.indexOf(patch.title) < 0) throw ApiError('Unknown title.');
        p.title = patch.title;
      }
      if (patch.bio !== undefined) p.bio = str(patch.bio, LIMITS.bio);
      if (patch.location !== undefined) p.location = str(patch.location, LIMITS.location);
      if (patch.accent !== undefined) {
        if (!ACCENT_RE.test(String(patch.accent))) throw ApiError('Accent must be a #rrggbb colour.');
        p.accent = String(patch.accent).toLowerCase();
      }
      if (patch.banner !== undefined) {
        if (BANNERS.indexOf(patch.banner) < 0) throw ApiError('Unknown banner.');
        p.banner = patch.banner;
      }
      if (patch.avatarSigil !== undefined) {
        if (SIGILS.indexOf(patch.avatarSigil) < 0) throw ApiError('Unknown avatar.');
        p.avatarSigil = patch.avatarSigil;
        p.avatarKind = 'sigil';
      }
      if (patch.hideBalance !== undefined) p.hideBalance = !!patch.hideBalance;
      if (patch.showcase !== undefined) {
        if (!Array.isArray(patch.showcase)) throw ApiError('Showcase must be a list.');
        p.showcase = patch.showcase
          .filter(function (x) { return typeof x === 'string' && /^[a-z0-9-]{1,80}$/.test(x); })
          .slice(0, LIMITS.showcase);
      }
      persist();
      return { user: snapshot() };
    },

    toggleWatch: async function (symbol) {
      var sym = str(symbol, 12).toUpperCase();
      if (!M.coin(sym)) throw ApiError('Unknown asset.');
      var i = me.watchlist.indexOf(sym);
      if (i >= 0) me.watchlist.splice(i, 1);
      else {
        if (me.watchlist.length >= 40) throw ApiError('Watchlist is full.');
        me.watchlist.push(sym);
      }
      persist();
      return { watchlist: me.watchlist.slice(), watching: i < 0 };
    },

    trade: async function (symbol, side, usd) {
      var sym = str(symbol, 12).toUpperCase();
      if (!M.coin(sym)) throw ApiError('Unknown asset.');
      if (side !== 'buy' && side !== 'sell') throw ApiError('Side must be buy or sell.');
      var amount = Number(usd);
      if (!Number.isFinite(amount) || amount <= 0) throw ApiError('Enter an amount above zero.');
      if (amount > 1e15) throw ApiError('That order is too large.');

      var price = M.market.price(sym);
      if (!(price > 0)) throw ApiError('No price for that asset right now.');
      var units = amount / price;

      if (side === 'buy') {
        if (amount > me.cash + 1e-6) throw ApiError('Insufficient cash.');
        me.cash = Math.max(0, me.cash - amount);
        me.holdings[sym] = (me.holdings[sym] || 0) + units;
      } else {
        var have = me.holdings[sym] || 0;
        if (units > have + 1e-12) throw ApiError('You do not hold that much.');
        var left = have - units;
        me.holdings[sym] = left < 1e-12 ? 0 : left;
        me.cash += amount;
      }
      me.stats.trades = (me.stats.trades || 0) + 1;
      if (Math.random() > 0.35) me.stats.wins = (me.stats.wins || 0) + 1;
      persist();
      return {
        side: side, symbol: sym, units: units, price: price,
        cash: me.cash, holdings: me.holdings, stats: me.stats
      };
    },

    uploadAvatar: async function () { throw ApiError('Image upload needs the server build.'); },
    removeAvatar: async function () {
      me.profile.avatarKind = 'sigil';
      persist();
      return { user: snapshot() };
    }
  };

  /* ── local price feed ── */
  var timer = null;
  var feed = {
    connect: function (h) {
      feed.close();
      M.market.init();
      h.onHello(M.market.snapshot(), M.market.tickCount());
      h.onStatus(true);
      timer = setInterval(function () {
        M.market.tick();
        h.onTick(M.market.snapshot(), M.market.tickCount());
      }, M.market.TICK_MS);
    },
    close: function () { clearInterval(timer); timer = null; }
  };

  M.api = api;
  M.feed = feed;
  M.standalone = { open: open, onStorageChange: onStorageChange };
})(window);
