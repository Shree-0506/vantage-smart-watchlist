# Vantage — Smart Market Watchlist

Built for **Groww CODE 2026** — "Build a Smart Market Watchlist."

> A watchlist shouldn't make you monitor your stocks. It should monitor them for you.

Every time you open Vantage it answers two questions: **what did I miss since I last checked**, and **what,
out of that, actually deserves my attention right now**. It never asks you to scan a wall of tickers, and it
never tells you to buy or sell anything.

---

## 1. Architecture

```
groww-watchlist/
├── server/            Express REST API + SQLite persistence + simulation/engine
│   └── src/
│       ├── index.js           entrypoint (reads PORT, starts DB + app)
│       ├── app.js             Express app factory, route mounting
│       ├── auth.js            JWT sign/verify, authMiddleware, requireAdmin
│       ├── db.js              SQLite schema + demo/admin seed data
│       ├── marketState.js     reads admin_state row -> current simulated universe
│       ├── data/
│       │   ├── symbols.js     static catalog of 15 tradable symbols + sectors
│       │   └── simulate.js    deterministic seeded market simulator (6 scenarios)
│       ├── engine/
│       │   └── changeEngine.js   the "meaningful change" scoring engine (pure functions)
│       ├── routes/            auth, watchlist, feed, stocks, admin, profile
│       └── __tests__/         Jest unit + Supertest API tests (32 tests)
└── client/            React 19 + Vite + React Router SPA
    └── src/
        ├── api.js              fetch wrapper (JWT in localStorage, typed error handling)
        ├── context/AuthContext.jsx
        ├── components/         Layout, route guards, shared UI (badges, states, formatters)
        └── pages/               Landing, Login, Signup, Dashboard, Watchlist, ManageStocks,
                                  StockDetail, Profile, About, Admin
```

**Separation of concerns:** the client never computes a change verdict — it only renders what the API
returns. All scoring, staleness, and conflict logic lives in `engine/changeEngine.js`, a dependency-free
module of pure functions, so it can be (and is) unit-tested in complete isolation from Express/SQLite/HTTP.

**Why simulated data, not a live feed:** the brief asks for *reliable, deterministic* demos, not a live
integration. `data/simulate.js` generates every symbol's tick series from a seeded PRNG
(`mulberry32`, seeded by `symbol + scenario`), so re-generating a scenario always produces byte-identical
output — no `Math.random()` anywhere in the data path. This is what makes the six required scenarios
(normal, unusual movement, high volume, market-wide movement, stale data, conflicting data) reproducible on
demand instead of "different every refresh."

---

## 2. Data model (SQLite, `server/src/db.js`)

| Table | Columns | Purpose |
|---|---|---|
| `users` | id, email, password_hash, name, role, created_at, last_checked_at | Auth + role (`user`/`admin`) + when they last opened the feed |
| `watchlist_items` | user_id, symbol, added_at | Which stocks a user tracks (unique per user+symbol) |
| `snapshots` | user_id, symbol, step, price, volume, seen_at | **The "last seen" baseline** — one row per user+symbol, overwritten on view/ack |
| `admin_state` | scenario, current_step | Single-row global simulated clock + active scenario |

The `snapshots` table is the core of the "since you last checked" mechanic: it's what today's price is
diffed against. It's written when a stock is added (baseline = right now), and can be explicitly reset via
"Mark as reviewed" (`POST /watchlist/:symbol/ack`) or by viewing the stock detail page's add/ack action.

---

