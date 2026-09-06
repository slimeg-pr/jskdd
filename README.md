# Monéta

A login-gated crypto portal. Obsidian black, neon violet, live charts, and a
vault of 433 badges that are all already unlocked.

The front end is plain HTML, CSS and vanilla JavaScript. The back end is a
Node HTTP server with **no dependencies** — `node:http`, `node:crypto` and the
filesystem. There is no build step and nothing to install.

There are two builds from one codebase.

| | **Server build** | **Standalone build** |
|---|---|---|
| Run it | `npm start` | open the published page |
| Accounts | email + password, scrypt | none — access is who the page is shared with |
| State | your Node server | the artifact document store |
| Trades | priced by the server | priced in the page |
| Avatar upload | yes | sigils only |
| Install to home screen | yes (PWA) | yes (browser "Add to Home Screen") |

Everything above the two seams — `Moneta.api` for state, `Moneta.feed` for
prices — is the same code in both.

## Run the server build

```bash
npm start                 # http://localhost:8787
npm run dev               # same, with Secure cookies off for plain-http localhost
npm test                  # 68 API, security and wiring tests
```

Create an account on the landing page. There is no shared key and no demo
login — every visitor gets their own account, and their portfolio lives on the
server.

It is an installable PWA: a manifest, maskable icons and a service worker that
caches the app shell and **never** caches `/api`, so prices and balances are
always live. On a phone, "Add to Home Screen" gives a standalone app with no
browser chrome.

## Build the standalone version

```bash
node tools/build-artifact.js      # -> build/moneta.html
```

One self-contained HTML file — every stylesheet and module inlined, no
external scripts — that runs the whole portal with no server behind it.
`public/assets/js/standalone.js` supplies `Moneta.api` (backed by the artifact
document store, so a portfolio built on a phone is there on a laptop) and
`Moneta.feed` (a local tick loop). When no store is available the app still
runs, in memory, and says so on screen.

Two honest caveats for that build. Without a server there is nowhere to verify
a password, so there is no login — access is whatever the page is shared with,
and a fake sign-in form would be theatre. And the market engine runs in the
page, so a determined viewer could price their own fill; it is a simulation
with no money in it, but it is not the same guarantee the server build gives.
Because the runtime here has no per-viewer identity, everyone who can edit the
page shares one portfolio — fine for a private page, worth knowing before
sharing one.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | listen port |
| `HOST` | `0.0.0.0` | bind address |
| `MONETA_DATA_DIR` | `./data` | database + avatar blobs |
| `MONETA_SECURE_COOKIES` | on | set to `0` only for plain-http localhost |
| `MONETA_TRUST_PROXY` | off | set to `1` only when behind a proxy you control |

Put it behind TLS in production. The session cookie carries `Secure` by
default, so over plain HTTP the browser will drop it unless you run `npm run dev`.

## What's in it

**Sign in / create account** (`/`) — the Monéta crown, a two-tab card, a live
password-strength meter and a public ticker strip. A wrong password and an
unknown account produce the same message in the same amount of time.

**The portal** (`/portal.html`) — reachable only with a session.

- **Home** — total balance as an animated counter that re-tweens on every tick
  and flashes green or red with the move, a live portfolio chart across six
  timeframes, cash and position stats, top movers, holdings and pinned badges.
- **My Assets** — every open position with price, quantity, value, 1h/24h/7d
  moves and a live sparkline, sortable three ways.
- **Markets** — all 41 assets, every column sortable, sector and watchlist
  filters, per-cell price flashes, sparklines redrawn each tick.
- **Asset detail** — a full chart with area and candlestick modes, a crosshair
  readout, twelve statistics, and a buy/sell panel **priced by the server**.
- **The Vault** — 433 badges across ten tracks, all unlocked, with rarity and
  category filters, search, detail cards and a six-slot showcase.
- **Profile** — banner, avatar (20 generated sigils or your own uploaded
  image), display name, handle, title, location, bio and an accent colour that
  recolours the portal live.

## On a phone

The phone is a first-class surface, not a squeezed desktop.

- The sidebar becomes a bottom tab bar; the top bar and every view respect the
  notch and the home indicator via `env(safe-area-inset-*)`.
- **Tables become cards.** Below 720px each market row is a card laid out on a
  small grid — asset and price on the first line, sparkline and 24h move on the
  second, holdings where they apply. The columns that only matter on a big
  screen (rank, 1h, 7d, market cap, volume) drop out; they are all on the asset
  page.
