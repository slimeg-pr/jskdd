'use strict';
/* Monéta — HTTP API.
   Everything that matters — credentials, balances, holdings, profiles — is
   owned here. The browser gets a session cookie and a CSRF token; it never
   gets to assert a price, a balance or an identity. */

const Moneta = require('./engine');
const store = require('./store');
const auth = require('./auth');

const SESSION_COOKIE = 'mnt_sid';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;      // 14 days
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;          // slide-refresh window
const MAX_SESSIONS_PER_USER = 10;

const limiters = {
  login: new auth.RateLimiter(),
  signup: new auth.RateLimiter(),
  write: new auth.RateLimiter(),
  avatar: new auth.RateLimiter()
};
setInterval(() => {
  Object.values(limiters).forEach((l) => l.sweep());
  store.sweepSessions();
}, 10 * 60 * 1000).unref();

/* ── profile vocabulary (the server decides what's allowed) ── */
const TITLES = [
  'Obsidian Sovereign', 'Vault Keeper', 'Neon Whale', 'Portal Warden',
  'Chain Cartographer', 'Liquidity Wraith', 'Candle Reader', 'Deep Index Diver',
  'Violet Signal', 'Glasswalker', 'The Watcher', 'Market Force',
  'Silent Accumulator', 'Diamond Custodian', 'Night Trader', 'Founding Member'
];
const BANNERS = ['obsidian', 'nebula', 'aurora', 'ember', 'voidglass', 'ultra', 'goldleaf', 'circuit'];
const SIGILS = ['crown', 'diamond', 'hex', 'orbit', 'spiral', 'sparkle', 'moon', 'flame',
  'wave2', 'void', 'cube', 'gem', 'infinity', 'compass', 'monolith', 'galaxy',
  'whale', 'owl', 'ghost', 'shield'];
const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

const LIMITS = { name: 32, bio: 220, location: 40, showcase: 6 };

/* ── helpers ──────────────────────────────────────────────── */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);

function str(v, max) {
  if (typeof v !== 'string') return '';
  // Control characters and bidi/zero-width marks have no business in a name.
  return v.replace(CONTROL_RE, '').trim().slice(0, max);
}

function defaultBook() {
  const holdings = {};
  const weights = {
    BTC: 0.31, ETH: 0.19, SOL: 0.11, BNB: 0.05, XRP: 0.04, LINK: 0.035,
    AVAX: 0.03, DOGE: 0.028, ADA: 0.025, DOT: 0.02, TON: 0.018, SUI: 0.016
  };
  const book = 2847500;
  Moneta.COINS.forEach((c, i) => {
    const w = weights[c.symbol] != null ? weights[c.symbol] : 0.055 / (i + 1);
    holdings[c.symbol] = (book * w) / c.seed;
  });
  return holdings;
}

function newUserRecord(email, handle, pwHash) {
  const now = Date.now();
  const crypto = require('crypto');
  return {
    id: store.newId(),
    email,
    emailLower: email.toLowerCase(),
    handle,
    handleLower: handle.toLowerCase(),
    pw: pwHash,
    createdAt: now,
    lastLoginAt: now,
    profile: {
      name: handle,
      title: TITLES[0],
      bio: '',
      location: '',
      accent: '#b14dff',
      banner: 'nebula',
      avatarKind: 'sigil',
      avatarSigil: SIGILS[crypto.randomInt(SIGILS.length)],
      hideBalance: false,
      showcase: []
    },
    avatarFile: null,
    avatarMime: null,
    avatarVersion: 0,
    cash: 184320.44,
    holdings: defaultBook(),
    watchlist: ['BTC', 'ETH', 'SOL', 'LINK', 'DOGE'],
    stats: { trades: 0, wins: 0, streak: 1, opens: 1 }
  };
}

/** Exactly what the owner is allowed to see about themselves. */
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    handle: u.handle,
    createdAt: u.createdAt,
    profile: {
      name: u.profile.name,
      title: u.profile.title,
      bio: u.profile.bio,
      location: u.profile.location,
      accent: u.profile.accent,
      banner: u.profile.banner,
      avatarKind: u.profile.avatarKind,
      avatarSigil: u.profile.avatarSigil,
      hideBalance: !!u.profile.hideBalance,
      showcase: Array.isArray(u.profile.showcase) ? u.profile.showcase.slice(0, LIMITS.showcase) : []
    },
    avatarUrl: u.avatarFile ? '/api/avatar/' + encodeURIComponent(u.id) + '?v=' + (u.avatarVersion || 0) : null,
    cash: u.cash,
    holdings: u.holdings,
    watchlist: u.watchlist,
    stats: u.stats
  };
}