## 3. API (all under `/api`, JSON, JWT bearer auth except signup/login)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | validates email/password(≥6)/name, returns `{token, user}` |
| POST | `/auth/login` | returns `{token, user}` |
| GET | `/auth/me` | current user from token |
| GET | `/feed` | **the attention feed** — evaluates every watchlist item against its snapshot, sorted HIGH→MEDIUM→LOW→NONE |
| GET | `/watchlist` | list with live price + stale/conflict flags |
| POST | `/watchlist` | `{symbol}` — adds + immediately writes a baseline snapshot |
| DELETE | `/watchlist/:symbol` | removes item + its snapshot |
| POST | `/watchlist/:symbol/ack` | resets the baseline snapshot to right now |
| GET | `/stocks?q=` | catalog search (symbol/name/sector) |
| GET | `/stocks/:symbol` | full detail: chart, market/sector %, volume, freshness, `whyThisMatters` verdict |
| GET/PATCH | `/profile` | view/update name |
| POST | `/profile/change-password` | requires current password |
| GET | `/admin/state` | **admin-only** — scenario, sim step, stale/conflict symbols, user count |
| POST | `/admin/scenario` | **admin-only** — `{scenario}`, one of the 6 below |
| POST | `/admin/advance` | **admin-only** — `{steps}`, advances the simulated clock |
| POST | `/admin/reset` | **admin-only** — wipes and re-seeds demo data |
| GET | `/health` | liveness check |

`requireAdmin` middleware (`server/src/auth.js`) rejects non-admin JWTs with 403 before any admin route
body runs — there is no admin control reachable from the regular user UI or API surface.

---

## 4. The meaningful-change algorithm (`server/src/engine/changeEngine.js`)

Given a symbol's **last-seen snapshot** (price, volume, sim step) and its **current tick**, the engine
computes, in order:

