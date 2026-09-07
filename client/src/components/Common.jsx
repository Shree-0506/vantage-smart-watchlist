export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="state-block">
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-block">
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function LevelBadge({ level }) {
  const label = level === "NONE" ? "Nothing significant" : level;
  return <span className={`level-badge ${level}`}>{label}</span>;
}

export function PriceDelta({ pct }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <div className={`price-delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </div>
  );
}

export function formatINR(n) {
  if (n === null || n === undefined) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTimeAgo(ts) {
  if (!ts) return "just now";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/**
 * Compact, at-a-glance evidence strip for attention cards. Purely a
 * presentation of fields the backend engine already computes and returns
 * (evidence.*, stale, conflicting) — no new claims are invented client-side.
 */
export function EvidenceChips({ evidence, stale, conflicting }) {
  if (!evidence) return null;
  const chips = [];

  if (evidence.zScore !== undefined) {
    chips.push({
      label: "vs typical volatility",
      value: `${Math.abs(evidence.zScore).toFixed(1)}x`,
      flag: Math.abs(evidence.zScore) >= 1.5,
    });
  }
  if (evidence.relativeToMarket !== undefined) {
    chips.push({
      label: "vs market",
      value: `${evidence.relativeToMarket >= 0 ? "+" : ""}${evidence.relativeToMarket.toFixed(2)}pp`,
      flag: Math.abs(evidence.relativeToMarket) >= 1,
    });
  }
  if (evidence.volumeRatio !== undefined) {
    chips.push({
      label: "volume",
      value: `${evidence.volumeRatio.toFixed(1)}x avg`,
      flag: evidence.volumeRatio >= 2.5,
    });
  }
  if (stale) chips.push({ label: "data", value: "stale", flag: true });
  if (conflicting) chips.push({ label: "data", value: "conflicting", flag: true });

  if (!chips.length) return null;

  return (
    <div className="evidence-chips">
      {chips.map((c, i) => (
        <span className={`evidence-chip${c.flag ? " flag" : ""}`} key={i}>
          <span className="chip-label">{c.label}</span>
          <span className="chip-value">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Full reasoning-pipeline breakdown for the stock detail page: walks through
 * every stage the engine evaluates (change → volatility → market → sector →
 * volume → data quality) so it's clear how the final verdict was reached.
 * Every value here comes straight from the API's `evidence` object.
 */
export function EvidencePipeline({ verdict }) {
  if (!verdict) return null;
  const ev = verdict.evidence || {};

  const steps = [
    {
      label: "Change since last check",
      detail: ev.lastSeenPrice !== undefined ? `₹${ev.lastSeenPrice} → ₹${ev.currentPrice}` : null,
      value: ev.pctChange !== undefined ? `${ev.pctChange >= 0 ? "+" : ""}${ev.pctChange.toFixed(2)}%` : "—",
      contributed: ev.pctChange !== undefined && Math.abs(ev.pctChange) >= 0.1,
    },
    {
      label: "Typical volatility for this stock",
      detail: ev.expectedMoveStdPct !== undefined ? `expected move ~${ev.expectedMoveStdPct.toFixed(2)}%` : null,
      value: ev.zScore !== undefined ? `${Math.abs(ev.zScore).toFixed(1)}x normal` : "—",
      contributed: ev.zScore !== undefined && Math.abs(ev.zScore) >= 1.5,
    },
    {
      label: "Broader market, same window",
      detail: null,
      value: ev.marketWindowPct !== undefined ? `${ev.marketWindowPct >= 0 ? "+" : ""}${ev.marketWindowPct.toFixed(2)}%` : "—",
      contributed: ev.relativeToMarket !== undefined && Math.abs(ev.relativeToMarket) >= (ev.expectedMoveStdPct || 0),
    },
    {
      label: "Sector, same window",
      detail: null,
      value: ev.sectorWindowPct !== undefined ? `${ev.sectorWindowPct >= 0 ? "+" : ""}${ev.sectorWindowPct.toFixed(2)}%` : "—",
      contributed: ev.relativeToSector !== undefined && Math.abs(ev.relativeToSector) >= (ev.expectedMoveStdPct || 0),
    },
    {
      label: "Trading volume vs. recent average",
      detail: ev.currentVolume !== undefined ? `${ev.currentVolume.toLocaleString("en-IN")} vs ~${(ev.avgVolume || 0).toLocaleString("en-IN")}` : null,
      value: ev.volumeRatio !== undefined ? `${ev.volumeRatio.toFixed(1)}x` : "—",
      contributed: ev.volumeRatio !== undefined && ev.volumeRatio >= 2.5,
    },
    {
      label: "Data quality",
      detail: null,
      value: verdict.conflicting ? "Conflicting sources" : verdict.stale ? "Stale feed" : "Clean",
      contributed: verdict.conflicting || verdict.stale,
    },
  ];

  return (
    <div className="pipeline">
      {steps.map((s, i) => (
        <div className={`pipeline-step${s.contributed ? " contributed" : ""}`} key={i}>
          <div className="pipeline-index">{i + 1}</div>
          <div className="pipeline-body">
            <div>
              <div className="pipeline-label">{s.label}</div>
              {s.detail && <div className="pipeline-detail">{s.detail}</div>}
            </div>
            <div className={`pipeline-value ${s.contributed ? "flag" : "neutral"}`}>{s.value}</div>
          </div>
        </div>
      ))}
      <div className="pipeline-result">
        <span className="label">Result</span>
        <LevelBadge level={verdict.level} />
      </div>
    </div>
  );
}

export function formatClock(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
