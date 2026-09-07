const request = require("supertest");
const { createDb } = require("../db");
const { createApp } = require("../app");

let db, app;

beforeEach(() => {
  db = createDb(":memory:");
  app = createApp(db);
});

describe("auth", () => {
  test("signup validates email/password/name", async () => {
    const r1 = await request(app).post("/api/auth/signup").send({ email: "bad", password: "123456", name: "X" });
    expect(r1.status).toBe(400);

    const r2 = await request(app)
      .post("/api/auth/signup")
      .send({ email: "new@user.com", password: "123", name: "X" });
    expect(r2.status).toBe(400);

    const r3 = await request(app)
      .post("/api/auth/signup")
      .send({ email: "new@user.com", password: "123456", name: "" });
    expect(r3.status).toBe(400);
  });

  test("signup then login works end-to-end", async () => {
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ email: "new@user.com", password: "password1", name: "New User" });
    expect(signup.status).toBe(201);
    expect(signup.body.token).toBeTruthy();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "new@user.com", password: "password1" });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("new@user.com");
  });

  test("duplicate signup is rejected", async () => {
    await request(app).post("/api/auth/signup").send({ email: "dup@user.com", password: "password1", name: "A" });
    const r2 = await request(app)
      .post("/api/auth/signup")
      .send({ email: "dup@user.com", password: "password1", name: "A" });
    expect(r2.status).toBe(409);
  });

  test("bad login credentials rejected", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: "demo@watchlist.app", password: "wrong" });
    expect(r.status).toBe(401);
  });

  test("protected routes reject missing/invalid token", async () => {
    const r1 = await request(app).get("/api/watchlist");
    expect(r1.status).toBe(401);
    const r2 = await request(app).get("/api/watchlist").set("Authorization", "Bearer garbage");
    expect(r2.status).toBe(401);
  });
});

async function loginDemo(app) {
  const res = await request(app).post("/api/auth/login").send({ email: "demo@watchlist.app", password: "demo1234" });
  return res.body.token;
}

async function loginAdmin(app) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@watchlist.app", password: "admin1234" });
  return res.body.token;
}

describe("watchlist", () => {
  test("demo user has a seeded watchlist", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(5);
  });

  test("can add and remove a stock, rejects unknown symbols and duplicates", async () => {
    const token = await loginDemo(app);

    const bad = await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "NOTREAL" });
    expect(bad.status).toBe(400);

    const add = await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "ITC" });
    expect(add.status).toBe(201);

    const dup = await request(app)
      .post("/api/watchlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "itc" });
    expect(dup.status).toBe(409);

    const del = await request(app).delete("/api/watchlist/ITC").set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);

    const delAgain = await request(app).delete("/api/watchlist/ITC").set("Authorization", `Bearer ${token}`);
    expect(delAgain.status).toBe(404);
  });

  test("adding a stock establishes a baseline snapshot so the feed doesn't crash on first view", async () => {
    const token = await loginDemo(app);
    await request(app).post("/api/watchlist").set("Authorization", `Bearer ${token}`).send({ symbol: "NTPC" });
    const feed = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    const ntpc = feed.body.items.find((i) => i.symbol === "NTPC");
    expect(ntpc).toBeTruthy();
    expect(ntpc.level).toBe("NONE"); // just added, no elapsed time yet
  });

  test("ack resets the baseline for a symbol", async () => {
    const token = await loginDemo(app);
    const ack = await request(app).post("/api/watchlist/RELIANCE/ack").set("Authorization", `Bearer ${token}`);
    expect(ack.status).toBe(200);
    const feed = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    const reliance = feed.body.items.find((i) => i.symbol === "RELIANCE");
    expect(reliance.level).toBe("NONE");
  });
});

describe("feed - since you last checked", () => {
  test("returns items sorted with HIGH/MEDIUM/LOW before NONE", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    const levels = r.body.items.map((i) => i.level);
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
    for (let i = 1; i < levels.length; i++) {
      expect(order[levels[i]]).toBeGreaterThanOrEqual(order[levels[i - 1]]);
    }
  });

  test("every non-NONE item includes evidence-backed reasons", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    for (const item of r.body.items) {
      if (item.level !== "NONE") {
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(item.evidence).toBeDefined();
        expect(item.evidence.pctChange).toBeDefined();
      }
    }
  });

  test("tracks previousCheckAt across repeated calls", async () => {
    const token = await loginDemo(app);
    const first = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    expect(first.body.previousCheckAt).toBeNull();
    const second = await request(app).get("/api/feed").set("Authorization", `Bearer ${token}`);
    expect(second.body.previousCheckAt).toBeTruthy();
  });
});

