// The "Meaningful Change Engine".
//
// Pure, dependency-free functions so they can be unit tested in isolation
// from Express/SQLite. Given a symbol's last-seen snapshot and its current
// state (plus market/sector context), this decides:
//   1. whether the change is meaningful at all (vs. noise)
//   2. how much attention it deserves (HIGH / MEDIUM / LOW / NONE)
//   3. *why* (a list of evidence-backed reasons, never a bare number)
//
// Design principle: NOT a fixed "+/-3% = alert" threshold. A move is judged
// relative to (a) the stock's own historical volatility and (b) what the
// broader market/sector did over the same window. A 5% move on a day the
// market is flat is very different from a 5% move on a day the market itself
// moved 5%.

const STALE_STEPS_THRESHOLD = 6; // 6 * 5min = 30 minutes of no real update
const VOLUME_ANOMALY_RATIO = 2.5;
const TRAILING_WINDOW = 20; // ticks used for volatility / avg-volume baselines

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

/** Per-tick volatility (%) estimated over the trailing window ending at `uptoStep`. */
function trailingVolatilityPct(rawPctChangeSeries, uptoStep, window = TRAILING_WINDOW) {
  const start = Math.max(1, uptoStep - window + 1); // skip step 0 (always 0 by construction)
  const slice = rawPctChangeSeries.slice(start, uptoStep + 1);
  const s = stdev(slice);
  return s * 100; // convert fraction -> percent
}

/** Average volume over the trailing window ending at `uptoStep`. */
function trailingAvgVolume(tickSeries, uptoStep, window = TRAILING_WINDOW) {
  const start = Math.max(0, uptoStep - window + 1);
  const slice = tickSeries.slice(start, uptoStep + 1).map((t) => t.volume);
  return mean(slice) || 1;
}

function classify(score) {
  if (score >= 55) return "HIGH";
  if (score >= 25) return "MEDIUM";
  if (score >= 8) return "LOW";
  return "NONE";
}

/**
 * Evaluate whether the change between `lastSeen` and `current` for a symbol
 * is meaningful, and produce a scored, explained verdict.
 *
 * @param {Object} p
 * @param {string} p.symbol
 * @param {string} p.sector
 * @param {{step:number, price:number, volume:number}} p.lastSeen
 * @param {Object} p.currentTick - raw tick object from the simulator
 * @param {Object} p.universe - full universe object from simulate.js (series/marketIndex/sectorIndex/rawPctChange)
 * @param {number} p.currentStep - the sim's "now" (may be > currentTick.step if data is stale)
 */
