'use strict';
/* Monéta — API and security test suite.
   Boots a real server on a scratch data directory and drives it over HTTP.
   Run with: npm test */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const PORT = 8991;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'moneta-test-'));

process.env.MONETA_DATA_DIR = DATA_DIR;
process.env.MONETA_SECURE_COOKIES = '0';
process.env.PORT = String(PORT);

const { server } = require('../server/index.js');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  [32mok[0m   ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log('  [31mFAIL[0m ' + name + '\n       ' + err.message);
  }
}

/* ── tiny HTTP client that keeps a cookie jar ── */
function makeClient() {
  const jar = {};
  let csrf = null;

  function req(method, p, opts = {}) {
    return new Promise((resolve, reject) => {
      const headers = Object.assign({}, opts.headers);
      const cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
      if (cookie) headers.Cookie = cookie;
      if (csrf && !('X-CSRF-Token' in headers) && opts.csrf !== false) headers['X-CSRF-Token'] = csrf;

      let body = null;
      if (opts.json !== undefined) {
        body = Buffer.from(JSON.stringify(opts.json));
        headers['Content-Type'] = 'application/json';
      } else if (opts.raw !== undefined) {
        body = Buffer.isBuffer(opts.raw) ? opts.raw : Buffer.from(opts.raw);
        if (opts.contentType) headers['Content-Type'] = opts.contentType;
      }
      if (body) headers['Content-Length'] = body.length;

      const r = http.request(BASE + p, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          for (const sc of res.headers['set-cookie'] || []) {
            const [pair] = sc.split(';');
            const eq = pair.indexOf('=');
            const k = pair.slice(0, eq).trim();
            const v = pair.slice(eq + 1).trim();
            if (v === '' || /Max-Age=0/i.test(sc)) delete jar[k];
            else jar[k] = v;
          }
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* not json */ }
          if (json && json.csrf) csrf = json.csrf;
          resolve({ status: res.statusCode, headers: res.headers, text, json, cookies: res.headers['set-cookie'] || [] });
        });
      });
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }

  return {
    get: (p, o) => req('GET', p, o),
    post: (p, o) => req('POST', p, o),
    patch: (p, o) => req('PATCH', p, o),
    del: (p, o) => req('DELETE', p, o),
    jar,
    get csrf() { return csrf; },
    setCsrf(v) { csrf = v; }
  };
}

// The store batches writes on a 400ms timer; give it room before reading disk.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLUSH_MS = 700;

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

