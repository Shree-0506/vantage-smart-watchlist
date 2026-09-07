const express = require("express");
const { authMiddleware, requireAdmin } = require("../auth");
const { SCENARIOS, TOTAL_STEPS, getUniverse, stepToTimestamp } = require("../data/simulate");
const { resetDb } = require("../db");

function buildAdminRouter(db) {
  const router = express.Router();
  router.use(authMiddleware, requireAdmin);

  router.get("/state", (req, res) => {
    const row = db.prepare("SELECT * FROM admin_state WHERE id = 1").get();
    const universe = getUniverse(row.scenario);
    const staleSymbols = Object.entries(universe.series)
      .filter(([, ticks]) => ticks[row.current_step].frozen)
      .map(([sym]) => sym);
    const conflictSymbols = Object.entries(universe.series)
      .filter(([, ticks]) => ticks[row.current_step].hasConflict)
      .map(([sym]) => sym);

    res.json({
      scenario: row.scenario,
      currentStep: row.current_step,
      totalSteps: TOTAL_STEPS,
      currentTimestamp: stepToTimestamp(row.current_step),
      availableScenarios: SCENARIOS,
      staleSymbols,
      conflictSymbols,
      userCount: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c,
    });
  });

  router.post("/scenario", (req, res) => {
    const { scenario } = req.body || {};
    if (!SCENARIOS.includes(scenario)) {
      return res.status(400).json({ error: `Unknown scenario. Choose one of: ${SCENARIOS.join(", ")}` });
    }
    db.prepare("UPDATE admin_state SET scenario = ?, current_step = 20 WHERE id = 1").run(scenario);
    res.json({ ok: true, scenario, currentStep: 20 });
  });

  router.post("/advance", (req, res) => {
    const steps = Number.isFinite(req.body?.steps) ? Math.max(1, Math.floor(req.body.steps)) : 4;
    const row = db.prepare("SELECT * FROM admin_state WHERE id = 1").get();
    const next = Math.min(TOTAL_STEPS - 1, row.current_step + steps);
    db.prepare("UPDATE admin_state SET current_step = ? WHERE id = 1").run(next);
    res.json({ ok: true, currentStep: next });
  });

  router.post("/reset", (req, res) => {
    resetDb(db);
    res.json({ ok: true });
  });

  return router;
}

module.exports = buildAdminRouter;
