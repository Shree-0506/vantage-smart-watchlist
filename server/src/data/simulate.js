// Deterministic market simulator.
//
// IMPORTANT: nothing here uses Math.random(). Every series is generated from a
// seeded PRNG (mulberry32) whose seed is derived from (symbol + scenario), so
// re-generating a scenario always yields the exact same numbers. This is what
// lets the demo be replayed / reset reliably instead of being a "different app
// every refresh" toy.

const { SYMBOLS, SECTORS, SYMBOL_MAP } = require("./symbols");

const TOTAL_STEPS = 96; // 96 ticks == one simulated trading day at 5-minute resolution
const TICK_MINUTES = 5;
const SIM_START = Date.parse("2026-09-01T09:15:00.000Z"); // fixed anchor, not wall-clock "now"

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seedInt) {
  let a = seedInt;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(key) {
  const seedFn = hashSeed(key);
  const seed = seedFn();
  return mulberry32(seed);
}

// Gaussian noise via Box-Muller, fed by a deterministic uniform RNG.
function gaussian(rng, mean = 0, stdev = 1) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdev;
}

const SCENARIOS = [
  "normal",
  "unusual_movement",
  "high_volume",
  "market_wide",
  "stale_data",
  "conflicting_data",
];

/**
 * Build the full universe (per-symbol tick series + market/sector indices)
 * for a given scenario. Pure function of `scenario` -> fully deterministic.
 */
function generateUniverse(scenario) {
  if (!SCENARIOS.includes(scenario)) scenario = "normal";

  const series = {}; // symbol -> array of ticks
  const rawPctChange = {}; // symbol -> array of per-step pct change vs previous step (for vol calc)

  for (const s of SYMBOLS) {
    const rng = rngFor(`${s.symbol}::${scenario}`);
    const ticks = [];
    let price = s.basePrice;
    let baseVolume = 250000 + Math.floor(rngFor(`${s.symbol}::vol`)() * 400000);
    let frozenFromStep = null;
    let frozenPrice = null;
    let frozenVolume = null;

    // scenario-specific scripted symbols
    const isUnusualSymbol = scenario === "unusual_movement" && s.symbol === "RELIANCE";
    const isHighVolumeSymbol = scenario === "high_volume" && s.symbol === "INFY";
    const isStaleSymbol = scenario === "stale_data" && s.symbol === "HDFCBANK";
    const isConflictSymbol = scenario === "conflicting_data" && s.symbol === "ICICIBANK";
    const isMarketWide = scenario === "market_wide";

    for (let step = 0; step < TOTAL_STEPS; step++) {
      const timestamp = SIM_START + step * TICK_MINUTES * 60 * 1000;

      // baseline drift/noise
      let drift = 0;
      let noiseStd = 0.0018; // ~0.18% per tick baseline volatility

      if (isMarketWide && step >= 40) {
        drift = 0.0009; // shared market rally, correlated across all symbols
        noiseStd = 0.0022;
      }
      if (isUnusualSymbol && step >= 60 && step < 72) {
        drift = 0.006; // sharp idiosyncratic jump, ~6% over 12 ticks
      }

      let pctStep = gaussian(rng, drift, noiseStd);

      if (step === 0) {
        // no change on first tick
        pctStep = 0;
      }

      price = Math.max(1, price * (1 + pctStep));

      // volume
      let volume = Math.round(baseVolume * (1 + gaussian(rng, 0, 0.15)));
      volume = Math.max(1000, volume);
      if (isHighVolumeSymbol && step >= 50) {
        volume = Math.round(baseVolume * (3.5 + gaussian(rng, 0, 0.3)));
      }

      let frozen = false;
      if (isStaleSymbol && step >= 70) {
        if (frozenFromStep === null) {
          frozenFromStep = step;
          frozenPrice = price;
          frozenVolume = volume;
        }
        price = frozenPrice;
        volume = frozenVolume;
        frozen = true;
      }

      const tick = {
        step,
        timestamp,
        price: Number(price.toFixed(2)),
        volume,
        frozen,
        lastRealUpdateStep: frozen ? frozenFromStep : step,
      };

      if (isConflictSymbol && step >= 55) {
        // secondary feed disagrees with primary by a persistent offset + noise
        const secondary = price * (1 + 0.021 + gaussian(rng, 0, 0.004));
        tick.secondaryPrice = Number(secondary.toFixed(2));
        tick.hasConflict = true;
      }

      ticks.push(tick);
      rawPctChange[s.symbol] = rawPctChange[s.symbol] || [];
      rawPctChange[s.symbol].push(pctStep);
    }

    series[s.symbol] = ticks;
  }

  // Market index: equal-weighted average of cumulative pct change from step 0
  const marketIndex = [];
  for (let step = 0; step < TOTAL_STEPS; step++) {
    let sum = 0;
    for (const s of SYMBOLS) {
      const first = series[s.symbol][0].price;
      const cur = series[s.symbol][step].price;
      sum += (cur - first) / first;
    }
    const avgPct = sum / SYMBOLS.length;
    marketIndex.push({
      step,
      timestamp: series[SYMBOLS[0].symbol][step].timestamp,
      pctChangeFromStart: Number((avgPct * 100).toFixed(3)),
    });
  }

  // Sector indices: same idea, scoped to sector membership
  const sectorIndex = {};
  for (const sector of SECTORS) {
    const members = SYMBOLS.filter((s) => s.sector === sector);
    const arr = [];
    for (let step = 0; step < TOTAL_STEPS; step++) {
      let sum = 0;
      for (const m of members) {
        const first = series[m.symbol][0].price;
        const cur = series[m.symbol][step].price;
        sum += (cur - first) / first;
      }
      arr.push({
        step,
        timestamp: series[SYMBOLS[0].symbol][step].timestamp,
        pctChangeFromStart: Number(((sum / members.length) * 100).toFixed(3)),
      });
    }
    sectorIndex[sector] = arr;
  }

  return { scenario, totalSteps: TOTAL_STEPS, tickMinutes: TICK_MINUTES, series, marketIndex, sectorIndex, rawPctChange };
}

// Cache universes per scenario since generation is deterministic & pure.
const universeCache = new Map();
function getUniverse(scenario) {
  if (!universeCache.has(scenario)) {
    universeCache.set(scenario, generateUniverse(scenario));
  }
  return universeCache.get(scenario);
}

function stepToTimestamp(step) {
  return SIM_START + step * TICK_MINUTES * 60 * 1000;
}

module.exports = {
  SCENARIOS,
  TOTAL_STEPS,
  TICK_MINUTES,
  SIM_START,
  generateUniverse,
  getUniverse,
  stepToTimestamp,
};
