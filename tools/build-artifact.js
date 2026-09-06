#!/usr/bin/env node
'use strict';
/* Monéta — assemble the standalone build.
 *
 * The Artifact runtime serves one HTML file and blocks external scripts, so
 * this concatenates every stylesheet and module into a single page. The app
 * code is untouched: portal.js talks to Moneta.api and Moneta.feed, and
 * standalone.js supplies both without a server behind them.
 *
 *   node tools/build-artifact.js   ->  build/moneta.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'build');
const OUT = path.join(OUT_DIR, 'moneta.html');

const CSS = ['theme.css', 'portal.css'];

// Order matters: coins before market (market reads M.COINS at init), and
// standalone before portal (portal reads M.api / M.feed / M.build at load).
const JS = [
  'icons.js', 'mark.js', 'wordmark.js',
  'coins.js', 'util.js', 'market.js', 'badges.js',
  'prefs.js', 'chart.js',
  'standalone.js',
  'portal.js'
];

const read = (rel) => fs.readFileSync(path.join(PUB, rel), 'utf8');

/** Body markup from portal.html, minus the parts only the server build uses. */
function bodyFromPortal() {
  const html = read('portal.html');
  const start = html.indexOf('<body class="portal">');
  const end = html.indexOf('<script');
  if (start < 0 || end < 0) throw new Error('portal.html: cannot find the body region');

  return html
    .slice(html.indexOf('>', start) + 1, end)
    .replace(/^\s*\n/gm, '\n')
    .trim();
}

function guard() {
  // The runtime resolves capabilities asynchronously and may never answer.
  // Boot the page regardless; standalone.js already treats a null store as
  // "run in memory".
  return `
/* ── standalone boot notice ───────────────────────────────────────── */
(function () {
  'use strict';
  var LABEL = {
    ready:     null,
    saved:     null,
    ephemeral: 'Running in memory — this device only, not saved.',
    readonly:  'Read-only view — changes will not be saved.',
    error:     'Could not save. Your last change may be lost.'
  };
  window.Moneta.standalone.onStorageChange(function (kind) {
    var msg = LABEL[kind];
    var bar = document.getElementById('storeNote');
    if (!bar) return;
    if (!msg) { bar.hidden = true; return; }
    bar.textContent = msg;
    bar.hidden = false;
  });
})();`;
}

function build() {
  const css = CSS.map((f) => `/* ${f} */\n${read('assets/css/' + f)}`).join('\n\n');
  const js = JS.map((f) => `\n/* ══ ${f} ══ */\n${read('assets/js/' + f)}`).join('\n');
  const body = bodyFromPortal();

  const page = `<title>Monéta Portal</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap">
<meta name="theme-color" content="#05040a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Monéta">
<style>
${css}

/* ── standalone-only chrome ── */
.store-note {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 40;
  margin: 0 12px;
  padding: 9px 13px;
  border-radius: var(--r);
  background: rgba(22,17,38,.97);
  border: 1px solid rgba(255,176,46,.4);
  color: var(--gold);
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
}
.store-note[hidden] { display: none; }
@media (min-width: 981px) {
  .store-note { bottom: 16px; left: auto; right: 16px; max-width: 320px; margin: 0; }
}
</style>

${body}
<div class="store-note" id="storeNote" hidden></div>

<script>
${js}
${guard()}
</script>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, page, 'utf8');

  const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
  console.log('wrote build/moneta.html  ' + kb + ' KB');
  console.log('  stylesheets : ' + CSS.length);
  console.log('  modules     : ' + JS.length);

  // Cheap guards against the two mistakes that silently break an artifact.
  if (/<script[^>]+\ssrc=/i.test(page)) throw new Error('external script survived inlining');
  // Word boundaries matter here: <header> is legitimate, <head> is not.
  if (/<!doctype\b|<html[\s>]|<head[\s>]|<body[\s>]/i.test(page)) {
    throw new Error('page must not carry its own document shell');
  }
  if (Buffer.byteLength(page) > 16 * 1024 * 1024) throw new Error('over the 16MB artifact limit');
  console.log('  checks      : passed');
}

build();
