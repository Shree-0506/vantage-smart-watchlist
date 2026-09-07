const express = require("express");
const { authMiddleware } = require("../auth");
const { SYMBOL_MAP } = require("../data/symbols");
const { getCurrentUniverse } = require("../marketState");
const { evaluateChange } = require("../engine/changeEngine");

const LEVEL_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };

function buildFeedRouter(db) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get("/", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const watchlist = db.prepare("SELECT symbol FROM watchlist_items WHERE user_id = ?").all(req.user.id);
    const { universe, currentStep, currentTimestamp, scenario } = getCurrentUniverse(db);

    const items = watchlist.map((w) => {
      const meta = SYMBOL_MAP[w.symbol];
      const currentTick = universe.series[w.symbol][currentStep];
      const snapshot = db.prepare("SELECT * FROM snapshots WHERE user_id=? AND symbol=?").get(req.user.id, w.symbol);

      const verdict = evaluateChange({
        symbol: w.symbol,
        sector: meta.sector,
        lastSeen: snapshot ? { step: snapshot.step, price: snapshot.price, volume: snapshot.volume } : null,
        currentTick,
        universe,
        currentStep,
      });

      return {
        symbol: w.symbol,
        name: meta.name,
        sector: meta.sector,
        currentPrice: currentTick.price,
        lastSeenPrice: snapshot ? snapshot.price : null,
        lastSeenAt: snapshot ? snapshot.seen_at : null,
        ...verdict,
      };
    });

    items.sort((a, b) => {
      const lvl = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
      if (lvl !== 0) return lvl;
      return (b.score || 0) - (a.score || 0);
    });

    const previousCheckAt = user.last_checked_at;
    db.prepare("UPDATE users SET last_checked_at = ? WHERE id = ?").run(Date.now(), req.user.id);

    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
    for (const it of items) counts[it.level] = (counts[it.level] || 0) + 1;

    res.json({
      generatedAt: Date.now(),
      marketAsOf: currentTimestamp,
      scenario,
      previousCheckAt,
      watchlistSize: watchlist.length,
      counts,
      items,
    });
  });

  return router;
}

module.exports = buildFeedRouter;