/* ── sessions ─────────────────────────────────────────────── */
function appendHeader(res, name, value) {
  const prev = res.getHeader(name);
  if (!prev) res.setHeader(name, value);
  else res.setHeader(name, [].concat(prev, value));
}

function setSessionCookie(res, token, maxAgeMs) {
  const parts = [
    SESSION_COOKIE + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + Math.floor(maxAgeMs / 1000)
  ];
  if (process.env.MONETA_SECURE_COOKIES !== '0') parts.push('Secure');
  appendHeader(res, 'Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [SESSION_COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (process.env.MONETA_SECURE_COOKIES !== '0') parts.push('Secure');
  appendHeader(res, 'Set-Cookie', parts.join('; '));
}

function issueSession(res, user) {
  // Cap concurrent sessions so a leaked cookie farm cannot grow unbounded.
  const d = store.load();
  const mine = Object.entries(d.sessions)
    .filter(([, s]) => s.userId === user.id)
    .sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (mine.length >= MAX_SESSIONS_PER_USER) store.dropSession(mine.shift()[0]);

  const token = auth.randomToken(32);
  const csrf = auth.randomToken(32);
  store.putSession(auth.hashToken(token), {
    userId: user.id,
    csrf,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  setSessionCookie(res, token, SESSION_TTL_MS);
  return csrf;
}

function currentSession(ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  if (!token) return null;
  const hash = auth.hashToken(token);
  const s = store.getSession(hash);
  if (!s) return null;
  const user = store.userById(s.userId);
  if (!user) { store.dropSession(hash); return null; }

  // Slide the expiry once the session is past its refresh window.
  if (s.expiresAt - Date.now() < SESSION_TTL_MS - SESSION_IDLE_MS) {
    s.expiresAt = Date.now() + SESSION_TTL_MS;
    store.putSession(hash, s);
    setSessionCookie(ctx.res, token, SESSION_TTL_MS);
  }
  return { session: s, user, tokenHash: hash };
}

function requireAuth(ctx) {
  const cur = currentSession(ctx);
  if (!cur) throw new HttpError(401, 'Not signed in.');
  return cur;
}

/**
 * CSRF: the session cookie is SameSite=Strict, and every mutation also needs
 * a same-origin Origin header plus a token the page could only have read from
 * an authenticated same-origin response.
 */
function requireCsrf(ctx, cur) {
  const origin = ctx.req.headers.origin;
  if (origin && origin !== 'null') {
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Bad origin.'); }
    if (host !== ctx.req.headers.host) throw new HttpError(403, 'Cross-origin request refused.');
  } else {
    const site = ctx.req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new HttpError(403, 'Cross-origin request refused.');
    }
  }
  const sent = ctx.req.headers['x-csrf-token'];
  if (!sent || !auth.safeEqual(sent, cur.session.csrf)) {
    throw new HttpError(403, 'Invalid CSRF token.');
  }
}

/* ── auth routes ──────────────────────────────────────────── */
async function signup(ctx) {
  // Two separate budgets: a loose one on attempts (so a scripted prober is
  // stopped) and a strict one on accounts actually created (so a person
  // fumbling the form five times is not locked out for an hour).
  const attempts = limiters.signup.check('try:' + ctx.ip, 25, 60 * 60 * 1000);
  if (!attempts.ok) {
    throw new HttpError(429, 'Too many sign-up attempts from this address. Try again later.',
      { retryAfter: attempts.retryAfter });
  }

  const b = ctx.body || {};
  const email = str(b.email, 254).toLowerCase();
  const handle = str(b.handle, 24);
  const password = typeof b.password === 'string' ? b.password : '';

  const err = auth.validateEmail(email) || auth.validateHandle(handle) ||
              auth.validatePassword(password, [email.split('@')[0], handle]);
  if (err) throw bad(err);

  if (store.userByEmail(email)) throw new HttpError(409, 'An account with that email already exists.');
  if (store.userByHandle(handle.toLowerCase())) throw new HttpError(409, 'That handle is taken.');

  const created = limiters.signup.check('new:' + ctx.ip, 5, 60 * 60 * 1000);
  if (!created.ok) {
    throw new HttpError(429, 'Too many accounts created from this address. Try again later.',
      { retryAfter: created.retryAfter });
  }

  const pwHash = await auth.hashPassword(password);
  const user = store.insertUser(newUserRecord(email, handle, pwHash));
  const csrf = issueSession(ctx.res, user);
  return { user: publicUser(user), csrf };
}

async function login(ctx) {
  const b = ctx.body || {};
  const email = str(b.email, 254).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';

  const byIp = limiters.login.check('ip:' + ctx.ip, 20, 15 * 60 * 1000);
  const byAcct = limiters.login.check('acct:' + email, 8, 15 * 60 * 1000);
  if (!byIp.ok || !byAcct.ok) {
    throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.',
      { retryAfter: Math.max(byIp.retryAfter, byAcct.retryAfter) });
  }

  const user = email ? store.userByEmail(email) : null;
  // Same work and the same wording either way — the form is not an enumerator.
  let ok = false;
  if (user) ok = await auth.verifyPassword(password, user.pw);
  else await auth.burnPasswordWork(password);
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.');

  limiters.login.clear('acct:' + email);
  store.dropUserSessions(user.id);              // new token on every login
  user.lastLoginAt = Date.now();
  user.stats.opens = (user.stats.opens || 0) + 1;
  store.save();
  const csrf = issueSession(ctx.res, user);
  return { user: publicUser(user), csrf };
}

function logout(ctx) {
  const cur = currentSession(ctx);
  if (cur) {
    requireCsrf(ctx, cur);
    store.dropSession(cur.tokenHash);
  }
  clearSessionCookie(ctx.res);
  return { ok: true };
}

function session(ctx) {
  const cur = currentSession(ctx);
  if (!cur) return { authenticated: false };
  return { authenticated: true, csrf: cur.session.csrf, user: publicUser(cur.user) };
}

function state(ctx) {
  const cur = requireAuth(ctx);
  return { user: publicUser(cur.user), tick: Moneta.market.tickCount(), prices: Moneta.market.snapshot() };
}

/* ── profile ──────────────────────────────────────────────── */
function patchProfile(ctx) {
  const cur = requireAuth(ctx);
  requireCsrf(ctx, cur);
  const rl = limiters.write.check('w:' + cur.user.id, 120, 60 * 1000);
  if (!rl.ok) throw new HttpError(429, 'Slow down.', { retryAfter: rl.retryAfter });

  const b = ctx.body || {};
  const p = cur.user.profile;

  if (b.name !== undefined) {
    const v = str(b.name, LIMITS.name);
    if (!v) throw bad('Display name cannot be empty.');
    p.name = v;
  }
  if (b.handle !== undefined) {
    const v = str(b.handle, 24);
    const e = auth.validateHandle(v);
    if (e) throw bad(e);
    const lower = v.toLowerCase();
    if (lower !== cur.user.handleLower) {
      const taken = store.userByHandle(lower);
      if (taken && taken.id !== cur.user.id) throw new HttpError(409, 'That handle is taken.');
      const old = cur.user.handleLower;
      cur.user.handle = v;
      cur.user.handleLower = lower;
      store.reindexHandle(cur.user, old);
    } else {
      cur.user.handle = v;
    }
  }
  if (b.title !== undefined) {
    if (!TITLES.includes(b.title)) throw bad('Unknown title.');
    p.title = b.title;
  }
  if (b.bio !== undefined) p.bio = str(b.bio, LIMITS.bio);
  if (b.location !== undefined) p.location = str(b.location, LIMITS.location);
  if (b.accent !== undefined) {
    if (!ACCENT_RE.test(String(b.accent))) throw bad('Accent must be a #rrggbb colour.');
    p.accent = String(b.accent).toLowerCase();
  }
  if (b.banner !== undefined) {
    if (!BANNERS.includes(b.banner)) throw bad('Unknown banner.');
    p.banner = b.banner;
  }
  if (b.avatarSigil !== undefined) {
    if (!SIGILS.includes(b.avatarSigil)) throw bad('Unknown avatar.');
    p.avatarSigil = b.avatarSigil;
    p.avatarKind = 'sigil';
  }
  if (b.hideBalance !== undefined) p.hideBalance = !!b.hideBalance;
  if (b.showcase !== undefined) {
    if (!Array.isArray(b.showcase)) throw bad('Showcase must be a list.');
    p.showcase = b.showcase
      .filter((x) => typeof x === 'string' && /^[a-z0-9-]{1,80}$/.test(x))
      .slice(0, LIMITS.showcase);
  }
  store.save();
  return { user: publicUser(cur.user) };
}

function toggleWatch(ctx) {
  const cur = requireAuth(ctx);
  requireCsrf(ctx, cur);
  const sym = str((ctx.body || {}).symbol, 12).toUpperCase();
  if (!Moneta.coin(sym)) throw bad('Unknown asset.');
  const i = cur.user.watchlist.indexOf(sym);
  if (i >= 0) {
    cur.user.watchlist.splice(i, 1);
  } else {
    if (cur.user.watchlist.length >= 40) throw bad('Watchlist is full.');
    cur.user.watchlist.push(sym);
  }
  store.save();
  return { watchlist: cur.user.watchlist, watching: i < 0 };
}

/* ── trading ──────────────────────────────────────────────── */
function trade(ctx) {
  const cur = requireAuth(ctx);
  requireCsrf(ctx, cur);
  const rl = limiters.write.check('t:' + cur.user.id, 60, 60 * 1000);
  if (!rl.ok) throw new HttpError(429, 'Too many orders. Wait a moment.', { retryAfter: rl.retryAfter });

  const b = ctx.body || {};
  const sym = str(b.symbol, 12).toUpperCase();
  const side = b.side === 'sell' ? 'sell' : b.side === 'buy' ? 'buy' : null;
  const usd = Number(b.usd);

  if (!Moneta.coin(sym)) throw bad('Unknown asset.');
  if (!side) throw bad('Side must be buy or sell.');
  if (!Number.isFinite(usd) || usd <= 0) throw bad('Enter an amount above zero.');
  if (usd > 1e15) throw bad('That order is too large.');

  // The price comes from this process. A request cannot name its own fill.
  const price = Moneta.market.price(sym);
  if (!(price > 0)) throw new HttpError(503, 'No price for that asset right now.');

  const u = cur.user;
  const units = usd / price;

  if (side === 'buy') {
    if (usd > u.cash + 1e-6) throw bad('Insufficient cash.', { cash: u.cash });
    u.cash = Math.max(0, u.cash - usd);
    u.holdings[sym] = (u.holdings[sym] || 0) + units;
  } else {
    const have = u.holdings[sym] || 0;
    if (units > have + 1e-12) throw bad('You do not hold that much.', { held: have });
    const left = have - units;
    u.holdings[sym] = left < 1e-12 ? 0 : left;
    u.cash += usd;
  }

  u.stats.trades = (u.stats.trades || 0) + 1;
  if (require('crypto').randomInt(100) > 35) u.stats.wins = (u.stats.wins || 0) + 1;
  store.save();

  return { side, symbol: sym, units, price, cash: u.cash, holdings: u.holdings, stats: u.stats };
}

/* ── avatars ──────────────────────────────────────────────── */
// Sniffed from the bytes: the request's Content-Type is a hint, not evidence.
const IMAGE_TYPES = [
  { ext: 'png',  mime: 'image/png',  test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg',  mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif',  mime: 'image/gif',  test: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' }
];
const MAX_AVATAR = 512 * 1024;

function uploadAvatar(ctx) {
  const cur = requireAuth(ctx);
  requireCsrf(ctx, cur);
  const rl = limiters.avatar.check('a:' + cur.user.id, 10, 10 * 60 * 1000);
  if (!rl.ok) throw new HttpError(429, 'Too many uploads. Try again shortly.', { retryAfter: rl.retryAfter });

  const buf = ctx.raw;
  if (!buf || !buf.length) throw bad('No image received.');
  if (buf.length > MAX_AVATAR) throw new HttpError(413, 'Image must be under 512 KB.');

  const kind = IMAGE_TYPES.find((t) => t.test(buf));
  // SVG — and anything else that can carry script — falls through and is refused.
  if (!kind) throw bad('Only PNG, JPEG, GIF or WebP images are accepted.');

  const old = cur.user.avatarFile;
  cur.user.avatarFile = store.writeAvatar(cur.user.id, buf, kind.ext);
  cur.user.avatarMime = kind.mime;
  cur.user.avatarVersion = (cur.user.avatarVersion || 0) + 1;
  cur.user.profile.avatarKind = 'image';
  store.deleteAvatar(old);
  store.save();
  return { user: publicUser(cur.user) };
}

function removeAvatar(ctx) {
  const cur = requireAuth(ctx);
  requireCsrf(ctx, cur);
  store.deleteAvatar(cur.user.avatarFile);
  cur.user.avatarFile = null;
  cur.user.avatarMime = null;
  cur.user.profile.avatarKind = 'sigil';
  store.save();
  return { user: publicUser(cur.user) };
}

/** Avatars are private to their owner — this app has no public profiles. */
function serveAvatar(ctx, userId) {
  const cur = requireAuth(ctx);
  if (userId !== cur.user.id) throw new HttpError(404, 'Not found.');
  const u = cur.user;
  if (!u.avatarFile) throw new HttpError(404, 'No avatar set.');
  const buf = store.readAvatar(u.avatarFile);
  if (!buf) throw new HttpError(404, 'No avatar set.');
  ctx.res.writeHead(200, {
    'Content-Type': u.avatarMime,            // our sniff, never the upload's claim
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  ctx.res.end(buf);
  return null;   // response already written
}

/* ── public ticker (unauthenticated, decoration for the sign-in page) ── */
const TICKER_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
const tickerLimiter = new auth.RateLimiter();

function ticker(ctx) {
  const rl = tickerLimiter.check('tk:' + ctx.ip, 120, 60 * 1000);
  if (!rl.ok) throw new HttpError(429, 'Too many requests.', { retryAfter: rl.retryAfter });
  return {
    rows: TICKER_SYMBOLS.map((sym) => {
      const c = Moneta.coin(sym);
      const p = Moneta.market.price(sym);
      return {
        symbol: sym,
        color: c.color,
        price: Moneta.fmt.price(p),
        up: p >= Moneta.market.prev(sym)
      };
    })
  };
}

/* ── live price stream ────────────────────────────────────── */
let streamCount = 0;
const streamsByUser = new Map();
const MAX_STREAMS = 200;
const MAX_STREAMS_PER_USER = 6;

function stream(ctx) {
  const cur = requireAuth(ctx);
  const uid = cur.user.id;
  if (streamCount >= MAX_STREAMS) throw new HttpError(503, 'Too many live connections.');
  if ((streamsByUser.get(uid) || 0) >= MAX_STREAMS_PER_USER) {
    throw new HttpError(429, 'Too many open tabs streaming prices.');
  }
  streamCount++;
  streamsByUser.set(uid, (streamsByUser.get(uid) || 0) + 1);

  const res = ctx.res;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };

  send('hello', { t: Moneta.market.tickCount(), p: Moneta.market.snapshot() });

  const off = Moneta.market.on((_syms, tick) => {
    send('tick', { t: tick, p: Moneta.market.snapshot().map((v) => Number(v.toPrecision(10))) });
  });
  const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 25000);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    clearInterval(keepAlive);
    off();
    streamCount = Math.max(0, streamCount - 1);
    const left = (streamsByUser.get(uid) || 1) - 1;
    if (left <= 0) streamsByUser.delete(uid); else streamsByUser.set(uid, left);
  };
  ctx.req.on('close', cleanup);
  ctx.req.on('error', cleanup);
  res.on('close', cleanup);
  return null;
}

module.exports = {
  HttpError, SESSION_COOKIE,
  routes: {
    'POST /api/auth/signup': signup,
    'POST /api/auth/login': login,
    'POST /api/auth/logout': logout,
    'GET /api/session': session,
    'GET /api/ticker': ticker,
    'GET /api/state': state,
    'PATCH /api/profile': patchProfile,
    'POST /api/watchlist': toggleWatch,
    'POST /api/trade': trade,
    'POST /api/avatar': uploadAvatar,
    'DELETE /api/avatar': removeAvatar,
    'GET /api/stream': stream
  },
  serveAvatar,
  meta: { TITLES, BANNERS, SIGILS, LIMITS, MAX_AVATAR }
};
