/* Monéta — local persistence.
   Profile, holdings, watchlist and showcase all live in localStorage
   under one key so the portal survives a refresh. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};
  var KEY = 'moneta.state.v1';
  var GATE_KEY = 'moneta.gate.v1';

  var TITLES = [
    'Obsidian Sovereign', 'Vault Keeper', 'Neon Whale', 'Portal Warden',
    'Chain Cartographer', 'Liquidity Wraith', 'Candle Reader', 'Deep Index Diver',
    'Violet Signal', 'Glasswalker', 'The Watcher', 'Market Force',
    'Silent Accumulator', 'Diamond Custodian', 'Night Trader', 'Founding Member'
  ];

  var BANNERS = [
    { id: 'obsidian',  name: 'Obsidian',   css: 'linear-gradient(120deg,#0b0716,#2b1350 45%,#0b0716)' },
    { id: 'nebula',    name: 'Nebula',     css: 'linear-gradient(120deg,#160a2e,#7b2ff7 40%,#ff4d8d 78%,#160a2e)' },
    { id: 'aurora',    name: 'Aurora',     css: 'linear-gradient(120deg,#04121a,#00e39b 35%,#57d8ff 62%,#0b0716)' },
    { id: 'ember',     name: 'Ember',      css: 'linear-gradient(120deg,#1a0606,#ff3d68 42%,#ffb02e 75%,#1a0606)' },
    { id: 'voidglass', name: 'Void Glass', css: 'linear-gradient(120deg,#05040a,#241c3d 50%,#05040a)' },
    { id: 'ultra',     name: 'Ultraviolet',css: 'linear-gradient(120deg,#2d0a4e,#b14dff 50%,#57d8ff 100%)' },
    { id: 'goldleaf',  name: 'Gold Leaf',  css: 'linear-gradient(120deg,#150f04,#ffcb57 46%,#7b5a12 82%,#150f04)' },
    { id: 'circuit',   name: 'Circuit',    css: 'linear-gradient(120deg,#04100f,#0f766e 40%,#b14dff 88%,#04100f)' }
  ];

  var ACCENTS = ['#b14dff', '#8b5cf6', '#d946ef', '#ff4d8d', '#57d8ff',
                 '#00e39b', '#ffb02e', '#ff6b3d', '#7c9cff', '#00d4ff'];

  var AVATARS = ['🌑','👾','🦈','🐉','🌑','🔮','🧿','👁️','🪬','🗿','🦉','🐋','⚡','💎','🎭','🛰️','🕶️','🧬','♾️','🃏'];

  function defaults() {
    var holdings = {};
    // A seeded opening book — heavy in majors, a long tail of everything else.
    var weights = { BTC: 0.31, ETH: 0.19, SOL: 0.11, BNB: 0.05, XRP: 0.04, LINK: 0.035,
                    AVAX: 0.03, DOGE: 0.028, ADA: 0.025, DOT: 0.02, TON: 0.018, SUI: 0.016 };
    var book = 2847500;
    M.COINS.forEach(function (c, i) {
      var w = weights[c.symbol] != null ? weights[c.symbol] : 0.055 / (i + 1);
      var usd = book * w;
      holdings[c.symbol] = usd / c.seed;
    });
    return {
      version: 1,
      profile: {
        name: 'Slime Geo',
        handle: 'slimegeo',
        title: 'Obsidian Sovereign',
        bio: 'Holder of the key. Watching the tape since the first candle.',
        location: 'The Obsidian Vault',
        avatar: '🌑',
        avatarType: 'emoji',
        accent: '#b14dff',
        banner: 'nebula',
        bannerCustom: '',
        joined: Date.now(),
        showcase: ['portal-slimegeo', 'wealth-millionaire', 'portal-completionist',
                   'assets-bitcoin-sovereign', 'wealth-obsidian-standard', 'portal-monolith'],
        hideBalance: false,
        compact: false
      },
      cash: 184320.44,
      holdings: holdings,
      watchlist: ['BTC', 'ETH', 'SOL', 'LINK', 'DOGE'],
      stats: { trades: 12480, wins: 8127, streak: 214, opens: 1, ticks: 0, flashes: 0 }
    };
  }

  var state = null;

  function load() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var base = defaults();
        state = merge(base, parsed);
        // any newly listed asset gets a starter bag
        M.COINS.forEach(function (c) {
          if (state.holdings[c.symbol] == null) state.holdings[c.symbol] = base.holdings[c.symbol];
        });
        return state;
      }
    } catch (e) { /* corrupt or blocked storage — fall through to defaults */ }
    state = defaults();
    return state;
  }

  function merge(base, patch) {
    var out = {};
    Object.keys(base).forEach(function (k) {
      if (patch && typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k]) &&
          typeof base[k] === 'object' && base[k] && !Array.isArray(base[k])) {
        out[k] = merge(base[k], patch[k]);
      } else {
        out[k] = patch && patch[k] !== undefined ? patch[k] : base[k];
      }
    });
    if (patch) Object.keys(patch).forEach(function (k) { if (!(k in out)) out[k] = patch[k]; });
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); }
    catch (e) { /* quota or private mode — the session still works in memory */ }
  }

  function patchProfile(p) {
    var s = load();
    Object.keys(p).forEach(function (k) { s.profile[k] = p[k]; });
    save();
    return s.profile;
  }

  function reset() {
    state = defaults();
    save();
    return state;
  }

  function toggleWatch(sym) {
    var s = load();
    var i = s.watchlist.indexOf(sym);
    if (i >= 0) s.watchlist.splice(i, 1); else s.watchlist.push(sym);
    save();
    return i < 0;
  }

  M.store = {
    get: load,
    save: save,
    profile: function () { return load().profile; },
    patchProfile: patchProfile,
    reset: reset,
    toggleWatch: toggleWatch,
    TITLES: TITLES,
    BANNERS: BANNERS,
    ACCENTS: ACCENTS,
    AVATARS: AVATARS,
    banner: function (id) {
      for (var i = 0; i < BANNERS.length; i++) if (BANNERS[i].id === id) return BANNERS[i];
      return BANNERS[0];
    },
    gate: {
      pass: function () { try { sessionStorage.setItem(GATE_KEY, 'open'); } catch (e) {} },
      isOpen: function () { try { return sessionStorage.getItem(GATE_KEY) === 'open'; } catch (e) { return false; } },
      clear: function () { try { sessionStorage.removeItem(GATE_KEY); } catch (e) {} }
    }
  };
})(window);