function evaluateChange({ symbol, sector, lastSeen, currentTick, universe, currentStep }) {
  const reasons = [];
  const evidence = {};

  const noPriorContext = !lastSeen || lastSeen.step == null;
  if (noPriorContext) {
    return {
      symbol,
      level: "NONE",
      score: 0,
      reasons: ["First time tracking this stock — establishing a baseline now."],
      evidence: {},
      stale: false,
      conflicting: false,
    };
  }

  const N = Math.max(0, currentStep - lastSeen.step);
  const pctChange = lastSeen.price > 0 ? ((currentTick.price - lastSeen.price) / lastSeen.price) * 100 : 0;
  evidence.pctChange = Number(pctChange.toFixed(3));
  evidence.lastSeenPrice = lastSeen.price;
  evidence.currentPrice = currentTick.price;
  evidence.ticksElapsed = N;

  // ---- staleness -------------------------------------------------------
  const lastRealUpdateStep = currentTick.lastRealUpdateStep ?? currentTick.step;
  const dataAgeSteps = currentStep - lastRealUpdateStep;
  const stale = dataAgeSteps >= STALE_STEPS_THRESHOLD;
  if (stale) {
    const minutes = dataAgeSteps * universe.tickMinutes;
    reasons.push(
      `Data feed hasn't updated in ${minutes} minutes — this price may not reflect the current market. Treat with caution.`
    );
    evidence.staleMinutes = minutes;
  }

  // ---- conflicting data --------------------------------------------------
  const conflicting = !!currentTick.hasConflict;
  if (conflicting) {
    const deltaPct = ((currentTick.secondaryPrice - currentTick.price) / currentTick.price) * 100;
    evidence.primaryPrice = currentTick.price;
    evidence.secondaryPrice = currentTick.secondaryPrice;
    evidence.conflictDeltaPct = Number(deltaPct.toFixed(2));
    reasons.push(
      `Two data sources disagree on this price by ${Math.abs(deltaPct).toFixed(
        2
      )}% (₹${currentTick.price} vs ₹${currentTick.secondaryPrice}). Showing both rather than picking one silently.`
    );
  }

  if (N === 0) {
    return {
      symbol,
      level: "NONE",
      score: 0,
      reasons: reasons.length ? reasons : ["No new data since you last checked."],
      evidence,
      stale,
      conflicting,
    };
  }

  // ---- market / sector context ------------------------------------------
  const marketAtLast = universe.marketIndex[lastSeen.step].pctChangeFromStart;
  const marketAtCur = universe.marketIndex[currentTick.step].pctChangeFromStart;
  const marketWindowPct = marketAtCur - marketAtLast;

  const sectorSeries = universe.sectorIndex[sector] || [];
  let sectorWindowPct = 0;
  if (sectorSeries.length) {
    sectorWindowPct = sectorSeries[currentTick.step].pctChangeFromStart - sectorSeries[lastSeen.step].pctChangeFromStart;
  }

  const relativeToMarket = pctChange - marketWindowPct;
  const relativeToSector = pctChange - sectorWindowPct;
  evidence.marketWindowPct = Number(marketWindowPct.toFixed(3));
  evidence.sectorWindowPct = Number(sectorWindowPct.toFixed(3));
  evidence.relativeToMarket = Number(relativeToMarket.toFixed(3));
  evidence.relativeToSector = Number(relativeToSector.toFixed(3));

  // ---- volatility-adjusted significance (z-score) ------------------------
  const rawSeries = universe.rawPctChange[symbol] || [];
  const perTickVolPct = trailingVolatilityPct(rawSeries, lastSeen.step);
  const expectedMoveStdPct = Math.max(0.05, perTickVolPct * Math.sqrt(N)); // floor to avoid div-by-~0
  const zScore = pctChange / expectedMoveStdPct;
  evidence.expectedMoveStdPct = Number(expectedMoveStdPct.toFixed(3));
  evidence.zScore = Number(zScore.toFixed(2));

  // ---- volume anomaly -----------------------------------------------------
  const tickSeries = universe.series[symbol];
  const avgVolume = trailingAvgVolume(tickSeries, lastSeen.step);
  const volumeRatio = currentTick.volume / avgVolume;
  const volumeAnomaly = volumeRatio >= VOLUME_ANOMALY_RATIO;
  evidence.avgVolume = Math.round(avgVolume);
  evidence.currentVolume = currentTick.volume;
  evidence.volumeRatio = Number(volumeRatio.toFixed(2));

  // ---- scoring --------------------------------------------------------
  let score = 0;
  const zContribution = Math.min(Math.abs(zScore), 5) / 5 * 50;
  score += zContribution;

  const movedBeyondMarketNoise = Math.abs(relativeToMarket) > expectedMoveStdPct;
  if (movedBeyondMarketNoise && Math.abs(pctChange) > 0.3) {
    score += 20;
  }
  if (volumeAnomaly) {
    score += 20;
  }

  score = Math.round(Math.min(100, score));
  let level = classify(score);

  // Explanations, in priority order -----------------------------------
  if (Math.abs(pctChange) >= 0.1) {
    const dir = pctChange >= 0 ? "up" : "down";
    reasons.push(
      `${symbol} is ${dir} ${Math.abs(pctChange).toFixed(2)}% since you last checked (₹${lastSeen.price} → ₹${currentTick.price}).`
    );
  }

  if (Math.abs(zScore) >= 1.5) {
    reasons.push(
      `This move is ${Math.abs(zScore).toFixed(1)}x ${symbol}'s typical volatility for a similar time window — unusually large for this stock.`
    );
  } else if (Math.abs(zScore) < 0.5 && Math.abs(pctChange) >= 0.1) {
    reasons.push(`This is within ${symbol}'s normal day-to-day fluctuation range.`);
  }

  if (Math.abs(marketWindowPct) >= 0.3 && Math.abs(relativeToMarket) < expectedMoveStdPct * 0.6) {
    reasons.push(
      `The broader market moved ${marketWindowPct >= 0 ? "+" : ""}${marketWindowPct.toFixed(
        2
      )}% over the same period — most of this move tracks the market, not stock-specific news.`
    );
  } else if (movedBeyondMarketNoise) {
    reasons.push(
      `The market moved only ${marketWindowPct >= 0 ? "+" : ""}${marketWindowPct.toFixed(
        2
      )}% in the same window, so ${symbol}'s move looks stock-specific rather than market-driven.`
    );
  }

  if (Math.abs(sectorWindowPct) >= 0.3 && Math.abs(relativeToSector) > expectedMoveStdPct) {
    reasons.push(
      `${sector} sector moved ${sectorWindowPct >= 0 ? "+" : ""}${sectorWindowPct.toFixed(
        2
      )}%, but ${symbol} moved noticeably more/less than its peers.`
    );
  }

  if (volumeAnomaly) {
    reasons.push(
      `Trading volume is ${volumeRatio.toFixed(1)}x the recent average (${currentTick.volume.toLocaleString(
        "en-IN"
      )} vs ~${Math.round(avgVolume).toLocaleString("en-IN")}) — unusually high activity.`
    );
  }

  if (!reasons.length) {
    reasons.push("Nothing significant — movement is within normal, expected ranges.");
  }

  // Stale data caps our confidence — don't blast a HIGH alert off a frozen feed.
  if (stale && level === "HIGH") {
    level = "MEDIUM";
  }

  return {
    symbol,
    level,
    score,
    reasons,
    evidence,
    stale,
    conflicting,
  };
}

module.exports = {
  evaluateChange,
  trailingVolatilityPct,
  trailingAvgVolume,
  classify,
  STALE_STEPS_THRESHOLD,
  VOLUME_ANOMALY_RATIO,
  TRAILING_WINDOW,
};
