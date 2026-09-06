'use strict';
/* Monéta — HTTP front door.
   Static files out of public/, JSON API under /api, and one set of security
   headers applied to everything. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const api = require('./api');
const store = require('./store');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const TRUST_PROXY = process.env.MONETA_TRUST_PROXY === '1';
const MAX_JSON_BODY = 64 * 1024;
const MAX_RAW_BODY = 1024 * 1024;      // avatar route caps far lower itself

/* ── security headers ─────────────────────────────────────── */
// script-src has no 'unsafe-inline': every script on the page is a file.
// style-src-attr allows the inline style="" attributes the views build.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');

const SECURE = process.env.MONETA_SECURE_COOKIES !== '0';

function baseHeaders() {
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none'
  };
  // Only meaningful over TLS; in plain-http dev mode it would lock the
  // developer's browser out of localhost.
  if (SECURE) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

/* ── static files ─────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function safeStaticPath(urlPath) {
  // decodeURIComponent can throw on malformed input; treat that as not-found.
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.indexOf('\0') >= 0) return null;

  const rel = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize(rel));

  // The resolved path must stay inside public/ — this is the traversal guard.
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  return resolved;
}

function serveStatic(req, res, urlPath) {
  const file = safeStaticPath(urlPath);
  if (!file) return notFound(res);

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // Pretty URLs: /login -> /login.html
      if (!path.extname(file)) {
        return fs.stat(file + '.html', (e2, s2) => {
          if (e2 || !s2.isFile()) return notFound(res);
          sendFile(req, res, file + '.html', s2);
        });
      }
      return notFound(res);
    }
    sendFile(req, res, file, st);
  });
}

function sendFile(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = '"' + st.size.toString(16) + '-' + st.mtimeMs.toString(16) + '"';

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, Object.assign(baseHeaders(), { ETag: etag }));
    return res.end();
  }

  const headers = Object.assign(baseHeaders(), {
    'Content-Type': type,
    'Content-Length': st.size,
    ETag: etag,
    'Cache-Control': (ext === '.html' || file.endsWith('sw.js'))
      ? 'no-cache'
      : 'public, max-age=3600, must-revalidate'
  });
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.end()).pipe(res);
}

function notFound(res) {
  res.writeHead(404, Object.assign(baseHeaders(), { 'Content-Type': 'text/plain; charset=utf-8' }));
  res.end('Not found');
}

/* ── request plumbing ─────────────────────────────────────── */
function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k) continue;
    let v = part.slice(eq + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep the raw value */ }
    out[k] = v;
  }
  return out;
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '0.0.0.0';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (status, msg) => {
      if (settled) return;
      settled = true;
      const e = new api.HttpError(status, msg);
      // Stop reading, but let the error response go out before the socket
      // closes — destroying here would surface as a hang-up, not a 413.
      e.closeConnection = true;
      req.pause();
      reject(e);
    };
    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) return fail(413, 'Request body too large.');
      chunks.push(c);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', () => fail(400, 'Could not read the request.'));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign(baseHeaders(), {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }));
  res.end(body);
}

/* ── router ───────────────────────────────────────────────── */
async function handleApi(req, res, url) {
  const ctx = {
    req,
    res,
    url,
    ip: clientIp(req),
    cookies: parseCookies(req.headers.cookie),
    body: null,
    raw: null
  };

  // /api/avatar/<id> is a GET with a path parameter; everything else is exact.
  if (req.method === 'GET' && url.pathname.startsWith('/api/avatar/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/avatar/'.length));
    return api.serveAvatar(ctx, id);
  }

  const key = req.method + ' ' + url.pathname;
  const handler = api.routes[key];
  if (!handler) {
    // Distinguish "wrong verb" from "no such route" for easier debugging.
    const exists = Object.keys(api.routes).some((k) => k.endsWith(' ' + url.pathname));
    throw new api.HttpError(exists ? 405 : 404, exists ? 'Method not allowed.' : 'No such endpoint.');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (url.pathname === '/api/avatar' && req.method === 'POST') {
      ctx.raw = await readBody(req, MAX_RAW_BODY);
    } else {
      const raw = await readBody(req, MAX_JSON_BODY);
      if (raw.length) {
        if (type !== 'application/json') throw new api.HttpError(415, 'Send JSON.');
        try { ctx.body = JSON.parse(raw.toString('utf8')); }
        catch { throw new api.HttpError(400, 'Malformed JSON.'); }
        if (ctx.body === null || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) {
          throw new api.HttpError(400, 'Expected a JSON object.');
        }
      } else {
        ctx.body = {};
      }
    }
  }

  const out = await handler(ctx);
  if (out === null) return;         // handler wrote the response itself
  sendJson(res, 200, out);
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch {
    return sendJson(res, 400, { error: 'Bad request URL.' });
  }

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      if (res.headersSent || res.writableEnded) { try { res.end(); } catch { /* gone */ } return; }
      const status = err && err.status ? err.status : 500;
      if (status >= 500) console.error('[api]', req.method, url.pathname, err);
      const payload = { error: status >= 500 ? 'Something went wrong on our side.' : err.message };
      if (err && err.extra && status < 500) Object.assign(payload, err.extra);
      if (status === 429 && err.extra && err.extra.retryAfter) {
        res.setHeader('Retry-After', String(err.extra.retryAfter));
      }
      if (err && err.closeConnection) res.setHeader('Connection', 'close');
      sendJson(res, status, payload);
      if (err && err.closeConnection) {
        res.on('finish', () => { try { req.destroy(); } catch { /* already gone */ } });
      }
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign(baseHeaders(), { Allow: 'GET, HEAD' }));
    return res.end();
  }
  serveStatic(req, res, url.pathname);
});

server.headersTimeout = 20000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 30000;

/* ── lifecycle ────────────────────────────────────────────── */
function shutdown(signal) {
  console.log('\n[moneta] ' + signal + ' — flushing state');
  store.saveSync();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[moneta] uncaught:', err);
  store.saveSync();
});
process.on('unhandledRejection', (err) => console.error('[moneta] unhandled rejection:', err));

if (require.main === module) {
  store.load();
  server.listen(PORT, HOST, () => {
    console.log('Monéta running on http://localhost:' + PORT);
    if (process.env.MONETA_SECURE_COOKIES === '0') {
      console.log('  cookies: Secure flag OFF (plain-http development mode)');
    }
  });
}

module.exports = { server, safeStaticPath, parseCookies };
