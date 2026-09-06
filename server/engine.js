'use strict';
/* Loads the shared browser modules into this process, in dependency order,
   and runs the authoritative market loop. The browser and the server run the
   exact same seeded engine, so charts agree; but only this copy is trusted
   for pricing a trade. */

require('../public/assets/js/coins.js');
require('../public/assets/js/util.js');
const Moneta = require('../public/assets/js/market.js');

Moneta.market.init();
Moneta.market.start();

module.exports = Moneta;
