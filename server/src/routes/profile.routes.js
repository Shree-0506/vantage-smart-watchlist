const express = require("express");
const bcrypt = require("bcryptjs");
const { authMiddleware } = require("../auth");

function buildProfileRouter(db) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get("/", (req, res) => {
    const row = db
      .prepare("SELECT id, email, name, role, created_at, last_checked_at FROM users WHERE id = ?")
      .get(req.user.id);
    const watchCount = db
      .prepare("SELECT COUNT(*) c FROM watchlist_items WHERE user_id = ?")
      .get(req.user.id).c;
    res.json({ user: row, watchlistCount: watchCount });
  });

  router.patch("/", (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Name cannot be empty." });
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), req.user.id);
    res.json({ ok: true });
  });

  router.post("/change-password", (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!bcrypt.compareSync(currentPassword || "", row.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 8), req.user.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = buildProfileRouter;
