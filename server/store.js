'use strict';
/* Monéta — durable state.
   A single JSON document written atomically (temp file + rename) with a
   debounced flush, plus an avatar blob directory. Small, dependency-free,
   and good enough for this app's shape; swapping in SQLite or Postgres
   later only touches this file. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.MONETA_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'moneta.json');
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(AVATAR_DIR, { recursive: true, mode: 0o700 });
}

const EMPTY = { version: 1, users: {}, byEmail: {}, byHandle: {}, sessions: {} };

let db = null;
let flushTimer = null;
let flushing = false;
let dirtyAgain = false;

function load() {
  if (db) return db;
  ensureDirs();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = Object.assign({}, EMPTY, parsed);
    for (const k of Object.keys(EMPTY)) if (db[k] == null) db[k] = EMPTY[k];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Never silently start from scratch over a readable-but-broken file.
      console.error('[store] could not read ' + DB_FILE + ':', err.message);
      if (err instanceof SyntaxError) {
        const backup = DB_FILE + '.corrupt-' + Date.now();
        try { fs.renameSync(DB_FILE, backup); console.error('[store] moved to ' + backup); }
        catch { /* nothing more we can do */ }
      } else {
        throw err;
      }
    }
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  return db;
}

async function flushNow() {
  if (flushing) { dirtyAgain = true; return; }
  flushing = true;
  const tmp = DB_FILE + '.' + process.pid + '.tmp';
  try {
    const body = JSON.stringify(db);
    await fs.promises.writeFile(tmp, body, { mode: 0o600 });
    await fs.promises.rename(tmp, DB_FILE);   // atomic on POSIX
  } catch (err) {
    console.error('[store] write failed:', err.message);
    try { await fs.promises.unlink(tmp); } catch { /* already gone */ }
  } finally {
    flushing = false;
    if (dirtyAgain) { dirtyAgain = false; save(); }
  }
}

/** Mark dirty; writes coalesce into one flush per 400ms. */
function save() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushNow(); }, 400);
  if (flushTimer.unref) flushTimer.unref();
}

function saveSync() {
  if (!db) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const tmp = DB_FILE + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[store] sync write failed:', err.message);
  }
}

/* ── users ────────────────────────────────────────────────── */
function newId() { return crypto.randomBytes(12).toString('base64url'); }

function userByEmail(emailLower) {
  const d = load();
  const id = d.byEmail[emailLower];
  return id ? d.users[id] || null : null;
}
function userByHandle(handleLower) {
  const d = load();
  const id = d.byHandle[handleLower];
  return id ? d.users[id] || null : null;
}
function userById(id) {
  const d = load();
  return (id && d.users[id]) || null;
}

function insertUser(user) {
  const d = load();
  d.users[user.id] = user;
  d.byEmail[user.emailLower] = user.id;
  d.byHandle[user.handleLower] = user.id;
  save();
  return user;
}

function reindexHandle(user, oldHandleLower) {
  const d = load();
  if (oldHandleLower && d.byHandle[oldHandleLower] === user.id) delete d.byHandle[oldHandleLower];
  d.byHandle[user.handleLower] = user.id;
  save();
}

/* ── sessions ─────────────────────────────────────────────── */
function putSession(tokenHash, session) {
  const d = load();
  d.sessions[tokenHash] = session;
  save();
}
function getSession(tokenHash) {
  const d = load();
  const s = d.sessions[tokenHash];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) { delete d.sessions[tokenHash]; save(); return null; }
  return s;
}
function dropSession(tokenHash) {
  const d = load();
  if (d.sessions[tokenHash]) { delete d.sessions[tokenHash]; save(); }
}
function dropUserSessions(userId) {
  const d = load();
  let n = 0;
  for (const [k, s] of Object.entries(d.sessions)) {
    if (s.userId === userId) { delete d.sessions[k]; n++; }
  }
  if (n) save();
  return n;
}
function sweepSessions() {
  const d = load();
  const now = Date.now();
  let n = 0;
  for (const [k, s] of Object.entries(d.sessions)) {
    if (s.expiresAt <= now) { delete d.sessions[k]; n++; }
  }
  if (n) save();
  return n;
}

/* ── avatars ──────────────────────────────────────────────── */
function avatarPath(name) {
  // `name` is always generated here, never taken from a request, but resolve
  // and re-check anyway so a future caller can't walk out of the directory.
  const p = path.resolve(AVATAR_DIR, path.basename(String(name)));
  if (path.dirname(p) !== path.resolve(AVATAR_DIR)) throw new Error('bad avatar path');
  return p;
}
function writeAvatar(userId, buf, ext) {
  const name = userId + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
  fs.writeFileSync(avatarPath(name), buf, { mode: 0o600 });
  return name;
}
function readAvatar(name) {
  try { return fs.readFileSync(avatarPath(name)); } catch { return null; }
}
function deleteAvatar(name) {
  if (!name) return;
  try { fs.unlinkSync(avatarPath(name)); } catch { /* already gone */ }
}

module.exports = {
  DATA_DIR, AVATAR_DIR,
  load, save, saveSync, newId,
  userByEmail, userByHandle, userById, insertUser, reindexHandle,
  putSession, getSession, dropSession, dropUserSessions, sweepSessions,
  writeAvatar, readAvatar, deleteAvatar
};
