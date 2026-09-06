/* Monéta — the Vault.
   433 achievements across ten tracks. Every one ships unlocked, per spec:
   the Vault is a trophy case, not a grind. Icons are names from the SVG
   registry in icons.js — there are no emoji anywhere in this app. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};

  var TIERS = [
    { key: 'common',    name: 'Common',    color: '#8b83a6', glow: 'rgba(139,131,166,.35)' },
    { key: 'uncommon',  name: 'Uncommon',  color: '#4fd1a5', glow: 'rgba(79,209,165,.4)'  },
    { key: 'rare',      name: 'Rare',      color: '#57b6ff', glow: 'rgba(87,182,255,.45)' },
    { key: 'epic',      name: 'Epic',      color: '#b14dff', glow: 'rgba(177,77,255,.55)' },
    { key: 'legendary', name: 'Legendary', color: '#ffb02e', glow: 'rgba(255,176,46,.55)' },
    { key: 'mythic',    name: 'Mythic',    color: '#ff4d8d', glow: 'rgba(255,77,141,.6)'  }
  ];
  var TIER_BY_KEY = {};
  TIERS.forEach(function (t) { TIER_BY_KEY[t.key] = t; });

  var badges = [];
  var seenIds = {};

  function add(cat, icon, name, desc, tier, meta) {
    var id = (cat + '-' + name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (seenIds[id]) id += '-' + badges.length;
    seenIds[id] = 1;
    badges.push({
      id: id, cat: cat, icon: icon, name: name, desc: desc,
      tier: tier, unlocked: true, meta: meta || null
    });
  }

  function tierFor(i, n) {
    return TIERS[Math.min(TIERS.length - 1, Math.floor(i / n * TIERS.length))].key;
  }

  /* ── 1. Wealth ladder ───────────────────────────────────── */
  var WEALTH = [
    [1, 'coin', 'First Dollar', 'Hold a portfolio worth $1.'],
    [10, 'coins', 'Pocket Change', 'Cross $10 in total holdings.'],
    [50, 'receipt', 'Lunch Money', 'Cross $50 in total holdings.'],
    [100, 'card', 'Three Figures', 'Cross $100 in total holdings.'],
    [250, 'banknote', 'Quarter Grand', 'Cross $250 in total holdings.'],
    [500, 'ingot', 'Half a Grand', 'Cross $500 in total holdings.'],
    [1e3, 'medal', 'Four Figures', 'Cross $1,000 in total holdings.'],
    [2500, 'trendUp', 'Momentum', 'Cross $2,500 in total holdings.'],
    [5e3, 'rocket', 'Escape Velocity', 'Cross $5,000 in total holdings.'],
    [1e4, 'diamond', 'Five Figures', 'Cross $10,000 in total holdings.'],
    [25e3, 'shield', 'Fortified', 'Cross $25,000 in total holdings.'],
    [5e4, 'ribbon', 'Half Hundred K', 'Cross $50,000 in total holdings.'],
    [1e5, 'crown', 'Six Figures', 'Cross $100,000 in total holdings.'],
    [25e4, 'bank', 'Quarter Million', 'Cross $250,000 in total holdings.'],
    [5e5, 'vault', 'Half Million', 'Cross $500,000 in total holdings.'],
    [1e6, 'whale', 'Millionaire', 'Cross $1,000,000 in total holdings.'],
    [25e5, 'wave2', 'Deep Water', 'Cross $2,500,000 in total holdings.'],
    [5e6, 'wave', 'Tidal', 'Cross $5,000,000 in total holdings.'],
    [1e7, 'monolith', 'Eight Figures', 'Cross $10,000,000 in total holdings.'],
    [25e6, 'mountain', 'Summit', 'Cross $25,000,000 in total holdings.'],
    [5e7, 'comet', 'Impact Event', 'Cross $50,000,000 in total holdings.'],
    [1e8, 'planet', 'Nine Figures', 'Cross $100,000,000 in total holdings.'],
    [25e7, 'sparkle', 'Constellation', 'Cross $250,000,000 in total holdings.'],
    [5e8, 'void', 'Event Horizon', 'Cross $500,000,000 in total holdings.'],
    [1e9, 'galaxy', 'Billionaire', 'Cross $1,000,000,000 in total holdings.'],
    [1e10, 'spiral', 'Ten Billion', 'Cross $10,000,000,000 in total holdings.'],
    [1e11, 'orbit', 'Hundred Billion', 'Cross $100,000,000,000 in total holdings.'],
    [1e12, 'infinity', 'Trillionaire', 'Cross $1,000,000,000,000 in total holdings.'],
    [1e13, 'moon', 'Obsidian Standard', 'Cross ten trillion in total holdings.'],
    [1e14, 'gem', 'Beyond Measure', 'Hold more value than the market can price.']
  ];
  WEALTH.forEach(function (w, i) {
    add('Wealth', w[1], w[2], w[3], tierFor(i, WEALTH.length), { threshold: w[0] });
  });

  /* ── 2. Per-asset holder ladders ────────────────────────── */
  var HOLD_TIERS = [
    ['Initiate',  'Open your first position in ',  'common',    'seed'],
    ['Adept',     'Build a serious position in ',  'uncommon',  'tree'],
    ['Custodian', 'Hold a heavyweight bag of ',    'rare',      'key'],
    ['Whale',     'Command a whale-sized bag of ', 'epic',      'whale'],
    ['Sovereign', 'Own a legendary reserve of ',   'legendary', 'crown']
  ];
  M.COINS.forEach(function (c) {
    HOLD_TIERS.forEach(function (t) {
      add('Assets', t[3], c.name + ' ' + t[0], t[1] + c.name + ' (' + c.symbol + ').', t[2], { symbol: c.symbol });
    });
  });

  /* ── 3. Trading ─────────────────────────────────────────── */
  var TRADES = [
    ['receipt', 'First Fill', 'Execute your first trade.', 'common'],
    ['swap', 'Ten Fills', 'Execute 10 trades.', 'common'],
    ['layers', 'Hundred Fills', 'Execute 100 trades.', 'uncommon'],
    ['database', 'Thousand Fills', 'Execute 1,000 trades.', 'rare'],
    ['dice', 'Ten Thousand Fills', 'Execute 10,000 trades.', 'epic'],
    ['cpu', 'Hundred Thousand Fills', 'Execute 100,000 trades.', 'legendary'],
    ['bolt', 'Scalper', 'Close a position within 60 seconds.', 'common'],
    ['target', 'Sniper', 'Buy within 0.5% of a local bottom.', 'rare'],
    ['hook', 'Bottom Fisher', 'Buy an asset down more than 40%.', 'uncommon'],
    ['parachute', 'Falling Knife', 'Buy during a 20% single-session flush.', 'rare'],
    ['ice', 'Iron Hands', 'Hold through a 50% drawdown.', 'epic'],
    ['glove', 'Paper Hands', 'Sell within 5 minutes of buying.', 'common'],
    ['trendDown', 'Top Ticker', 'Sell within 1% of a local top.', 'epic'],
    ['refresh', 'Round Trip', 'Buy and sell the same asset in one day.', 'common'],
    ['magnet', 'Dip Magnet', 'Buy five dips in a single week.', 'uncommon'],
    ['flame', 'Full Send', 'Deploy your entire cash balance in one order.', 'rare'],
    ['snowflake', 'Cold Start', 'Trade before your first coffee.', 'common'],
    ['moon', 'Midnight Fill', 'Execute a trade between 00:00 and 04:00.', 'uncommon'],
    ['volcano', 'Volatility Surfer', 'Profit on an asset that moved 30% intraday.', 'epic'],
    ['crosshair', 'Perfect Exit', 'Exit a position at an all-time high.', 'legendary'],
    ['scales', 'Rebalancer', 'Rebalance your portfolio 50 times.', 'uncommon'],
    ['chain', 'Chain Reaction', 'Trade 10 different assets in one hour.', 'rare'],
    ['pulse', 'Degen Streak', 'Ten profitable trades in a row.', 'epic'],
    ['ruler', 'Precision', 'Fifty limit orders filled at your exact price.', 'rare'],
    ['antenna', 'Always On', 'Place an order from three different devices.', 'uncommon'],
    ['tower', 'Wall Breaker', 'Fill an order larger than the visible book.', 'legendary'],
    ['scissors', 'Both Sides', 'Buy and sell the same asset within one minute.', 'uncommon'],
    ['hourglass', 'Squeeze Play', 'Ride a 25% move in under an hour.', 'epic'],
    ['flag', 'Momentum Rider', 'Hold a winner for 30 straight green sessions.', 'legendary'],
    ['brain', 'Called It', 'Enter an asset the day before a 20% rip.', 'mythic']
  ];
  TRADES.forEach(function (t) { add('Trading', t[0], t[1], t[2], t[3]); });

  /* ── 4. Portfolio construction ──────────────────────────── */
  var PORTFOLIO = [
    ['basket', 'Two of a Kind', 'Hold 2 different assets.', 'common'],
    ['palette', 'Palette', 'Hold 5 different assets.', 'common'],
    ['grid', 'Spread', 'Hold 10 different assets.', 'uncommon'],
    ['globe', 'Wide Net', 'Hold 20 different assets.', 'rare'],
    ['bank', 'Index Fund', 'Hold 30 different assets.', 'epic'],
    ['layers', 'Full Board', 'Hold every listed asset at once.', 'legendary'],
    ['scales', 'Perfectly Balanced', 'No position over 10% of the book.', 'rare'],
    ['tower', 'Concentrated', 'Put 90% of the book into one asset.', 'rare'],
    ['snowflake', 'Cold Storage', 'Keep 50% of the book untouched for a month.', 'uncommon'],
    ['moon', 'Set and Forget', 'Go 90 days without a single trade.', 'epic'],
    ['coins', 'Cash Heavy', 'Sit on 50% cash through a red week.', 'uncommon'],
    ['flame', 'Fully Deployed', 'Drop cash below 1% of the book.', 'rare'],
    ['medal', 'Blue Chips Only', 'Hold only top-10 assets for a month.', 'rare'],
    ['web', 'Long Tail', 'Hold ten assets outside the top 25.', 'epic'],
    ['owl', 'Meme Portfolio', 'Hold every meme asset on the board.', 'legendary'],
    ['mask', 'Privacy Stack', 'Hold every privacy asset on the board.', 'epic'],
    ['cube', 'Layer Two Maxi', 'Hold every L2 on the board.', 'epic'],
    ['seed', 'Seed Round', 'Open ten positions under $100 each.', 'common'],
    ['mirror', 'Mirror Book', 'Match the market-cap weighting exactly.', 'legendary'],
    ['shield', 'Hedged', 'Hold offsetting positions in two correlated assets.', 'rare']
  ];
  PORTFOLIO.forEach(function (t) { add('Portfolio', t[0], t[1], t[2], t[3]); });

  /* ── 5. Streaks & loyalty ───────────────────────────────── */
  var STREAK_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 270, 365, 500, 730, 1000, 1500, 2000];
  var STREAK_ICON = ['sunrise', 'sun', 'calendar', 'calendar', 'flame', 'flame', 'rosette',
    'medal', 'compass', 'sparkle', 'ribbon', 'torch', 'monolith', 'galaxy', 'infinity'];
  STREAK_DAYS.forEach(function (d, i) {
    add('Streaks', STREAK_ICON[i], d === 1 ? 'Day One' : d + '-Day Streak',
      'Open the portal ' + d + ' day' + (d > 1 ? 's' : '') + ' in a row.',
      tierFor(i, STREAK_DAYS.length), { days: d });
  });
  var LOYALTY = [
    ['unlock', 'Signed In', 'Open the portal with your own account.', 'common'],
    ['moon', 'Obsidian Member', 'Choose the obsidian theme.', 'common'],
    ['clock', 'Early Access', 'Join during the opening season.', 'rare'],
    ['shieldOk', 'Verified', 'Complete your profile.', 'common'],
    ['user', 'Face of the Vault', 'Set a custom avatar.', 'common'],
    ['brush', 'Biographer', 'Write a bio.', 'common'],
    ['palette', 'Colourist', 'Customise your accent colour.', 'uncommon'],
    ['flag', 'Flag Bearer', 'Pick a custom banner.', 'uncommon'],
    ['ribbon', 'Titled', 'Equip a title on your profile.', 'uncommon'],
    ['pin', 'Curator', 'Showcase six badges on your profile.', 'rare'],
    ['bell', 'Watchful', 'Add ten assets to your watchlist.', 'uncommon'],
    ['owl', 'Night Owl', 'Spend an hour in the portal after midnight.', 'uncommon'],
    ['coffee', 'Morning Ritual', 'Open the portal before 07:00 ten times.', 'uncommon'],
    ['list', 'Concierge', 'Read every asset detail page.', 'rare'],
    ['map', 'Cartographer', 'Visit every section of the portal.', 'uncommon']
  ];
  LOYALTY.forEach(function (t) { add('Loyalty', t[0], t[1], t[2], t[3]); });

  /* ── 6. Charting & analysis ─────────────────────────────── */
  var CHARTS = [
    ['chart', 'Chartist', 'Open a chart for the first time.', 'common'],
    ['search', 'Zoom In', 'Switch to the one-hour timeframe.', 'common'],
    ['telescope', 'Long View', 'Switch to the all-time timeframe.', 'common'],
    ['link', 'Trend Liner', 'Compare two assets side by side.', 'uncommon'],
    ['thermometer', 'Heat Reader', 'Open the market heatmap.', 'uncommon'],
    ['candles', 'Candle Watcher', 'Watch a single chart for ten minutes.', 'uncommon'],
    ['ruler', 'Technician', 'Review all six timeframes on one asset.', 'rare'],
    ['brain', 'Pattern Seeker', 'Spot a double bottom in the wild.', 'rare'],
    ['pulse', 'Divergence', 'Catch price and volume disagreeing.', 'epic'],
    ['timer', 'Tick Counter', 'Sit through 1,000 live ticks.', 'rare'],
    ['tornado', 'Storm Watcher', 'Be online during a 10% market-wide move.', 'epic'],
    ['bell', 'Alert Setter', 'Arm a price alert.', 'common'],
    ['sliders', 'Fine Tuner', 'Adjust the chart smoothing.', 'uncommon'],
    ['hourglass', 'Compression', 'Watch volatility collapse to a two-week low.', 'epic'],
    ['volcano', 'Eruption', 'Watch volatility hit a two-week high.', 'epic'],
    ['bars', 'Data Nerd', 'Expand the full statistics panel.', 'common'],
    ['minus', 'Flat Line', 'Catch an asset move less than 0.1% in an hour.', 'rare'],
    ['wave', 'Rollercoaster', 'Catch an asset swing 20% both ways in a day.', 'legendary'],
    ['rocket', 'Vertical', 'Watch an asset gain 50% in one session.', 'legendary'],
    ['skull', 'Capitulation', 'Watch an asset lose 50% in one session.', 'legendary']
  ];
  CHARTS.forEach(function (t) { add('Charts', t[0], t[1], t[2], t[3]); });

  /* ── 7. Profit & loss milestones ────────────────────────── */
  var PNL = [1e2, 5e2, 1e3, 5e3, 1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 1e8, 1e9];
  var PNL_NAME = ['Green Shoots', 'Traction', 'Compounding', 'Snowball', 'Avalanche',
    'Windfall', 'Fortune', 'Dynasty', 'Legacy', 'Empire', 'Sovereign Wealth',
    'Market Force', 'Gravity Well'];
  var PNL_ICON = ['seed', 'trendUp', 'coins', 'snowflake', 'mountain', 'gift', 'gem',
    'crown', 'monolith', 'tower', 'vault', 'planet', 'void'];
  PNL.forEach(function (v, i) {
    add('Profit', PNL_ICON[i], PNL_NAME[i], 'Realise ' + M.fmt.compact(v) + ' in lifetime profit.',
      tierFor(i, PNL.length), { pnl: v });
  });
  var LOSS = [
    ['droplet', 'First Blood', 'Take your first realised loss.', 'common'],
    ['extinguisher', 'Damage Control', 'Cut a losing position early.', 'uncommon'],
    ['tombstone', 'Rekt', 'Take a 90% loss on a position.', 'rare'],
    ['salute', 'Still Standing', 'Recover a portfolio from a 70% drawdown.', 'legendary'],
    ['climb', 'Comeback', 'Return to break-even after four red weeks.', 'epic'],
    ['scales', 'Even Keel', 'Close a month exactly flat.', 'rare'],
    ['mask', 'Both Faces', 'Realise a five-figure gain and loss in one day.', 'epic']
  ];
  LOSS.forEach(function (t) { add('Profit', t[0], t[1], t[2], t[3]); });

  /* ── 8. Portal lore ─────────────────────────────────────── */
  var LORE = [
    ['key', 'Keyholder', 'Create your Monéta account.', 'mythic'],
    ['moon', 'Obsidian Rank I', 'Enter the first obsidian tier.', 'uncommon'],
    ['moon', 'Obsidian Rank II', 'Enter the second obsidian tier.', 'rare'],
    ['moon', 'Obsidian Rank III', 'Enter the third obsidian tier.', 'epic'],
    ['moon', 'Obsidian Rank IV', 'Enter the fourth obsidian tier.', 'legendary'],
    ['moon', 'Obsidian Rank V', 'Enter the final obsidian tier.', 'mythic'],
    ['signal', 'Violet Signal', 'Trigger the neon pulse.', 'rare'],
    ['mirror', 'Glasswalker', 'Cross the threshold ten times.', 'uncommon'],
    ['shield', 'Warden', 'Guard the portal for a full season.', 'epic'],
    ['web', 'Deep Index', 'Discover an asset outside the top 40.', 'rare'],
    ['antenna', 'Signal Found', 'Catch the ticker mid-flash.', 'uncommon'],
    ['sliders', 'Operator', 'Use every control on the dashboard.', 'rare'],
    ['flask', 'Alchemist', 'Convert one asset directly into another.', 'uncommon'],
    ['user', 'Reflection', 'Look at your own profile page.', 'common'],
    ['ghost', 'Ghost', 'Browse for an hour without trading.', 'common'],
    ['headphones', 'In the Zone', 'Keep the portal open for three hours.', 'rare'],
    ['home', 'Homebody', 'Return to the dashboard 100 times.', 'uncommon'],
    ['compass', 'Wayfinder', 'Use search to find an asset.', 'common'],
    ['torch', 'Torchbearer', 'Light up the vault for the first time.', 'common'],
    ['diamond', 'Facet', 'Collect a badge from every track.', 'legendary'],
    ['trophy', 'Completionist', 'Unlock every badge in the vault.', 'mythic'],
    ['eye', 'The Watcher', 'See a thousand price flashes.', 'epic'],
    ['flame', 'Fire', 'Survive a market-wide red day.', 'rare'],
    ['droplet', 'Water', 'Ride a market-wide green day.', 'rare'],
    ['wave', 'Air', 'Trade an asset with no volume.', 'epic'],
    ['mountain', 'Earth', 'Hold a position for a full year.', 'legendary'],
    ['void', 'Void Touched', 'Visit the portal at exactly 03:33.', 'mythic'],
    ['snapshot', 'Frozen Ledger', 'Take a snapshot of your portfolio.', 'uncommon'],
    ['monolith', 'Monolith', 'Reach the top of the leaderboard.', 'mythic'],
    ['sparkle', 'Afterglow', 'Sign out with a green day behind you.', 'common']
  ];
  LORE.forEach(function (t) { add('Portal', t[0], t[1], t[2], t[3]); });

  /* ── 9. Sector mastery, one pair per tag ────────────────── */
  var tagSet = {};
  M.COINS.forEach(function (c) { c.tags.forEach(function (t) { tagSet[t] = 1; }); });
  Object.keys(tagSet).sort().forEach(function (tag, i) {
    add('Sectors', 'rosette', tag + ' Specialist',
      'Hold three or more ' + tag.toLowerCase() + ' assets at once.',
      ['uncommon', 'rare', 'epic'][i % 3], { tag: tag });
  });
  Object.keys(tagSet).sort().forEach(function (tag) {
    add('Sectors', 'medal', tag + ' Maximalist',
      'Hold every ' + tag.toLowerCase() + ' asset on the board.', 'legendary', { tag: tag });
  });

  /* ── index ──────────────────────────────────────────────── */
  var CATEGORIES = [];
  badges.forEach(function (b) { if (CATEGORIES.indexOf(b.cat) < 0) CATEGORIES.push(b.cat); });

  function counts() {
    var out = {};
    TIERS.forEach(function (t) { out[t.key] = 0; });
    badges.forEach(function (b) { out[b.tier]++; });
    return out;
  }

  var BY_ID = {};
  badges.forEach(function (b) { BY_ID[b.id] = b; });

  M.badges = {
    all: badges,
    tiers: TIERS,
    tier: function (k) { return TIER_BY_KEY[k]; },
    categories: CATEGORIES,
    counts: counts,
    total: badges.length,
    get: function (id) { return BY_ID[id] || null; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
