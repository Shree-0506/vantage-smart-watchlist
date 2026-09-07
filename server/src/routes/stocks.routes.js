const express = require("express");
const { authMiddleware } = require("../auth");
const { SYMBOLS, SYMBOL_MAP } = require("../data/symbols");
const { getCurrentUniverse } = require("../marketState");
const { evaluateChange } = require("../engine/changeEngine");

function buildStocksRouter(db) {
  const router = express.Router();
  router.use(authMiddleware);

  // Catalog + search, with a lightweight "is this on my watchlist" flag.
  router.get("/", (req, res) => {
    const q = (req.query.q || "").toLowerCase().trim();
    const { universe, currentStep } = getCurrentUniverse(db);
    const watchedRows = db.prepare("SELECT symbol FROM watchlist_items WHERE user_id = ?").all(req.user.id);
    const watchedSet = new Set(watchedRows.map((r) => r.symbol));

    const results = SYMBOLS.filter(
      (s) => !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q)
    ).map((s) => {
      const tick = universe.series[s.symbol][currentStep];
      return {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        price: tick.price,
        onWatchlist: watchedSet.has(s.symbol),
      };
    });

    res.json({ results });
  });

  // Full detail for a single stock, including "why this matters" if it's on
  // the user's watchlist and has a last-seen snapshot.
  router.get("/:symbol", (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const meta = SYMBOL_MAP[symbol];
    if (!meta) return res.status(404).json({ error: "Unknown symbol." });

    const { universe, currentStep, currentTimestamp, scenario } = getCurrentUniverse(db);
    const currentTick = universe.series[symbol][currentStep];

    const snapshot = db
      .prepare("SELECT * FROM snapshots WHERE user_id = ? AND symbol = ?")
      .get(req.user.id, symbol);

    let verdict = null;
    if (snapshot) {
      verdict = evaluateChange({
        symbol,
        sector: meta.sector,
        lastSeen: { step: snapshot.step, price: snapshot.price, volume: snapshot.volume },
        currentTick,
        universe,
        currentStep,
      });
    }

    // recent chart series (last 40 ticks up to current step)
    const start = Math.max(0, currentStep - 40);
    const chart = universe.series[symbol].slice(start, currentStep + 1).map((t) => ({
      step: t.step,
      timestamp: t.timestamp,
      price: t.price,
    }));

    const marketWindow = universe.marketIndex[currentStep].pctChangeFromStart;
    const sectorWindow = universe.sectorIndex[meta.sector][currentStep].pctChangeFromStart;

    res.json({
      symbol,
      name: meta.name,
      sector: meta.sector,
      currentPrice: currentTick.price,
      currentVolume: currentTick.volume,
      isStaleFeed: !!currentTick.frozen,
      hasConflict: !!currentTick.hasConflict,
      secondaryPrice: currentTick.secondaryPrice ?? null,
      asOf: currentTimestamp,
      scenario,
      marketTodayPct: Number(marketWindow.toFixed(2)),
      sectorTodayPct: Number(sectorWindow.toFixed(2)),
      chart,
      onWatchlist: !!snapshot || !!db.prepare("SELECT 1 FROM watchlist_items WHERE user_id=? AND symbol=?").get(req.user.id, symbol),
      lastSeen: snapshot ? { step: snapshot.step, price: snapshot.price, volume: snapshot.volume, seenAt: snapshot.seen_at } : null,
      whyThisMatters: verdict,
    });
  });

  return router;
}

module.exports = buildStocksRouter;