- Filter rails scroll horizontally with snap points instead of wrapping into a
  tall block, and the page body never scrolls sideways on any view.
- Every control clears a 32px touch target; hover effects are suppressed under
  `(hover: none)` so nothing sticks in a pressed state after a tap.
- Stat tiles go two-up, the vault goes two-up, charts and type step down, and
  short landscape phones give the chart its height back.

Verified at 390×844 with touch emulation: no horizontal overflow on any view,
no undersized targets, no console errors.

## Security

This is a toy market, but the account system around it is built properly.

**Credentials**
- Passwords are hashed with **scrypt** (N=32768, r=8, p=1, 16-byte random salt,
  ~100 ms per hash) and verified with `timingSafeEqual`. Plaintext never
  touches disk.
- A failed login against an unknown account burns the same scrypt work as a
  real one, and both answer *"Email or password is incorrect."* — the form is
  not an account enumerator.
- Minimum 10 characters, a common-password blocklist, and a rule against
  passwords containing your own email or handle.

**Sessions**
- 256-bit random token in an `HttpOnly; Secure; SameSite=Strict` cookie. Page
  JavaScript cannot read it (`document.cookie` is empty).
- Only the **SHA-256 of the token** is stored, so a leaked database cannot be
  replayed.
- New token on every login, all previous sessions dropped, ten concurrent
  sessions per account maximum, 14-day expiry with a sliding refresh.

**CSRF** — mutations need all three of: the `SameSite=Strict` cookie, a
same-origin `Origin`/`Sec-Fetch-Site`, and an `X-CSRF-Token` header matching a
per-session secret compared in constant time.

**Rate limiting** — 20 logins per IP and 8 per account per 15 minutes; 25
sign-up attempts and 5 actual account creations per IP per hour; 60 orders and
120 profile writes per account per minute; 10 avatar uploads per 10 minutes.
Every limit answers 429 with `Retry-After`.

**The market is server-authoritative.** The engine runs in the server process
and pushes prices over Server-Sent Events. A trade is priced from that process
— a request cannot name its own fill, and the browser cannot talk its own
portfolio up before selling. Order size, side, symbol, cash and holdings are
all validated server-side.

**XSS** — CSP is `default-src 'none'` with `script-src 'self'`; there is no
`unsafe-inline` for scripts, no inline `<script>` block and no inline event
handler anywhere in the HTML. Every string a person can type is escaped before
it reaches the DOM, and the values that end up in `style` attributes or CSS
custom properties (accent colour, banner, avatar sigil) are validated against
allow-lists on the server. A live probe pushing six XSS payloads through the
API and rendering them produces zero injected nodes and zero CSP violations.

**Uploads** — avatars are accepted only if the *bytes* start with a PNG, JPEG,
GIF or WebP signature; the request's `Content-Type` is ignored. SVG is refused,
because SVG can carry script. Files are capped at 512 KB, stored outside the
web root, and served back with the sniffed type plus `nosniff`, a sandbox CSP
and `Cache-Control: private`. An avatar is readable only by its owner.

**Other** — path traversal is blocked by resolving every static request and
requiring it to stay inside `public/`; bodies are capped (64 KB JSON, 1 MB
upload) and answer 413 rather than hanging up; JSON must be an object;
prototype-pollution payloads do not reach `Object.prototype`; 5xx responses say
nothing about internals; `X-Forwarded-For` is only trusted when you opt in.

### What is not here

No email verification or password reset (there is no mail service), no 2FA, no
account deletion, no audit log. The store is a JSON file with atomic writes —
fine for one process, not for a cluster; swapping in SQLite or Postgres only
touches `server/store.js`.

### Local storage

Both builds store exactly one key, `moneta.ui.v1`, holding five cosmetic
values — the last tab, chart timeframe, chart style and sort order — each
validated against an allow-list on read. Identity, balances, holdings,
watchlist and profile all live on the server. A test in the suite fails the
build if any client file touches web storage outside `prefs.js`.

## The market engine

`public/assets/js/market.js` runs in both the browser and the server. It builds
each asset's history from a seeded PRNG, so the same asset always has the same
past: a two-year daily random walk with per-asset volatility, bent to a
deterministic long-run multiple, with a slow bull/bear cycle overlaid so charts
have real peaks and drawdowns (most assets sit well below their all-time high).
The last day is then bridged down to one-minute resolution.

