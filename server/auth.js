'use strict';
/* Monéta — credentials, sessions and abuse limits.
   Nothing in here ever reaches the browser except an opaque session id
   and a CSRF token. Password material never leaves this process. */

const crypto = require('crypto');

/* ── password hashing ─────────────────────────────────────── */
// scrypt is in Node's stdlib and is memory-hard; these parameters cost
// roughly 100ms per hash on a small server, which is the point.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 32, maxmem: 96 * 1024 * 1024 };

function scrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, params, (err, key) =>
      err ? reject(err) : resolve(key));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const params = {
    N: parseInt(parts[1], 10), r: parseInt(parts[2], 10), p: parseInt(parts[3], 10),
    keylen: 32, maxmem: SCRYPT.maxmem
  };
  if (!(params.N > 0 && params.r > 0 && params.p > 0)) return false;
  let salt, expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch { return false; }
  let got;
  try { got = await scrypt(password, salt, params); } catch { return false; }
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Burn the same work on a miss so a wrong email and a wrong password take
// the same time — otherwise the login form is an account enumerator.
const DUMMY_HASH = crypto.scryptSync('decoy', 'decoy-salt', 32, SCRYPT).toString('base64');
async function burnPasswordWork(password) {
  try { await scrypt(String(password || ''), 'decoy-salt', SCRYPT); } catch { /* ignore */ }
  return DUMMY_HASH;
}

/* ── tokens ───────────────────────────────────────────────── */
function randomToken(bytes) {
  return crypto.randomBytes(bytes || 32).toString('base64url');
}
// Sessions are stored hashed: a leaked database still can't be replayed.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('base64url');
}
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ── validation ───────────────────────────────────────────── */
const EMAIL_RE = /^[^\s@<>"'`;]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_.]{1,22}[a-z0-9])$/;

// Reserved so nobody registers a handle that reads like part of the product.
const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'moneta',
  'official', 'security', 'api', 'staff', 'mod', 'moderator', 'billing',
  'null', 'undefined', 'me', 'you', 'settings', 'login', 'signup', 'logout'
]);

// The 40 or so passwords that show up first in every credential-stuffing list.
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  '1234567890', '12345678901', '123456789012', 'qwertyuiop', 'qwerty12345',
  'letmein123', 'welcome123', 'admin12345', 'iloveyou123', 'monkey12345',
  'abc123456789', 'football123', 'baseball123', 'dragon123456', 'sunshine123',
  'princess123', 'trustno1234', 'passw0rd123', 'starwars123', 'whatever123',
  'moneta12345', 'slimegeo123', 'changeme123', 'secret12345', 'qwertyuiop1'
]);

function validateEmail(v) {
  if (typeof v !== 'string') return 'Email is required.';
  const e = v.trim();
  if (!e) return 'Email is required.';
  if (e.length > 254) return 'That email is too long.';
  if (!EMAIL_RE.test(e)) return 'That does not look like an email address.';
  return null;
}

function validateHandle(v) {
  if (typeof v !== 'string') return 'Handle is required.';
  const h = v.trim().toLowerCase();
  if (!h) return 'Handle is required.';
  if (h.length < 3 || h.length > 24) return 'Handle must be 3–24 characters.';
  if (!HANDLE_RE.test(h)) return 'Handles use letters, numbers, dots and underscores.';
  if (RESERVED_HANDLES.has(h)) return 'That handle is reserved.';
  return null;
}

function validatePassword(v, context) {
  if (typeof v !== 'string') return 'Password is required.';
  if (v.length < 10) return 'Password must be at least 10 characters.';
  if (v.length > 200) return 'Password must be under 200 characters.';
  const low = v.toLowerCase();
  if (WEAK_PASSWORDS.has(low)) return 'That password is too common — pick another.';
  if (/^(.)\1+$/.test(v)) return 'That password is a single repeated character.';
  for (const bit of (context || [])) {
    if (bit && bit.length >= 4 && low.includes(String(bit).toLowerCase())) {
      return 'Password must not contain your email or handle.';
    }
  }
  return null;
}

/* ── rate limiting ────────────────────────────────────────── */
// Fixed-cost sliding window, keyed however the caller wants (IP, IP+email…).
class RateLimiter {
  constructor() { this.hits = new Map(); }

  check(key, limit, windowMs) {
    const now = Date.now();
    let arr = this.hits.get(key);
    if (!arr) { arr = []; this.hits.set(key, arr); }
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    if (arr.length >= limit) {
      return { ok: false, retryAfter: Math.ceil((arr[0] + windowMs - now) / 1000) };
    }
    arr.push(now);
    return { ok: true, retryAfter: 0 };
  }

  clear(key) { this.hits.delete(key); }

  sweep() {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, arr] of this.hits) {
      while (arr.length && arr[0] <= cutoff) arr.shift();
      if (!arr.length) this.hits.delete(k);
    }
  }
}

module.exports = {
  hashPassword, verifyPassword, burnPasswordWork,
  randomToken, hashToken, safeEqual,
  validateEmail, validateHandle, validatePassword,
  RateLimiter
};
