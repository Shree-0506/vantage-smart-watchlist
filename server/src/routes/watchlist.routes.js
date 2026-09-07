const express = require("express");
const { authMiddleware } = require("../auth");
const { SYMBOL_MAP } = require("../data/symbols");
const { getCurrentUniverse } = require("../marketState");

function buildWatchlistRouter(db) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get("/", (req, res) => {
    const rows = db
      .prepare("SELECT symbol, added_at FROM watchlist_items WHERE user_id = ? ORDER BY added_at DESC")
      .all(req.user.id);
    const { universe, currentStep } = getCurrentUniverse(db);

    const items = rows.map((r) => {
      const meta = SYMBOL_MAP[r.symbol];
      const tick = universe.series[r.symbol][currentStep];
      return {
        symbol: r.symbol,
        name: meta?.name || r.symbol,
        sector: meta?.sector || "—",
        addedAt: r.added_at,
        price: tick.price,
        isStaleFeed: !!tick.frozen,
        hasConflict: !!tick.hasConflict,
      };
    });
    res.json({ items });
  });

  router.post("/", (req, res) => {
    const { symbol } = req.body || {};
    if (!symbol || !SYMBOL_MAP[symbol.toUpperCase()]) {
      return res.status(400).json({ error: "Unknown or missing symbol." });
    }
    const sym = symbol.toUpperCase();
    const existing = db
      .prepare("SELECT 1 FROM watchlist_items WHERE user_id = ? AND symbol = ?")
      .get(req.user.id, sym);
    if (existing) {
      return res.status(409).json({ error: `${sym} is already on your watchlist.` });
    }

    db.prepare("INSERT INTO watchlist_items (user_id, symbol, added_at) VALUES (?, ?, ?)").run(
      req.user.id,
      sym,
      Date.now()
    );

    // establish the baseline snapshot immediately at current market state
    const { universe, currentStep } = getCurrentUniverse(db);
    const tick = universe.series[sym][currentStep];
    db.prepare(
      `INSERT OR REPLACE INTO snapshots (user_id, symbol, step, price, volume, seen_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, sym, currentStep, tick.price, tick.volume, Date.now());

    res.status(201).json({ ok: true, symbol: sym });
  });

  router.delete("/:symbol", (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    const info = db.prepare("DELETE FROM watchlist_items WHERE user_id = ? AND symbol = ?").run(req.user.id, sym);
    db.prepare("DELETE FROM snapshots WHERE user_id = ? AND symbol = ?").run(req.user.id, sym);
    if (info.changes === 0) return res.status(404).json({ error: "Not on watchlist." });
    res.json({ ok: true });
  });

  // Explicitly reset the "last seen" baseline for one symbol to right now.
  // Used after a user reviews an alert, so it won't re-surface unchanged.
  router.post("/:symbol/ack", (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    const owns = db.prepare("SELECT 1 FROM watchlist_items WHERE user_id=? AND symbol=?").get(req.user.id, sym);
    if (!owns) return res.status(404).json({ error: "Not on watchlist." });

    const { universe, currentStep } = getCurrentUniverse(db);
    const tick = universe.series[sym][currentStep];
    db.prepare(
      `INSERT OR REPLACE INTO snapshots (user_id, symbol, step, price, volume, seen_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, sym, currentStep, tick.price, tick.volume, Date.now());

    res.json({ ok: true });
  });

  return router;
}

module.exports = buildWatchlistRouter;
