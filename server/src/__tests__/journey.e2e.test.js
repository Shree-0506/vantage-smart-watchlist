// End-to-end CRITICAL JOURNEY test.
//
// Unlike api.test.js (which tests each endpoint in isolation), this file
// chains one continuous scenario through the exact path a judge/demo user
// would walk: login -> existing watchlist/dashboard -> admin triggers a
// scenario + advances simulated time -> the SAME user's dashboard reflects
// a meaningful change with evidence -> user reviews it -> the review
// persists across what simulates a server restart.
//
// This runs against the real Express app (`createApp`) and a real SQLite
// connection (in-memory), exercising true HTTP request/response cycles end
// to end. A browser-driven (Playwright) layer was evaluated but is not
// feasible in this sandboxed environment: the sandbox's network egress
// allow-list permits the npm registry but blocks the Playwright browser
// binary CDN (verified: `playwright.azureedge.net` -> 403 host_not_allowed),
// so `npx playwright install` cannot succeed here. This test covers the
// identical critical path at the HTTP/integration layer instead.

const request = require("supertest");
const { createDb } = require("../db");
const { createApp } = require("../app");

describe("E2E critical journey: login -> dashboard -> admin scenario -> meaningful change -> review -> persistence", () => {
  let db, app;

  beforeAll(() => {
    db = createDb(":memory:");
    app = createApp(db);
  });

  let userToken;
  let adminToken;

  test("Step 1 — demo user logs in and sees their existing watchlist", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@watchlist.app", password: "demo1234" });
    expect(login.status).toBe(200);
    userToken = login.body.token;
    expect(userToken).toBeTruthy();

    const watchlist = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${userToken}`);
    expect(watchlist.status).toBe(200);
    expect(watchlist.body.items.length).toBe(5);
    expect(watchlist.body.items.some((i) => i.symbol === "RELIANCE")).toBe(true);
  });

  test("Step 2 — dashboard (feed) loads with baseline evidence, nothing forced yet", async () => {
    const feed = await request(app).get("/api/feed").set("Authorization", `Bearer ${userToken}`);
    expect(feed.status).toBe(200);
    expect(feed.body.watchlistSize).toBe(5);
    // Every item, regardless of level, must carry the evidence object —
    // the product never shows a bare verdict.
    for (const item of feed.body.items) {
      expect(item.evidence).toBeDefined();
      expect(Array.isArray(item.reasons)).toBe(true);
    }
  });

  test("Step 3 — admin logs in separately and confirms baseline sim state", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@watchlist.app", password: "admin1234" });
    expect(login.status).toBe(200);
    adminToken = login.body.token;

    // a regular user token must NOT be able to reach admin routes
    const forbidden = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${userToken}`);
    expect(forbidden.status).toBe(403);

    const state = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${adminToken}`);
    expect(state.status).toBe(200);
    expect(state.body.scenario).toBe("normal");
  });

  test("Step 4 — admin triggers an unusual-movement scenario and advances simulated time", async () => {
    const setScenario = await request(app)
      .post("/api/admin/scenario")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scenario: "unusual_movement" });
    expect(setScenario.status).toBe(200);
    expect(setScenario.body.scenario).toBe("unusual_movement");

    // re-establish the user's baseline snapshot right after the scenario
    // switch (simulating "the user checked right as the scenario started"),
    // then advance the clock through RELIANCE's scripted jump window.
    await request(app).post("/api/watchlist/RELIANCE/ack").set("Authorization", `Bearer ${userToken}`);

    const advance = await request(app)
      .post("/api/admin/advance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ steps: 40 });
    expect(advance.status).toBe(200);
    expect(advance.body.currentStep).toBeGreaterThan(20);
  });

  test("Step 5 — the SAME user's dashboard now surfaces RELIANCE as meaningful, with evidence", async () => {
    const feed = await request(app).get("/api/feed").set("Authorization", `Bearer ${userToken}`);
    expect(feed.status).toBe(200);

    const reliance = feed.body.items.find((i) => i.symbol === "RELIANCE");
    expect(reliance).toBeTruthy();
    expect(reliance.level).not.toBe("NONE");
    expect(["HIGH", "MEDIUM"]).toContain(reliance.level);

    // evidence-backed, not a bare verdict
    expect(reliance.reasons.length).toBeGreaterThan(0);
    expect(reliance.evidence.pctChange).toBeDefined();
    expect(Math.abs(reliance.evidence.pctChange)).toBeGreaterThan(1);

    // sorting invariant: significant items surface before "nothing significant"
    const levels = feed.body.items.map((i) => i.level);
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
    for (let i = 1; i < levels.length; i++) {
      expect(order[levels[i]]).toBeGreaterThanOrEqual(order[levels[i - 1]]);
    }
  });

  test("Step 6 — user reviews the alert (marks as reviewed), resetting its baseline", async () => {
    const ack = await request(app).post("/api/watchlist/RELIANCE/ack").set("Authorization", `Bearer ${userToken}`);
    expect(ack.status).toBe(200);

    const feedAfterAck = await request(app).get("/api/feed").set("Authorization", `Bearer ${userToken}`);
    const reliance = feedAfterAck.body.items.find((i) => i.symbol === "RELIANCE");
    expect(reliance.level).toBe("NONE"); // reviewed -> no new delta since the fresh baseline
  });

  test("Step 7 — the reviewed state persists across a simulated server restart", async () => {
    // Same underlying db connection, brand-new Express app instance — mirrors
    // a process restart while the SQLite file/connection survives.
    const restartedApp = createApp(db);

    const feed = await request(restartedApp).get("/api/feed").set("Authorization", `Bearer ${userToken}`);
    expect(feed.status).toBe(200);
    const reliance = feed.body.items.find((i) => i.symbol === "RELIANCE");
    expect(reliance.level).toBe("NONE");

    const watchlist = await request(restartedApp)
      .get("/api/watchlist")
      .set("Authorization", `Bearer ${userToken}`);
    expect(watchlist.body.items.length).toBe(5); // watchlist itself untouched by the restart
  });
});
