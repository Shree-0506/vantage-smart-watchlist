import { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingState, ErrorState, formatClock } from "../components/Common";

const SCENARIO_INFO = {
  normal: { name: "Normal market", desc: "Gentle drift, no scripted anomalies. Baseline behavior." },
  unusual_movement: { name: "Unusual movement", desc: "RELIANCE jumps sharply while the market stays flat — a high-attention, stock-specific move." },
  high_volume: { name: "High volume", desc: "INFY trades at ~3.5x normal volume with only a modest price change." },
  market_wide: { name: "Market-wide movement", desc: "The whole market rallies together — individual moves look large but aren't unusual relative to the index." },
  stale_data: { name: "Stale data", desc: "HDFCBANK's feed freezes mid-session, testing freshness/staleness detection." },
  conflicting_data: { name: "Conflicting data", desc: "ICICIBANK's primary and secondary feeds disagree on price." },
};

export default function Admin() {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.adminState();
      setState(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function withBusy(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!state) return <div className="page"><LoadingState /></div>;

  return (
    <>
      <div className="admin-banner">Protected admin area — controls simulated market state for all users.</div>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Admin</h1>
            <div className="page-sub">Trigger scenarios, advance simulated time, and inspect data freshness.</div>
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <div className="admin-grid">
          <div className="card card-pad">
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Scenario</h3>
            <p className="page-sub" style={{ marginBottom: 14 }}>
              Switching scenario resets the simulated clock to a mid-session step.
            </p>
            <div className="scenario-list">
              {state.availableScenarios.map((sc) => (
                <button
                  key={sc}
                  className={`scenario-btn ${state.scenario === sc ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => withBusy(() => api.adminSetScenario(sc))}
                >
                  <span className="name">{SCENARIO_INFO[sc]?.name || sc}</span>
                  <span className="desc">{SCENARIO_INFO[sc]?.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="card card-pad" style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Simulated clock</h3>
              <div className="kv-row">
                <span className="k">Current step</span>
                <span className="v">{state.currentStep} / {state.totalSteps - 1}</span>
              </div>
              <div className="kv-row">
                <span className="k">Simulated time</span>
                <span className="v">{formatClock(state.currentTimestamp)}</span>
              </div>
              <div className="kv-row">
                <span className="k">Active scenario</span>
                <span className="v">{state.scenario}</span>
              </div>
              <div className="kv-row">
                <span className="k">Registered users</span>
                <span className="v">{state.userCount}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-sm" disabled={busy} onClick={() => withBusy(() => api.adminAdvance(1))}>
                  Advance 1 tick
                </button>
                <button className="btn btn-sm" disabled={busy} onClick={() => withBusy(() => api.adminAdvance(6))}>
                  Advance 6 ticks (30 min)
                </button>
                <button className="btn btn-sm" disabled={busy} onClick={() => withBusy(() => api.adminAdvance(20))}>
                  Advance 20 ticks
                </button>
              </div>
            </div>

            <div className="card card-pad" style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Data quality, right now</h3>
              <div className="kv-row">
                <span className="k">Stale symbols</span>
                <span className="v">{state.staleSymbols.length ? state.staleSymbols.join(", ") : "None"}</span>
              </div>
              <div className="kv-row">
                <span className="k">Conflicting-feed symbols</span>
                <span className="v">{state.conflictSymbols.length ? state.conflictSymbols.join(", ") : "None"}</span>
              </div>
            </div>

            <div className="card card-pad">
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Reset demo state</h3>
              <p className="page-sub" style={{ marginBottom: 14 }}>
                Wipes all users, watchlists and snapshots and re-seeds the demo + admin accounts.
              </p>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("This will erase all users and watchlists. Continue?")) {
                    withBusy(() => api.adminReset());
                  }
                }}
              >
                Reset demo data
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
