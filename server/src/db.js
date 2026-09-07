const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");

// Allow tests to force a fresh file-based or in-memory DB.
function createDb(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_checked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      UNIQUE(user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      step INTEGER NOT NULL,
      price REAL NOT NULL,
      volume INTEGER NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scenario TEXT NOT NULL DEFAULT 'normal',
      current_step INTEGER NOT NULL DEFAULT 20
    );
  `);

  const row = db.prepare("SELECT * FROM admin_state WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO admin_state (id, scenario, current_step) VALUES (1, 'normal', 20)").run();
  }

  seedUsers(db);

  return db;
}

function seedUsers(db) {
  const existing = db.prepare("SELECT COUNT(*) as c FROM users").get();
  if (existing.c > 0) return;

  const insert = db.prepare(
    "INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const now = Date.now();

  insert.run("demo@watchlist.app", bcrypt.hashSync("demo1234", 8), "Demo User", "user", now);
  insert.run("admin@watchlist.app", bcrypt.hashSync("admin1234", 8), "Admin", "admin", now);

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@watchlist.app");
  const starterSymbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS"];
  const insertWatch = db.prepare(
    "INSERT OR IGNORE INTO watchlist_items (user_id, symbol, added_at) VALUES (?, ?, ?)"
  );
  for (const sym of starterSymbols) {
    insertWatch.run(demoUser.id, sym, now);
  }

  // Seed a baseline snapshot at step 5 so the demo user has "since you last
  // checked" history to compare against the admin_state's current_step (20).
  const insertSnap = db.prepare(
    `INSERT OR REPLACE INTO snapshots (user_id, symbol, step, price, volume, seen_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const { getUniverse } = require("./data/simulate");
  const universe = getUniverse("normal");
  for (const sym of starterSymbols) {
    const tick = universe.series[sym][14];
    insertSnap.run(demoUser.id, sym, 14, tick.price, tick.volume, now - 1000 * 60 * 30);
  }
}

function resetDb(db) {
  db.exec(`
    DELETE FROM snapshots;
    DELETE FROM watchlist_items;
    DELETE FROM users;
    DELETE FROM admin_state;
  `);
  db.prepare("INSERT INTO admin_state (id, scenario, current_step) VALUES (1, 'normal', 20)").run();
  seedUsers(db);
}

module.exports = { createDb, resetDb, DB_PATH };