async function main() {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  console.log('\nMonéta test suite — data dir ' + DATA_DIR + '\n');

  const c = makeClient();
  const PW = 'obsidian-vault-terminal-77';

  console.log('security headers');
  await test('every response carries the CSP and hardening headers', async () => {
    const r = await c.get('/');
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    assert.ok(!/script-src[^;]*unsafe-inline/.test(r.headers['content-security-policy']),
      'script-src must not allow inline script');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(r.headers['x-frame-options'], 'DENY');
    assert.strictEqual(r.headers['referrer-policy'], 'no-referrer');
  });

  console.log('\nstatic file serving');
  for (const attack of [
    '/../server/auth.js',
    '/..%2f..%2fserver%2fauth.js',
    '/assets/../../server/store.js',
    '/%2e%2e%2fpackage.json',
    '/assets/js/../../../server/api.js',
    '/%00/etc/passwd'
  ]) {
    await test('refuses traversal: ' + attack, async () => {
      const r = await c.get(attack);
      assert.strictEqual(r.status, 404, 'expected 404, got ' + r.status);
      assert.ok(!/scrypt|SESSION_COOKIE/.test(r.text), 'leaked server source');
    });
  }
  await test('serves the sign-in page', async () => {
    const r = await c.get('/');
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /Mon&eacute;ta|Monéta/);
  });

  console.log('\nsign-up validation');
  await test('rejects a short password', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'a@b.co', handle: 'tester', password: 'short' } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /at least 10/);
  });
  await test('rejects a reserved handle', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'a@b.co', handle: 'admin', password: PW } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /reserved/);
  });
  await test('rejects a password containing the handle', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'a@b.co', handle: 'slimegeo', password: 'slimegeo-1234' } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /must not contain/);
  });
  await test('rejects a malformed email', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'not-an-email', handle: 'tester', password: PW } });
    assert.strictEqual(r.status, 400);
  });

  console.log('\nsign-up and session');
  await test('creates an account and sets a hardened cookie', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'Geo@Moneta.test', handle: 'slimegeo', password: PW } });
    assert.strictEqual(r.status, 200, r.text);
    const sc = r.cookies.join(';');
    assert.match(sc, /HttpOnly/, 'cookie must be HttpOnly');
    assert.match(sc, /SameSite=Strict/, 'cookie must be SameSite=Strict');
    assert.ok(r.json.user.id && r.json.csrf, 'expected user and csrf');
  });
  await test('never returns the password hash', async () => {
    const r = await c.get('/api/session');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.authenticated);
    assert.ok(!('pw' in r.json.user), 'pw leaked');
    assert.ok(!/scrypt\$/.test(r.text), 'hash leaked in payload');
  });
  await test('stores the password only as a scrypt hash on disk', async () => {
    await sleep(FLUSH_MS);
    const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'moneta.json'), 'utf8'));
    const user = Object.values(db.users)[0];
    assert.match(user.pw, /^scrypt\$\d+\$\d+\$\d+\$/, 'not a scrypt record');
    assert.ok(!JSON.stringify(db).includes(PW), 'plaintext password found in the database');
  });
  await test('stores session tokens hashed, not raw', async () => {
    await sleep(FLUSH_MS);
    const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'moneta.json'), 'utf8'));
    const raw = c.jar.mnt_sid;
    assert.ok(raw, 'no session cookie');
    assert.ok(!Object.keys(db.sessions).includes(raw), 'raw session token stored on disk');
    assert.strictEqual(Object.keys(db.sessions).length, 1);
  });
  await test('rejects a duplicate email', async () => {
    const r = await c.post('/api/auth/signup', { json: { email: 'geo@moneta.test', handle: 'other', password: PW } });
    assert.strictEqual(r.status, 409);
  });

  console.log('\nlogin');
  await test('wrong password and unknown account give the same answer', async () => {
    const c2 = makeClient();
    const a = await c2.post('/api/auth/login', { json: { email: 'geo@moneta.test', password: 'not-the-password' } });
    const b = await c2.post('/api/auth/login', { json: { email: 'ghost@nowhere.dev', password: 'not-the-password' } });
    assert.strictEqual(a.status, 401);
    assert.strictEqual(b.status, 401);
    assert.strictEqual(a.json.error, b.json.error, 'error wording differs — account enumeration');
  });
  await test('rate-limits repeated failures for one account', async () => {
    const c2 = makeClient();
    let sawLimit = false;
    for (let i = 0; i < 12; i++) {
      const r = await c2.post('/api/auth/login', { json: { email: 'ratelimit@moneta.test', password: 'x'.repeat(12) } });
      if (r.status === 429) { sawLimit = true; assert.ok(r.headers['retry-after'], 'no Retry-After header'); break; }
    }
    assert.ok(sawLimit, 'never rate limited');
  });

  console.log('\nCSRF and origin');
  await test('mutation without a CSRF token is refused', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'buy', usd: 10 }, headers: { 'X-CSRF-Token': '' }, csrf: false });
    assert.strictEqual(r.status, 403);
  });
  await test('mutation with a wrong CSRF token is refused', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'buy', usd: 10 }, headers: { 'X-CSRF-Token': 'x'.repeat(43) }, csrf: false });
    assert.strictEqual(r.status, 403);
  });
  await test('mutation from a foreign Origin is refused', async () => {
    const r = await c.post('/api/trade', {
      json: { symbol: 'BTC', side: 'buy', usd: 10 },
      headers: { Origin: 'https://evil.example' }
    });
    assert.strictEqual(r.status, 403);
    assert.match(r.json.error, /Cross-origin/);
  });

  console.log('\ntrading is server-priced');
  let priceAtBuy = 0;
  await test('a valid buy is filled at the server price', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'buy', usd: 1000 } });
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(r.json.price > 1000, 'implausible BTC price');
    priceAtBuy = r.json.price;
  });
  await test('a price supplied by the client is ignored', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'buy', usd: 1000, price: 0.01, units: 1e9 } });
    assert.strictEqual(r.status, 200);
    assert.ok(Math.abs(r.json.price - priceAtBuy) / priceAtBuy < 0.5, 'server used a client price');
  });
  await test('cannot spend more cash than the account holds', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'buy', usd: 1e12 } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Insufficient cash/);
  });
  await test('cannot sell more than the account holds', async () => {
    const r = await c.post('/api/trade', { json: { symbol: 'BTC', side: 'sell', usd: 1e12 } });
    assert.strictEqual(r.status, 400);
  });
  for (const bad of [
    { symbol: 'NOPE', side: 'buy', usd: 10 },
    { symbol: 'BTC', side: 'steal', usd: 10 },
    { symbol: 'BTC', side: 'buy', usd: -5 },
    { symbol: 'BTC', side: 'buy', usd: 0 },
    { symbol: 'BTC', side: 'buy', usd: 'NaN' },
    { symbol: 'BTC', side: 'buy', usd: null },
    { symbol: 'BTC', side: 'buy' }
  ]) {
    await test('rejects malformed order ' + JSON.stringify(bad), async () => {
      const r = await c.post('/api/trade', { json: bad });
      assert.strictEqual(r.status, 400, 'expected 400, got ' + r.status);
    });
  }
  await test('balances survive a round trip through the store', async () => {
    const before = (await c.get('/api/state')).json.user.cash;
    await c.post('/api/trade', { json: { symbol: 'ETH', side: 'buy', usd: 500 } });
    const after = (await c.get('/api/state')).json.user.cash;
    assert.ok(Math.abs((before - 500) - after) < 0.01, 'cash did not move by the order size');
  });

  console.log('\nprofile validation');
  await test('rejects an accent that is not a hex colour', async () => {
    const r = await c.patch('/api/profile', { json: { accent: 'red;background:url(//evil)' } });
    assert.strictEqual(r.status, 400);
  });
  await test('rejects an unknown title', async () => {
    const r = await c.patch('/api/profile', { json: { title: 'Supreme Overlord' } });
    assert.strictEqual(r.status, 400);
  });
  await test('rejects an unknown banner and sigil', async () => {
    assert.strictEqual((await c.patch('/api/profile', { json: { banner: '../../etc' } })).status, 400);
    assert.strictEqual((await c.patch('/api/profile', { json: { avatarSigil: 'script' } })).status, 400);
  });
  await test('strips control characters and clamps length', async () => {
    const r = await c.patch('/api/profile', { json: { name: ' ‮Evil' + 'x'.repeat(200) } });
    assert.strictEqual(r.status, 200);
    const name = r.json.user.profile.name;
    assert.ok(name.length <= 32, 'name not clamped');
    assert.ok(!/[ -‮]/.test(name), 'control characters survived');
  });
  await test('keeps a script payload as inert text', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const r = await c.patch('/api/profile', { json: { bio: payload } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.user.profile.bio, payload, 'bio should be stored verbatim and escaped at render');
  });
  await test('rejects a handle already taken', async () => {
    const c3 = makeClient();
    await c3.post('/api/auth/signup', { json: { email: 'second@moneta.test', handle: 'secondary', password: PW } });
    const r = await c3.patch('/api/profile', { json: { handle: 'slimegeo' } });
    assert.strictEqual(r.status, 409);
  });
  await test('showcase entries are filtered to safe ids and capped at six', async () => {
    const r = await c.patch('/api/profile', {
      json: { showcase: ['wealth-first-dollar', '<script>', '../../x', 'a', 'b', 'c', 'd', 'e', 'f', 'g'] }
    });
    assert.strictEqual(r.status, 200);
    const sc = r.json.user.profile.showcase;
    assert.ok(sc.length <= 6, 'showcase not capped');
    assert.ok(sc.every((s) => /^[a-z0-9-]+$/.test(s)), 'unsafe id survived');
  });

  console.log('\navatars');
  await test('accepts a real PNG', async () => {
    const r = await c.post('/api/avatar', { raw: PNG_1x1, contentType: 'image/png' });
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(r.json.user.avatarUrl, 'no avatar url returned');
  });
  await test('refuses an SVG even when the Content-Type claims PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = await c.post('/api/avatar', { raw: svg, contentType: 'image/png' });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /PNG, JPEG, GIF or WebP/);
  });
  await test('refuses an HTML payload disguised as an image', async () => {
    const html = Buffer.from('<!doctype html><script>alert(1)</script>');
    const r = await c.post('/api/avatar', { raw: html, contentType: 'image/jpeg' });
    assert.strictEqual(r.status, 400);
  });
  await test('refuses an oversized upload', async () => {
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(600 * 1024)]);
    const r = await c.post('/api/avatar', { raw: big, contentType: 'image/png' });
    assert.strictEqual(r.status, 413);
  });
  await test('serves the avatar with a sniffed type and nosniff', async () => {
    const state = await c.get('/api/state');
    const url = state.json.user.avatarUrl;
    const r = await c.get(url);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['content-type'], 'image/png');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  });
  await test('another account cannot read this avatar', async () => {
    const state = await c.get('/api/state');
    const url = state.json.user.avatarUrl;
    const c4 = makeClient();
    await c4.post('/api/auth/signup', { json: { email: 'third@moneta.test', handle: 'thirdling', password: PW } });
    const r = await c4.get(url);
    assert.strictEqual(r.status, 404, 'avatar leaked across accounts');
  });

  console.log('\nauthorisation');
  await test('unauthenticated requests are refused', async () => {
    const anon = makeClient();
    for (const p of ['/api/state', '/api/stream']) {
      const r = await anon.get(p);
      assert.strictEqual(r.status, 401, p + ' returned ' + r.status);
    }
    const w = await anon.post('/api/watchlist', { json: { symbol: 'BTC' } });
    assert.ok(w.status === 401 || w.status === 403, 'watchlist reachable while signed out');
  });
  await test('a forged session cookie is refused', async () => {
    const anon = makeClient();
    anon.jar.mnt_sid = 'a'.repeat(43);
    const r = await anon.get('/api/state');
    assert.strictEqual(r.status, 401);
  });
  await test('sign-out invalidates the session server-side', async () => {
    const c5 = makeClient();
    await c5.post('/api/auth/signup', { json: { email: 'temp@moneta.test', handle: 'tempuser', password: PW } });
    const token = c5.jar.mnt_sid;
    await c5.post('/api/auth/logout', { json: {} });
    const replay = makeClient();
    replay.jar.mnt_sid = token;
    const r = await replay.get('/api/state');
    assert.strictEqual(r.status, 401, 'old token still works after sign-out');
  });

  console.log('\nrequest handling');
  await test('rejects a non-JSON body on a JSON route', async () => {
    const r = await c.post('/api/watchlist', { raw: 'symbol=BTC', contentType: 'application/x-www-form-urlencoded' });
    assert.strictEqual(r.status, 415);
  });
  await test('rejects malformed JSON', async () => {
    const r = await c.post('/api/watchlist', { raw: '{nope', contentType: 'application/json' });
    assert.strictEqual(r.status, 400);
  });
  await test('rejects an oversized JSON body', async () => {
    const r = await c.post('/api/watchlist', { raw: JSON.stringify({ symbol: 'B'.repeat(100000) }), contentType: 'application/json' });
    assert.ok(r.status === 413 || r.status === 400, 'got ' + r.status);
  });
  await test('a prototype-pollution payload does not poison Object', async () => {
    await c.patch('/api/profile', { raw: '{"__proto__":{"polluted":"yes"},"name":"Fine"}', contentType: 'application/json' });
    assert.strictEqual({}.polluted, undefined, 'Object.prototype was polluted');
  });
  await test('unknown endpoints 404 and wrong verbs 405', async () => {
    assert.strictEqual((await c.get('/api/nope')).status, 404);
    assert.strictEqual((await c.get('/api/trade')).status, 405);
  });

  console.log('\nmarket engine');
  await test('the ticker is public and well formed', async () => {
    const anon = makeClient();
    const r = await anon.get('/api/ticker');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.rows.length, 5);
    assert.ok(r.json.rows.every((x) => typeof x.price === 'string' && /^#[0-9A-Fa-f]{6}$/.test(x.color)));
  });
  await test('prices move and stay positive', async () => {
    const Moneta = require('../server/engine.js');
    const before = Moneta.market.snapshot();
    Moneta.market.tick();
    const after = Moneta.market.snapshot();
    assert.ok(after.every((v) => v > 0), 'a price went non-positive');
    assert.ok(after.some((v, i) => v !== before[i]), 'nothing moved');
  });

  console.log('\nclient bundle hygiene');
  await test('no emoji anywhere in the shipped client', async () => {
    const dir = path.join(__dirname, '..', 'public');
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
    const offenders = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(js|html|css|svg)$/.test(e.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        text.split('\n').forEach((line, i) => {
          if (emoji.test(line)) offenders.push(path.relative(dir, full) + ':' + (i + 1));
        });
      }
    })(dir);
    assert.deepStrictEqual(offenders, [], 'emoji found: ' + offenders.join(', '));
  });
  await test('the client never writes sensitive keys to localStorage', async () => {
    const dir = path.join(__dirname, '..', 'public', 'assets', 'js');
    // Strip comments so prose about storage does not trip the check.
    const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const offenders = [];
    for (const f of fs.readdirSync(dir)) {
      const code = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!/\b(localStorage|sessionStorage|indexedDB)\b/.test(code)) continue;
      if (f !== 'prefs.js') { offenders.push(f + ' touches web storage outside prefs.js'); continue; }
      const writes = code.match(/localStorage\.setItem\(\s*[^,)]+/g) || [];
      for (const w of writes) {
        if (!/KEY/.test(w)) offenders.push('prefs.js writes an unexpected key: ' + w);
      }
    }
    assert.deepStrictEqual(offenders, [], offenders.join('; '));
  });
  await test('no inline event handlers or inline scripts in the HTML', async () => {
    for (const f of ['index.html', 'portal.html']) {
      const text = fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
      assert.ok(!/\son[a-z]+\s*=/i.test(text), f + ' has an inline event handler');
      assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(text),
        f + ' has an inline script block');
    }
  });

  console.log('\n' + (failed ? '[31m' : '[32m') +
    passed + ' passed, ' + failed + ' failed[0m\n');

  server.close();
  require('../server/engine.js').market.stop();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('test harness crashed:', err);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(1);
});
