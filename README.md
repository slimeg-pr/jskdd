# Monéta

A key-gated crypto portal. Obsidian black, neon violet, live charts, and a vault
of 433 badges that are all already unlocked.

Everything is static: plain HTML, CSS and vanilla JavaScript. No build step, no
framework, no dependencies, no network calls (webfonts are the only optional
request, and the page falls back to system fonts if they don't load).

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk works too.

**Access key: `SlimeGeo`** (matched case-insensitively, whitespace trimmed).

## What's in it

**The gate** (`index.html`) — sigil, wordmark, one password field. A wrong key
shakes the field and refuses; the right key flashes violet and drops you into
the terminal. A live ticker strip runs underneath. The gate sets a
`sessionStorage` flag; `portal.html` bounces back to the gate without it, and
the lock button in the sidebar clears it.

**The portal** (`portal.html`)

- **Home** — total balance in a large animated counter that re-tweens on every
  tick and flashes green or red with the move, a live portfolio area chart across
  six timeframes (1H / 1D / 1W / 1M / 1Y / ALL), cash and position stats, top
  movers, your holdings table and your pinned badges.
- **My Assets** — every open position with price, quantity, value, 1h/24h/7d
  moves and a live sparkline. Sortable by value, move or name.
- **Markets** — all 41 assets, sortable on every column, filterable by sector or
  watchlist, with per-row price flashes and sparklines that redraw each tick.
- **Asset detail** — a full-height chart with area and candlestick modes, a
  crosshair with a price readout, twelve statistics, and a working buy/sell panel
  that moves real (simulated) balances between cash and the position.
- **The Vault** — 433 badges across ten tracks, every one unlocked. Filter by
  rarity and category, search by name, click any badge for its detail card, pin
  up to six to your showcase.
- **Profile** — banner, avatar (emoji picker or your own uploaded image), display
  name, handle, title, location, bio, accent colour (ten presets plus a custom
  picker) and a badge showcase. The accent recolours the whole portal live.

Everything you change persists to `localStorage`, so a refresh keeps your
profile, holdings, watchlist and pins.

## The market engine

`assets/js/market.js` builds each asset's history from a seeded PRNG, so the same
asset always has the same past. Per asset it walks two years of daily closes with
its own volatility, bends the walk to a deterministic long-run multiple, overlays
a slow bull/bear cycle so charts have real peaks (most assets sit well below their
all-time high), then bridges the final day down to one-minute resolution.

From there a live loop ticks every 620 ms — one tick is one chart minute, so the
candles visibly crawl. Ticks add spikes and flushes at random, and roll a new
daily close every 60 ticks. The **Live** pill in the top bar pauses and resumes it.

Prices, market caps, volumes and every number on the page are **simulated**.
Nothing here touches an exchange and no real funds are involved.

## Logos

Each of the 41 assets has an inline SVG mark in `assets/js/coins.js` — drawn by
hand from the real brand marks, not fetched from a CDN, so the portal renders
with zero external requests. Iconic geometric marks (Bitcoin, Ethereum, Solana,
XRP, Cardano, Polkadot, Chainlink, Cosmos, BNB…) are traced; where a brand's
identity *is* a letterform or glyph (Litecoin's Ł, Dogecoin's Ð, Tezos' ꜩ,
Optimism's OP) that glyph is used. A handful of the more illustrative logos are
recognisable approximations rather than exact reproductions.

## Layout

```
index.html            the gate
portal.html           the terminal shell
assets/css/theme.css  obsidian palette, shared atoms
assets/css/gate.css   gate-only styling
assets/css/portal.css portal chrome, tables, vault, profile
assets/js/coins.js    41 assets + inline SVG logos
assets/js/market.js   seeded history + live tick engine
assets/js/chart.js    canvas area/candle renderer, sparkline paths
assets/js/badges.js   the 433-badge catalogue
assets/js/store.js    localStorage profile, holdings, watchlist
assets/js/util.js     number formatting, DOM helpers
assets/js/gate.js     key check and unlock transition
assets/js/portal.js   views, live wiring, trading, customisation
```

Works down to phone widths — the sidebar becomes a bottom tab bar. Respects
`prefers-reduced-motion`.