1. **Elapsed ticks (`N`)** between snapshot and now. `N = 0` → `NONE`, "no new data."
2. **Raw % price change** since the snapshot.
3. **Volatility-adjusted significance** — not a fixed threshold. The stock's own trailing volatility
   (`stdev` of its last 20 ticks' returns) is scaled by `√N` to get an *expected* move size for this
   specific time gap, then `zScore = pctChange / expectedMoveStdPct`. A 5% move only scores high if it's
   large **relative to that stock's own normal noise**.
4. **Market/sector context** — the engine reads the market index and the stock's sector index over the
   *same window* and computes `relativeToMarket = pctChange − marketWindowPct`. This is the mechanism
   behind the brief's example: +5% while the market is flat scores very differently from +5% while the
   market itself moved +5%, because in the second case `relativeToMarket ≈ 0`.
5. **Volume anomaly** — current volume vs. the trailing 20-tick average; `≥ 2.5×` is flagged.
6. **Score** = up to 50 pts from `|zScore|` (capped at z=5) + 20 pts if the move exceeds what market
   movement alone explains + 20 pts for a volume anomaly, capped at 100.
7. **Classification**: `HIGH ≥ 55`, `MEDIUM ≥ 25`, `LOW ≥ 8`, else `NONE`.
8. **Reasons** — every non-trivial factor above is rendered as a plain-language sentence with the actual
   numbers in it (e.g. *"This move is 3.1x RELIANCE's typical volatility for a similar time window"*).
   The engine never returns a bare score without evidence.

**Reliability handling**, evaluated alongside scoring rather than as an afterthought:
- **Stale data**: if a symbol's feed hasn't produced a *real* update in ≥ 6 ticks (30 simulated minutes),
  it's flagged `stale: true` with a plain-language warning, and a `HIGH` verdict is deliberately capped to
  `MEDIUM` — the engine doesn't let a frozen price masquerade as a confident high-attention signal.
- **Conflicting data**: if two feeds disagree on a symbol's price, both values are surfaced
  (`evidence.primaryPrice` / `evidence.secondaryPrice`) rather than silently averaged or one chosen.

All six scenarios (`normal`, `unusual_movement`, `high_volume`, `market_wide`, `stale_data`,
`conflicting_data`) are scripted into specific symbols in `simulate.js` precisely so this logic can be
exercised deterministically both in tests and live via the admin panel.

---

## 5. Trade-offs & what would change at scale

- **SQLite / single process** — right for a scored demo (zero setup, file-based, fast). At real scale this
  becomes Postgres, with `snapshots` and `watchlist_items` sharded/indexed by `user_id`, and the simulated
  universe replaced by a real streaming market-data ingest (the `marketState.js` abstraction boundary is
  designed so swapping the data source doesn't touch the engine or routes).
- **In-memory universe cache** (`getUniverse` in `simulate.js`) — fine for 15 symbols computed once per
  scenario; a production system would precompute/store index & volatility series in a time-series store
  and query windows instead of recomputing from an in-memory array.
- **Global sim clock** (`admin_state`, single row) — intentional for a shared, demoable, reproducible
  state across all users/judges hitting the same deployment. A multi-tenant production system would key
  simulated/real time per environment, not globally.
- **JWT in localStorage** on the client — acceptable for a demo; a production app would move to httpOnly
  cookies + refresh tokens to reduce XSS exposure.
- **Volatility/volume windows fixed at 20 ticks, thresholds fixed at 2.5× / z-bands** — chosen and tuned by
  hand against the six scenarios rather than fit to real historical data; a production version would
  calibrate these per-symbol from actual historical distributions.

---

## 6. Testing & Quality

`server/src/__tests__/` — **39 tests, all passing** (`npm test` inside `server/`, uses Jest + Supertest):

**Unit tests — `engine.test.js`** (pure functions, no DB/HTTP):
- score → level boundary mapping
- determinism (same inputs ⇒ identical output; `generateUniverse` reproducibility across calls, proving
  nothing is randomized per-refresh)
- no-prior-context baseline case, zero-elapsed-time case
- `unusual_movement` scenario correctly flags `HIGH`
- `market_wide` scenario scores **lower** than an idiosyncratic move of similar raw size — the core
  "meaningful ≠ big" claim, tested directly rather than just asserted in prose
- `high_volume` scenario flags the volume-specific reason
- `stale_data` scenario flags `stale`, includes `staleMinutes`, and caps the level below `HIGH`
- `conflicting_data` scenario surfaces both prices, never silently merges them

**API/integration tests — `api.test.js`** (real Express app + real in-memory SQLite per test):
- signup validation (bad email / short password / empty name), duplicate signup, bad login
- protected-route 401 on missing/invalid token
- watchlist add/remove, unknown-symbol rejection, duplicate rejection, baseline snapshot on add
- feed ordering invariant (HIGH/MEDIUM/LOW before NONE) and evidence-on-every-alert invariant
- admin 403 for non-admin users; scenario/advance/reset all verified end-to-end, including that an
  admin-triggered scenario change is visible in a *different* user's feed
- stock catalog search + 404 for unknown symbol + detail payload shape
- profile update + password-change validation
- persistence across a simulated server restart (new `createApp(db)` instance, same DB connection)

**End-to-end journey test — `journey.e2e.test.js`** (one continuous scenario, real app + real DB):
Chains the exact critical path a judge would walk, as a single ordered test file rather than isolated
endpoint checks: **demo user login → sees existing 5-stock watchlist → dashboard loads with evidence on
every item → admin logs in separately → 403 confirms a user token cannot reach admin routes → admin
switches to the `unusual_movement` scenario and advances simulated time → the same user's dashboard now
surfaces RELIANCE as HIGH/MEDIUM with numeric evidence (`pctChange`, reasons) → user marks it reviewed →
verdict resets to NONE → state (both the review and the watchlist) survives a simulated server restart**
(a fresh `createApp(db)` instance against the same connection).

*A browser-driven (Playwright) E2E layer was evaluated and deliberately not added*: this sandbox's network
egress allow-list permits `registry.npmjs.org` (so the `playwright` package itself installs) but blocks the
actual browser-binary CDN — `curl -I https://playwright.azureedge.net` returns `403 host_not_allowed` here.
`npx playwright install` cannot succeed in this environment, and shipping a browser-test config that fails
in CI would violate "don't destabilize the project." The journey test above exercises the identical
request path (auth, dashboard, admin, feed recomputation, persistence) at the HTTP layer instead, which is
where all of this product's actual logic lives — the React layer is a thin renderer of what these
endpoints return.

Run it:
```bash
cd server
npm install
npm test        # 39/39 passing
```

CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` for the server and `npm ci && npm run build`
for the client on every push/PR to `main`.

---

## 7. Demo instructions

```bash
# 1. Server (default port 4000)
cd server
npm install
npm start
# → "Smart Watchlist API listening on http://localhost:4000"

# 2. Client (separate terminal, default port 5173)
cd client
npm install
npm run dev
```

Open the client URL and log in with the seeded demo account:
- **User:** `demo@watchlist.app` / `demo1234` — pre-loaded with a 5-stock watchlist and a real baseline
  snapshot, so the "Since you last checked" feed has something to show immediately.
- **Admin:** `admin@watchlist.app` / `admin1234` — visit `/admin` (not linked from the regular nav) to
  switch scenarios, advance the simulated clock, inspect currently-stale/conflicting symbols, and reset
  all demo data.

**Recommended judge demo flow:**
1. Log in as the demo user (`/login`, pre-filled). Land on the dashboard — with the default `normal`
   scenario this is mostly quiet, which is itself the point: the product is willing to say "nothing
   significant" instead of manufacturing alerts.
2. Open a second tab, log in as admin, go to `/admin`. Note the scenario cards each explain what they
   demonstrate, and the simulated clock/data-quality panel.
3. Click **"Mark as reviewed"** isn't needed yet — instead switch scenario to **Unusual movement**, then
   **Advance 20 ticks** once or twice.
4. Reload the demo user's dashboard: RELIANCE should now show as `HIGH`/`MEDIUM`, with an evidence chip
   row and plain-language reasons naming the actual % move, its volatility multiple, and the (flat)
   market move in the same window. Open the stock's detail page to see the full "How we got here"
   reasoning pipeline (change → volatility → market → sector → volume → data quality → result).
5. Back in `/admin`, try **Stale data** and **Conflicting data** — reload the dashboard/detail page for
   HDFCBANK / ICICIBANK respectively to see the freshness warning and the side-by-side conflicting prices.
6. Use **Reset demo data** to return to a clean baseline for a re-run.

---

## 8. Deployment readiness

The app is two independently deployable pieces; nothing here assumes a specific host.

**Server** (`server/`):
- `PORT` — read from the environment (`server/src/index.js`), defaults to `4000` locally. Any host that
  injects `PORT` (Render, Railway, Fly, etc.) works without code changes.
- `JWT_SECRET` — read from the environment (`server/src/auth.js`), falls back to a dev value locally.
  **Must be set explicitly in any real deployment** — see `server/.env.example`.
- `CORS_ORIGIN` — optional, comma-separated list of allowed origins (`server/src/app.js`). If unset, CORS
  stays fully open, matching current local-dev behavior; set it to your deployed frontend's origin(s) in
  production.
- Start command: `npm start` (`node src/index.js`) — no build step required (plain CommonJS Node).
- **Persistence**: SQLite via `better-sqlite3`, a single file (`server/data.sqlite*`, gitignored). This is
  intentional for a judged demo — zero external dependencies, instant cold start, deterministic. The
  trade-off: on most PaaS hosts the filesystem is ephemeral across deploys/restarts, so the demo/admin
  seed data would reset on redeploy (not on every request — only on a fresh container). For a persistent
  production deployment this would move to a managed Postgres instance; the `db.js` module is the only
  file that would need to change, since all routes go through prepared statements against a single `db`
  handle passed into `createApp(db)`.

**Client** (`client/`):
- `VITE_API_URL` — the only required config, already used by `client/src/api.js`; falls back to
  `http://localhost:4000/api`. Set it to the deployed server's URL at build time (see
  `client/.env.example`).
- Build command: `npm run build` → static `dist/` (verified building cleanly, ~185KB gzipped JS). Deploy
  `dist/` to any static host (Vercel, Netlify, S3+CDN, etc.) — no server-side rendering is required.

**Secrets**: no credentials are committed. `.gitignore` excludes `.env`/`.env.local` and the generated
SQLite files; both `.env.example` files document required variables without real secrets. The seeded demo
and admin passwords in this README are intentionally shared for evaluation only — they are not
production credentials and should be rotated/removed for any real deployment.