Only the server's copy ticks. Every 620 ms it advances the walk — one tick is
one chart minute, so candles visibly crawl — and broadcasts the price vector
over SSE. Browsers render what they are given. The **Live** pill pauses the
local view without disturbing the feed.

All prices, market caps and volumes are **simulated**. Nothing touches an
exchange and no real funds are involved.

## Icons and artwork

There are no emoji anywhere in the app; a test enforces it.

- **The Monéta mark** is the crown-and-sparkle logo, vectorised from the
  supplied artwork with potrace, symmetrised, and shipped as a transparent
  `currentColor` path (`public/assets/img/moneta-mark.svg`, 1.8 KB, 0.3 %
  pixel difference from the source).
- **The wordmark** is set in a real typeface and shipped as outlines — see
  *Setting the wordmark* below. Until a font is supplied it renders as live
  gradient text in the display stack.
- **UI and badge icons** are a 136-glyph line-art set drawn for this project on
  a 24×24 grid (`public/assets/js/icons.js`), rendered inline so they inherit
  colour and need no network request.
- **Coin logos** are 41 inline SVGs built from the real brand marks. Geometric
  marks (Bitcoin, Ethereum, Solana, XRP, Cardano, Polkadot, Chainlink, BNB,
  Cosmos…) are traced; where a brand's identity *is* a glyph (Litecoin's Ł,
  Dogecoin's Ð, Tezos' ꜩ, Optimism's OP) that glyph is used. A handful of the
  more illustrative logos are recognisable approximations rather than exact
  reproductions.
- **Avatars** are 20 generated sigils from the same icon set, or your own
  uploaded image.

The only external request the app makes is the Google Fonts stylesheet, loaded
non-blockingly from JavaScript; offline you get the system font stack.

## Setting the wordmark

The logo type is generated, not hand-drawn. Drop a font file somewhere local
and run:

```bash
pip install fonttools uharfbuzz
python3 tools/make-wordmark.py path/to/MadawaskaRiver.otf
```

That writes `public/assets/js/wordmark.js` and
`public/assets/img/moneta-wordmark.svg`. Both pages pick the result up on the
next load — the sign-in wordmark and the sidebar brand — with no other edit.
Without it, `wordmark.js` is a placeholder and the pages fall back to live
text, so the app works either way.

Shaping runs through HarfBuzz, so OpenType features apply: ligatures,
contextual alternates and kerning all land as the designer intended. That
matters for a face like **Madawaska River** (Ray Larabie / Typodermic), whose
distressed texture is built from custom ligature substitutions rather than
baked into the glyph outlines — a naive `cmap` lookup would render the clean
letterforms and lose the effect entirely.

Useful flags: `--text` to set a different string, `--features` to change the
feature set, `--letter-spacing` for tracking, `--pad` for breathing room.

### Why outlines and not a webfont

The wordmark ships as vector paths and **no font binary lives in this repo**.
That is partly technical — zero font requests, identical rendering everywhere,
no FOUT on a logo — and partly licensing. Madawaska River's dafont licence
covers desktop use, explicitly including making logos and web graphics;
embedding the font itself in a web page is a separate licence you get from
[typodermicfonts.com](https://typodermicfonts.com). Converting the set logo to
outlines is the former. Bundling the `.otf` behind an `@font-face` rule would
be the latter. If you hold a webfont licence and would rather self-host the
live font, that is a small change — but check the licence you actually have
before making it.

## Layout

```
server/
  index.js       HTTP front door, static files, security headers, routing
  api.js         auth, profile, trading, avatars, SSE stream
  auth.js        scrypt hashing, tokens, validation, rate limiter
  store.js       atomic JSON persistence + avatar blobs
  engine.js      loads the shared market modules and runs the tick loop
public/
  index.html     sign in / create account
  portal.html    the terminal shell
  assets/css/    theme.css · auth.css · portal.css
  assets/js/     icons · mark · coins · market · chart · badges
                 util · prefs · api · auth · portal · fonts
  assets/img/    moneta-mark.svg · favicon.svg
  manifest.webmanifest · sw.js   installable app shell
tools/
  make-wordmark.py   sets the wordmark in a font and emits outlines
  build-artifact.js  assembles the single-file standalone build
test/run.js      68 API, security and wiring tests
build/           generated standalone page; git-ignored
data/            created at runtime; git-ignored
```

Works down to phone widths — the sidebar becomes a bottom tab bar. Respects
`prefers-reduced-motion`.