describe("admin", () => {
  test("non-admin cannot access admin routes", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(403);
  });

  test("admin can inspect state, change scenario, advance time, and reset", async () => {
    const token = await loginAdmin(app);

    const state = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${token}`);
    expect(state.status).toBe(200);
    expect(state.body.scenario).toBe("normal");

    const badScenario = await request(app)
      .post("/api/admin/scenario")
      .set("Authorization", `Bearer ${token}`)
      .send({ scenario: "not_a_scenario" });
    expect(badScenario.status).toBe(400);

    const setScenario = await request(app)
      .post("/api/admin/scenario")
      .set("Authorization", `Bearer ${token}`)
      .send({ scenario: "stale_data" });
    expect(setScenario.status).toBe(200);

    const stateAfter = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${token}`);
    expect(stateAfter.body.scenario).toBe("stale_data");

    const beforeStep = stateAfter.body.currentStep;
    const advance = await request(app)
      .post("/api/admin/advance")
      .set("Authorization", `Bearer ${token}`)
      .send({ steps: 10 });
    expect(advance.status).toBe(200);
    expect(advance.body.currentStep).toBe(beforeStep + 10);

    const reset = await request(app).post("/api/admin/reset").set("Authorization", `Bearer ${token}`);
    expect(reset.status).toBe(200);
    const stateAfterReset = await request(app).get("/api/admin/state").set("Authorization", `Bearer ${token}`);
    expect(stateAfterReset.body.scenario).toBe("normal");
  });

  test("admin scenario changes are reflected in the demo user's feed (stale scenario surfaces staleness)", async () => {
    const adminToken = await loginAdmin(app);
    await request(app)
      .post("/api/admin/scenario")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scenario: "stale_data" });
    await request(app).post("/api/admin/advance").set("Authorization", `Bearer ${adminToken}`).send({ steps: 60 });

    const userToken = await loginDemo(app);
    // re-establish baseline then advance further to guarantee staleness window
    await request(app).post("/api/watchlist/HDFCBANK/ack").set("Authorization", `Bearer ${userToken}`);
    await request(app).post("/api/admin/advance").set("Authorization", `Bearer ${adminToken}`).send({ steps: 10 });

    const feed = await request(app).get("/api/feed").set("Authorization", `Bearer ${userToken}`);
    const hdfc = feed.body.items.find((i) => i.symbol === "HDFCBANK");
    expect(hdfc.stale).toBe(true);
  });
});

describe("stocks", () => {
  test("catalog search filters by symbol/name/sector", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/stocks?q=bank").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.results.every((s) => s.sector.toLowerCase().includes("bank") || s.name.toLowerCase().includes("bank") || s.symbol.toLowerCase().includes("bank"))).toBe(true);
    expect(r.body.results.length).toBeGreaterThan(0);
  });

  test("unknown symbol detail returns 404", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/stocks/NOTREAL").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(404);
  });

  test("stock detail includes chart, freshness timestamp, and why-this-matters when on watchlist", async () => {
    const token = await loginDemo(app);
    const r = await request(app).get("/api/stocks/RELIANCE").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.chart.length).toBeGreaterThan(0);
    expect(r.body.asOf).toBeTruthy();
    expect(r.body.whyThisMatters).toBeTruthy();
    expect(r.body.whyThisMatters.reasons.length).toBeGreaterThan(0);
  });
});

describe("profile", () => {
  test("get and update profile, reject weak new password / wrong current password", async () => {
    const token = await loginDemo(app);
    const get = await request(app).get("/api/profile").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.watchlistCount).toBe(5);

    const patch = await request(app)
      .patch("/api/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Name" });
    expect(patch.status).toBe(200);

    const badPw = await request(app)
      .post("/api/profile/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong", newPassword: "newpassword1" });
    expect(badPw.status).toBe(401);

    const shortPw = await request(app)
      .post("/api/profile/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "demo1234", newPassword: "123" });
    expect(shortPw.status).toBe(400);

    const goodPw = await request(app)
      .post("/api/profile/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "demo1234", newPassword: "newpassword1" });
    expect(goodPw.status).toBe(200);
  });
});

describe("persistence", () => {
  test("watchlist additions persist across separate app instances on the same db", async () => {
    const token = await loginDemo(app);
    await request(app).post("/api/watchlist").set("Authorization", `Bearer ${token}`).send({ symbol: "MARUTI" });

    const app2 = createApp(db); // simulate a server restart re-using the same db connection
    const r = await request(app2).get("/api/watchlist").set("Authorization", `Bearer ${token}`);
    expect(r.body.items.some((i) => i.symbol === "MARUTI")).toBe(true);
  });
});
