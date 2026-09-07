const express = require("express");
const bcrypt = require("bcryptjs");
const { signToken, authMiddleware } = require("../auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildAuthRouter(db) {
  const router = express.Router();

  router.post("/signup", (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const hash = bcrypt.hashSync(password, 8);
    const info = db
      .prepare("INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, 'user', ?)")
      .run(email.toLowerCase(), hash, name.trim(), Date.now());

    const user = { id: info.lastInsertRowid, email: email.toLowerCase(), role: "user", name: name.trim() };
    const token = signToken(user);
    res.status(201).json({ token, user });
  });

  router.post("/login", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const user = { id: row.id, email: row.email, role: row.role, name: row.name };
    const token = signToken(user);
    res.json({ token, user });
  });

  router.get("/me", authMiddleware, (req, res) => {
    const row = db.prepare("SELECT id, email, name, role, created_at FROM users WHERE id = ?").get(req.user.id);
    if (!row) return res.status(404).json({ error: "User not found." });
    res.json({ user: row });
  });

  return router;
}

module.exports = buildAuthRouter;
