/* Monéta — the Vault.
   Several hundred achievements across seven tracks. Every one of them
   ships unlocked, per spec: the Vault is a trophy case, not a grind. */

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
    var idx = Math.min(TIERS.length - 1, Math.floor(i / n * TIERS.length));
    return TIERS[idx].key;
  }

  /* ── 1. Wealth ladder ───────────────────────────────────── */
  var WEALTH = [
    [1, '💵', 'First Dollar', 'Hold a portfolio worth $1.'],
    [10, '🪙', 'Pocket Change', 'Cross $10 in total holdings.'],
    [50, '🎟️', 'Lunch Money', 'Cross $50 in total holdings.'],
    [100, '💳', 'Three Figures', 'Cross $100 in total holdings.'],
    [250, '📈', 'Quarter Grand', 'Cross $250 in total holdings.'],
    [500, '🧿', 'Half a Grand', 'Cross $500 in total holdings.'],
    [1e3, '🏅', 'Four Figures', 'Cross $1,000 in total holdings.'],
    [2500, '🔷', 'Momentum', 'Cross $2,500 in total holdings.'],
    [5e3, '🚀', 'Escape Velocity', 'Cross $5,000 in total holdings.'],
    [1e4, '💎', 'Five Figures', 'Cross $10,000 in total holdings.'],
    [25e3, '🛡️', 'Fortified', 'Cross $25,000 in total holdings.'],
    [5e4, '⚜️', 'Half Hundred K', 'Cross $50,000 in total holdings.'],
    [1e5, '👑', 'Six Figures', 'Cross $100,000 in total holdings.'],
    [25e4, '🏛️', 'Quarter Million', 'Cross $250,000 in total holdings.'],
    [5e5, '🌌', 'Half Million', 'Cross $500,000 in total holdings.'],
    [1e6, '🦈', 'Millionaire', 'Cross $1,000,000 in total holdings.'],
    [25e5, '🐋', 'Deep Water', 'Cross $2,500,000 in total holdings.'],
    [5e6, '🌊', 'Tidal', 'Cross $5,000,000 in total holdings.'],
    [1e7, '🗿', 'Eight Figures', 'Cross $10,000,000 in total holdings.'],
    [25e6, '🏔️', 'Summit', 'Cross $25,000,000 in total holdings.'],
    [5e7, '☄️', 'Impact Event', 'Cross $50,000,000 in total holdings.'],
    [1e8, '🪐', 'Nine Figures', 'Cross $100,000,000 in total holdings.'],
    [25e7, '🌠', 'Constellation', 'Cross $250,000,000 in total holdings.'],
    [5e8, '🕳️', 'Event Horizon', 'Cross $500,000,000 in total holdings.'],
    [1e9, '🐉', 'Billionaire', 'Cross $1,000,000,000 in total holdings.'],
    [1e10, '🌀', 'Ten Billion', 'Cross $10,000,000,000 in total holdings.'],
    [1e11, '🔱', 'Hundred Billion', 'Cross $100,000,000,000 in total holdings.'],
    [1e12, '♾️', 'Trillionaire', 'Cross $1,000,000,000,000 in total holdings.'],
    [1e13, '🌑', 'Obsidian Standard', 'Cross ten trillion in total holdings.'],
    [1e14, '🌟', 'Beyond Measure', 'Hold more value than the market can price.']
  ];
  WEALTH.forEach(function (w, i) {
    add('Wealth', w[1], w[2], w[3], tierFor(i, WEALTH.length), { threshold: w[0] });
  });

  /* ── 2. Per-asset holder ladders ────────────────────────── */
  var HOLD_TIERS = [
    ['Initiate',  'Open your first position in ',  'common',    '🔹'],
    ['Adept',     'Build a serious position in ',  'uncommon',  '🔸'],
    ['Custodian', 'Hold a heavyweight bag of ',    'rare',      '🗝️'],
    ['Whale',     'Command a whale-sized bag of ', 'epic',      '🐳'],
    ['Sovereign', 'Own a legendary reserve of ',   'legendary', '👑']
  ];
  M.COINS.forEach(function (c) {
    HOLD_TIERS.forEach(function (t) {
      add('Assets', t[3], c.name + ' ' + t[0], t[1] + c.name + ' (' + c.symbol + ').', t[2], { symbol: c.symbol });
    });
  });

  /* ── 3. Trading ─────────────────────────────────────────── */
  var TRADES = [
    ['🧾', 'First Fill', 'Execute your first trade.', 'common'],
    ['🔁', 'Ten Fills', 'Execute 10 trades.', 'common'],
    ['💠', 'Hundred Fills', 'Execute 100 trades.', 'uncommon'],
    ['🧮', 'Thousand Fills', 'Execute 1,000 trades.', 'rare'],
    ['🎰', 'Ten Thousand Fills', 'Execute 10,000 trades.', 'epic'],
    ['🕹️', 'Hundred Thousand Fills', 'Execute 100,000 trades.', 'legendary'],
    ['⚡', 'Scalper', 'Close a position within 60 seconds.', 'common'],
    ['🎯', 'Sniper', 'Buy within 0.5% of a local bottom.', 'rare'],
    ['🪝', 'Bottom Fisher', 'Buy an asset down more than 40%.', 'uncommon'],
    ['🪂', 'Falling Knife', 'Buy during a 20% single-session flush.', 'rare'],
    ['🧊', 'Iron Hands', 'Hold through a 50% drawdown.', 'epic'],
    ['🧤', 'Paper Hands', 'Sell within 5 minutes of buying.', 'common'],
    ['📤', 'Top Ticker', 'Sell within 1% of a local top.', 'epic'],
    ['🔄', 'Round Trip', 'Buy and sell the same asset in one day.', 'common'],
    ['🧲', 'Dip Magnet', 'Buy five dips in a single week.', 'uncommon'],
    ['💥', 'Full Send', 'Deploy your entire cash balance in one order.', 'rare'],
    ['🥶', 'Cold Start', 'Trade before your first coffee.', 'common'],
    ['🌙', 'Midnight Fill', 'Execute a trade between 00:00 and 04:00.', 'uncommon'],
    ['🧨', 'Volatility Surfer', 'Profit on an asset that moved 30% intraday.', 'epic'],
    ['🪄', 'Perfect Exit', 'Exit a position at an all-time high.', 'legendary'],
    ['🧬', 'Rebalancer', 'Rebalance your portfolio 50 times.', 'uncommon'],
    ['⛓️', 'Chain Reaction', 'Trade 10 different assets in one hour.', 'rare'],
    ['🎲', 'Degen Streak', 'Ten profitable trades in a row.', 'epic'],
    ['🏹', 'Precision', 'Fifty limit orders filled at your exact price.', 'rare'],
    ['🛰️', 'Always On', 'Place an order from three different devices.', 'uncommon'],
    ['🧱', 'Wall Breaker', 'Fill an order larger than the visible book.', 'legendary'],
    ['🌗', 'Both Sides', 'Buy and sell the same asset within one minute.', 'uncommon'],
    ['🗜️', 'Squeeze Play', 'Ride a 25% move in under an hour.', 'epic'],
    ['🎏', 'Momentum Rider', 'Hold a winner for 30 straight green sessions.', 'legendary'],
    ['🔮', 'Called It', 'Enter an asset the day before a 20% rip.', 'mythic']
  ];
  TRADES.forEach(function (t) { add('Trading', t[0], t[1], t[2], t[3]); });

  /* ── 4. Portfolio construction ──────────────────────────── */
  var PORTFOLIO = [
    ['🧺', 'Two of a Kind', 'Hold 2 different assets.', 'common'],
    ['🎨', 'Palette', 'Hold 5 different assets.', 'common'],
    ['🗂️', 'Spread', 'Hold 10 different assets.', 'uncommon'],
    ['🌐', 'Wide Net', 'Hold 20 different assets.', 'rare'],
    ['🏦', 'Index Fund', 'Hold 30 different assets.', 'epic'],
    ['🌈', 'Full Board', 'Hold every listed asset at once.', 'legendary'],
    ['⚖️', 'Perfectly Balanced', 'No position over 10% of the book.', 'rare'],
    ['🗼', 'Concentrated', 'Put 90% of the book into one asset.', 'rare'],
    ['🧊', 'Cold Storage', 'Keep 50% of the book untouched for a month.', 'uncommon'],
    ['💤', 'Set and Forget', 'Go 90 days without a single trade.', 'epic'],
    ['🪙', 'Cash Heavy', 'Sit on 50% cash through a red week.', 'uncommon'],
    ['🔥', 'Fully Deployed', 'Drop cash below 1% of the book.', 'rare'],
    ['🥇', 'Blue Chips Only', 'Hold only top-10 assets for a month.', 'rare'],
    ['🃏', 'Long Tail', 'Hold ten assets outside the top 25.', 'epic'],
    ['🐕', 'Meme Portfolio', 'Hold every meme asset on the board.', 'legendary'],
    ['🔐', 'Privacy Stack', 'Hold every privacy asset on the board.', 'epic'],
    ['🏗️', 'Layer Two Maxi', 'Hold every L2 on the board.', 'epic'],
    ['🌱', 'Seed Round', 'Open ten positions under $100 each.', 'common'],
    ['🪞', 'Mirror Book', 'Match the market-cap weighting exactly.', 'legendary'],
    ['🧿', 'Hedged', 'Hold offsetting positions in two correlated assets.', 'rare']
  ];
  PORTFOLIO.forEach(function (t) { add('Portfolio', t[0], t[1], t[2], t[3]); });

  /* ── 5. Streaks & loyalty ───────────────────────────────── */
  var STREAK_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 270, 365, 500, 730, 1000, 1500, 2000];
  var STREAK_ICON = ['🌅', '🌤️', '📆', '🗓️', '🔥', '🎇', '🏵️', '🎖️', '🧭', '🎆', '🪬', '🕯️', '🗿', '🌌', '♾️'];
  STREAK_DAYS.forEach(function (d, i) {
    add('Streaks', STREAK_ICON[i], d === 1 ? 'Day One' : d + '-Day Streak',
      'Open the portal ' + d + ' day' + (d > 1 ? 's' : '') + ' in a row.',
      tierFor(i, STREAK_DAYS.length), { days: d });
  });
  var LOYALTY = [
    ['🔓', 'Key Holder', 'Enter the portal with a valid key.', 'common'],
    ['🌑', 'Obsidian Member', 'Choose the obsidian theme.', 'common'],
    ['🕰️', 'Early Access', 'Join during the opening season.', 'rare'],
    ['🧾', 'Verified', 'Complete your profile.', 'common'],
    ['🖼️', 'Face of the Vault', 'Set a custom avatar.', 'common'],
    ['✍️', 'Biographer', 'Write a bio.', 'common'],
    ['🎨', 'Colourist', 'Customise your accent colour.', 'uncommon'],
    ['🏳️', 'Flag Bearer', 'Pick a custom banner.', 'uncommon'],
    ['📛', 'Titled', 'Equip a title on your profile.', 'uncommon'],
    ['🧩', 'Curator', 'Showcase six badges on your profile.', 'rare'],
    ['🔔', 'Watchful', 'Add ten assets to your watchlist.', 'uncommon'],
    ['🌒', 'Night Owl', 'Spend an hour in the portal after midnight.', 'uncommon'],
    ['☕', 'Morning Ritual', 'Open the portal before 07:00 ten times.', 'uncommon'],
    ['🛎️', 'Concierge', 'Read every asset detail page.', 'rare'],
    ['🗺️', 'Cartographer', 'Visit every section of the portal.', 'uncommon']
  ];
  LOYALTY.forEach(function (t) { add('Loyalty', t[0], t[1], t[2], t[3]); });

  /* ── 6. Charting & analysis ─────────────────────────────── */
  var CHARTS = [
    ['📉', 'Chartist', 'Open a chart for the first time.', 'common'],
    ['🔍', 'Zoom In', 'Switch to the one-hour timeframe.', 'common'],
    ['🔭', 'Long View', 'Switch to the all-time timeframe.', 'common'],
    ['🧵', 'Trend Liner', 'Compare two assets side by side.', 'uncommon'],
    ['🌡️', 'Heat Reader', 'Open the market heatmap.', 'uncommon'],
    ['🕯️', 'Candle Watcher', 'Watch a single chart for ten minutes.', 'uncommon'],
    ['📐', 'Technician', 'Review all six timeframes on one asset.', 'rare'],
    ['🧠', 'Pattern Seeker', 'Spot a double bottom in the wild.', 'rare'],
    ['🧿', 'Divergence', 'Catch price and volume disagreeing.', 'epic'],
    ['⏱️', 'Tick Counter', 'Sit through 1,000 live ticks.', 'rare'],
    ['🌪️', 'Storm Watcher', 'Be online during a 10% market-wide move.', 'epic'],
    ['🛎️', 'Alert Setter', 'Arm a price alert.', 'common'],
    ['🎚️', 'Fine Tuner', 'Adjust the chart smoothing.', 'uncommon'],
    ['🗜️', 'Compression', 'Watch volatility collapse to a two-week low.', 'epic'],
    ['🌋', 'Eruption', 'Watch volatility hit a two-week high.', 'epic'],
    ['📊', 'Data Nerd', 'Expand the full statistics panel.', 'common'],
    ['🧊', 'Flat Line', 'Catch an asset move less than 0.1% in an hour.', 'rare'],
    ['🎢', 'Rollercoaster', 'Catch an asset swing 20% both ways in a day.', 'legendary'],
    ['🛸', 'Vertical', 'Watch an asset gain 50% in one session.', 'legendary'],
    ['💀', 'Capitulation', 'Watch an asset lose 50% in one session.', 'legendary']
  ];
  CHARTS.forEach(function (t) { add('Charts', t[0], t[1], t[2], t[3]); });

  /* ── 7. Profit & loss milestones ────────────────────────── */
  var PNL = [1e2, 5e2, 1e3, 5e3, 1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 1e8, 1e9];
  var PNL_NAME = ['Green Shoots', 'Traction', 'Compounding', 'Snowball', 'Avalanche',
    'Windfall', 'Fortune', 'Dynasty', 'Legacy', 'Empire', 'Sovereign Wealth',
    'Market Force', 'Gravity Well'];
  PNL.forEach(function (v, i) {
    add('Profit', '📈', PNL_NAME[i], 'Realise ' + M.fmt.compact(v) + ' in lifetime profit.',
      tierFor(i, PNL.length), { pnl: v });
  });
  var LOSS = [
    ['🩸', 'First Blood', 'Take your first realised loss.', 'common'],
    ['🧯', 'Damage Control', 'Cut a losing position early.', 'uncommon'],
    ['🪦', 'Rekt', 'Take a 90% loss on a position.', 'rare'],
    ['🫡', 'Still Standing', 'Recover a portfolio from a 70% drawdown.', 'legendary'],
    ['🧗', 'Comeback', 'Return to break-even after four red weeks.', 'epic'],
    ['🌗', 'Even Keel', 'Close a month exactly flat.', 'rare'],
    ['🎭', 'Both Faces', 'Realise a five-figure gain and loss in one day.', 'epic']
  ];
  LOSS.forEach(function (t) { add('Profit', t[0], t[1], t[2], t[3]); });

  /* ── 8. Portal lore ─────────────────────────────────────── */
  var LORE = [
    ['🗝️', 'SlimeGeo', 'Speak the word that opens the door.', 'mythic'],
    ['🌑', 'Obsidian Rank I', 'Enter the first obsidian tier.', 'uncommon'],
    ['🌑', 'Obsidian Rank II', 'Enter the second obsidian tier.', 'rare'],
    ['🌑', 'Obsidian Rank III', 'Enter the third obsidian tier.', 'epic'],
    ['🌑', 'Obsidian Rank IV', 'Enter the fourth obsidian tier.', 'legendary'],
    ['🌑', 'Obsidian Rank V', 'Enter the final obsidian tier.', 'mythic'],
    ['🟣', 'Violet Signal', 'Trigger the neon pulse.', 'rare'],
    ['🪬', 'Glasswalker', 'Cross the gate ten times.', 'uncommon'],
    ['🧿', 'Warden', 'Guard the portal for a full season.', 'epic'],
    ['🕸️', 'Deep Index', 'Discover an asset outside the top 40.', 'rare'],
    ['📡', 'Signal Found', 'Catch the ticker mid-flash.', 'uncommon'],
    ['🎛️', 'Operator', 'Use every control on the dashboard.', 'rare'],
    ['🧪', 'Alchemist', 'Convert one asset directly into another.', 'uncommon'],
    ['🪞', 'Reflection', 'Look at your own profile page.', 'common'],
    ['🫥', 'Ghost', 'Browse for an hour without trading.', 'common'],
    ['🎧', 'In the Zone', 'Keep the portal open for three hours.', 'rare'],
    ['🛖', 'Homebody', 'Return to the dashboard 100 times.', 'uncommon'],
    ['🧭', 'Wayfinder', 'Use search to find an asset.', 'common'],
    ['🔦', 'Torchbearer', 'Light up the vault for the first time.', 'common'],
    ['♦️', 'Facet', 'Collect a badge from every track.', 'legendary'],
    ['🏆', 'Completionist', 'Unlock every badge in the vault.', 'mythic'],
    ['👁️', 'The Watcher', 'See a thousand price flashes.', 'epic'],
    ['🔥', 'Fire', 'Survive a market-wide red day.', 'rare'],
    ['💧', 'Water', 'Ride a market-wide green day.', 'rare'],
    ['🌬️', 'Air', 'Trade an asset with no volume.', 'epic'],
    ['🪨', 'Earth', 'Hold a position for a full year.', 'legendary'],
    ['🕳️', 'Void Touched', 'Visit the portal at exactly 03:33.', 'mythic'],
    ['🧊', 'Frozen Ledger', 'Take a snapshot of your portfolio.', 'uncommon'],
    ['🗿', 'Monolith', 'Reach the top of the leaderboard.', 'mythic'],
    ['💫', 'Afterglow', 'Log out with a green day behind you.', 'common']
  ];
  LORE.forEach(function (t) { add('Portal', t[0], t[1], t[2], t[3]); });

  /* ── 9. Sector mastery, one per tag ─────────────────────── */
  var tagSet = {};
  M.COINS.forEach(function (c) { c.tags.forEach(function (t) { tagSet[t] = 1; }); });
  Object.keys(tagSet).sort().forEach(function (tag, i) {
    add('Sectors', '🏵️', tag + ' Specialist',
      'Hold three or more ' + tag.toLowerCase() + ' assets at once.',
      ['uncommon', 'rare', 'epic'][i % 3], { tag: tag });
  });
  Object.keys(tagSet).sort().forEach(function (tag) {
    add('Sectors', '🎖️', tag + ' Maximalist',
      'Hold every ' + tag.toLowerCase() + ' asset on the board.', 'legendary', { tag: tag });
  });

  /* ── index ──────────────────────────────────────────────── */
  var CATEGORIES = [];
  badges.forEach(function (b) { if (CATEGORIES.indexOf(b.cat) < 0) CATEGORIES.push(b.cat); });

  function byTier() {
    var counts = {};
    TIERS.forEach(function (t) { counts[t.key] = 0; });
    badges.forEach(function (b) { counts[b.tier]++; });
    return counts;
  }

  M.badges = {
    all: badges,
    tiers: TIERS,
    tier: function (k) { return TIER_BY_KEY[k]; },
    categories: CATEGORIES,
    counts: byTier,
    total: badges.length,
    get: function (id) {
      for (var i = 0; i < badges.length; i++) if (badges[i].id === id) return badges[i];
      return null;
    }
  };
})(window);
