const express = require("express");
const cors = require("cors");

const buildAuthRouter = require("./routes/auth.routes");
const buildWatchlistRouter = require("./routes/watchlist.routes");
const buildFeedRouter = require("./routes/feed.routes");
const buildStocksRouter = require("./routes/stocks.routes");
const buildAdminRouter = require("./routes/admin.routes");
const buildProfileRouter = require("./routes/profile.routes");

function createApp(db) {
  const app = express();
  // CORS_ORIGIN, if set, restricts allowed origins (comma-separated) for
  // production deployments. Unset (local dev default) keeps the previous
  // permissive behavior so `npm run dev` continues to work unchanged.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((s) => s.trim()) } : undefined));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true, service: "smart-watchlist-server" }));

  app.use("/api/auth", buildAuthRouter(db));
  app.use("/api/watchlist", buildWatchlistRouter(db));
  app.use("/api/feed", buildFeedRouter(db));
  app.use("/api/stocks", buildStocksRouter(db));
  app.use("/api/admin", buildAdminRouter(db));
  app.use("/api/profile", buildProfileRouter(db));

  // Central error handler (validation errors etc. are handled inline in
  // routes; this is a safety net for anything unexpected).
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  app.use((req, res) => res.status(404).json({ error: "Not found." }));

  return app;
}

module.exports = { createApp };
