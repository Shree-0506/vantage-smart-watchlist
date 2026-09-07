const { evaluateChange, trailingVolatilityPct, classify } = require("../engine/changeEngine");
const { getUniverse } = require("../data/simulate");

describe("changeEngine.classify", () => {
  test("boundaries map to expected levels", () => {
    expect(classify(0)).toBe("NONE");
    expect(classify(7)).toBe("NONE");
    expect(classify(8)).toBe("LOW");
    expect(classify(24)).toBe("LOW");
    expect(classify(25)).toBe("MEDIUM");
    expect(classify(54)).toBe("MEDIUM");
    expect(classify(55)).toBe("HIGH");
    expect(classify(100)).toBe("HIGH");
  });
});

describe("changeEngine.evaluateChange - determinism", () => {
  test("same inputs always produce the same output (no Math.random leakage)", () => {
    const universe = getUniverse("normal");
    const lastSeen = { step: 10, price: universe.series.RELIANCE[10].price, volume: universe.series.RELIANCE[10].volume };
    const currentTick = universe.series.RELIANCE[30];

    const a = evaluateChange({ symbol: "RELIANCE", sector: "Energy", lastSeen, currentTick, universe, currentStep: 30 });
    const b = evaluateChange({ symbol: "RELIANCE", sector: "Energy", lastSeen, currentTick, universe, currentStep: 30 });

    expect(a).toEqual(b);
  });

  test("generateUniverse itself is deterministic across calls", () => {
    const { generateUniverse } = require("../data/simulate");
    const u1 = generateUniverse("normal");
    const u2 = generateUniverse("normal");
    expect(u1.series.TCS).toEqual(u2.series.TCS);
    expect(u1.marketIndex).toEqual(u2.marketIndex);
  });
});

describe("changeEngine.evaluateChange - no prior context", () => {
  test("returns NONE with baseline message when there is no snapshot yet", () => {
    const universe = getUniverse("normal");
    const currentTick = universe.series.RELIANCE[20];
    const result = evaluateChange({
      symbol: "RELIANCE",
      sector: "Energy",
      lastSeen: null,
      currentTick,
      universe,
      currentStep: 20,
    });
    expect(result.level).toBe("NONE");
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toMatch(/baseline/i);
  });
});

describe("changeEngine.evaluateChange - unusual movement scenario", () => {
  test("flags RELIANCE as HIGH attention after its scripted jump, market barely moved", () => {
    const universe = getUniverse("unusual_movement");
    const lastSeen = {
      step: 55,
      price: universe.series.RELIANCE[55].price,
      volume: universe.series.RELIANCE[55].volume,
    };
    const currentTick = universe.series.RELIANCE[75];

    const result = evaluateChange({
      symbol: "RELIANCE",
      sector: "Energy",
      lastSeen,
      currentTick,
      universe,
      currentStep: 75,
    });

    expect(result.level).toBe("HIGH");
    expect(Math.abs(result.evidence.pctChange)).toBeGreaterThan(3);
    // Evidence must be present, never a bare verdict
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => /market/i.test(r))).toBe(true);
  });
});

describe("changeEngine.evaluateChange - market-wide movement is NOT over-flagged", () => {
  test("a stock moving with a market-wide rally scores lower than an idiosyncratic move of similar size", () => {
    const marketWideUniverse = getUniverse("market_wide");
    const unusualUniverse = getUniverse("unusual_movement");

    const lastSeenMW = {
      step: 35,
      price: marketWideUniverse.series.TCS[35].price,
      volume: marketWideUniverse.series.TCS[35].volume,
    };
    const currentMW = marketWideUniverse.series.TCS[75];
    const marketWideResult = evaluateChange({
      symbol: "TCS",
      sector: "IT",
      lastSeen: lastSeenMW,
      currentTick: currentMW,
      universe: marketWideUniverse,
      currentStep: 75,
    });

    const lastSeenU = {
      step: 55,
      price: unusualUniverse.series.RELIANCE[55].price,
      volume: unusualUniverse.series.RELIANCE[55].volume,
    };
    const currentU = unusualUniverse.series.RELIANCE[75];
    const idiosyncraticResult = evaluateChange({
      symbol: "RELIANCE",
      sector: "Energy",
      lastSeen: lastSeenU,
      currentTick: currentU,
      universe: unusualUniverse,
      currentStep: 75,
    });

    // The idiosyncratic (stock-specific) move should score meaningfully
    // higher attention than a comparable market-wide move, because the
    // engine adjusts for what the broader market did.
    expect(idiosyncraticResult.score).toBeGreaterThan(marketWideResult.score);
  });
});

describe("changeEngine.evaluateChange - volume anomaly", () => {
  test("flags high-volume scenario for INFY with a volume-specific reason", () => {
    const universe = getUniverse("high_volume");
    const lastSeen = { step: 45, price: universe.series.INFY[45].price, volume: universe.series.INFY[45].volume };
    const currentTick = universe.series.INFY[65];

    const result = evaluateChange({
      symbol: "INFY",
      sector: "IT",
      lastSeen,
      currentTick,
      universe,
      currentStep: 65,
    });

    expect(result.evidence.volumeRatio).toBeGreaterThanOrEqual(2.5);
    expect(result.reasons.some((r) => /volume/i.test(r))).toBe(true);
    expect(["MEDIUM", "HIGH"]).toContain(result.level);
  });
});

describe("changeEngine.evaluateChange - stale data", () => {
  test("flags HDFCBANK as stale once its feed has been frozen long enough, and caps level at MEDIUM", () => {
    const universe = getUniverse("stale_data");
    const lastSeen = {
      step: 65,
      price: universe.series.HDFCBANK[65].price,
      volume: universe.series.HDFCBANK[65].volume,
    };
    const currentTick = universe.series.HDFCBANK[95]; // long after freeze at step 70

    const result = evaluateChange({
      symbol: "HDFCBANK",
      sector: "Banking",
      lastSeen,
      currentTick,
      universe,
      currentStep: 95,
    });

    expect(result.stale).toBe(true);
    expect(result.evidence.staleMinutes).toBeGreaterThan(0);
    expect(result.reasons.some((r) => /hasn't updated|stale|caution/i.test(r))).toBe(true);
    expect(result.level).not.toBe("HIGH");
  });
});

describe("changeEngine.evaluateChange - conflicting data", () => {
  test("flags ICICIBANK conflicting feeds and surfaces both prices instead of averaging silently", () => {
    const universe = getUniverse("conflicting_data");
    const lastSeen = {
      step: 50,
      price: universe.series.ICICIBANK[50].price,
      volume: universe.series.ICICIBANK[50].volume,
    };
    const currentTick = universe.series.ICICIBANK[60];

    const result = evaluateChange({
      symbol: "ICICIBANK",
      sector: "Banking",
      lastSeen,
      currentTick,
      universe,
      currentStep: 60,
    });

    expect(result.conflicting).toBe(true);
    expect(result.evidence.primaryPrice).toBeDefined();
    expect(result.evidence.secondaryPrice).toBeDefined();
    expect(result.evidence.primaryPrice).not.toEqual(result.evidence.secondaryPrice);
  });
});

describe("changeEngine.evaluateChange - no elapsed time", () => {
  test("returns NONE when current step equals last-seen step", () => {
    const universe = getUniverse("normal");
    const tick = universe.series.ITC[30];
    const result = evaluateChange({
      symbol: "ITC",
      sector: "FMCG",
      lastSeen: { step: 30, price: tick.price, volume: tick.volume },
      currentTick: tick,
      universe,
      currentStep: 30,
    });
    expect(result.level).toBe("NONE");
  });
});

describe("trailingVolatilityPct", () => {
  test("returns 0 for a flat series", () => {
    const flat = new Array(30).fill(0);
    expect(trailingVolatilityPct(flat, 20)).toBe(0);
  });

  test("returns a positive number for a noisy series", () => {
    const noisy = [0, 0.01, -0.02, 0.015, -0.01, 0.02, -0.015, 0.01, -0.02, 0.03, 0.01, -0.01];
    expect(trailingVolatilityPct(noisy, 10)).toBeGreaterThan(0);
  });
});
