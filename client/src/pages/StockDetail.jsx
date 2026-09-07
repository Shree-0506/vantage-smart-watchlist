import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { api } from "../api";
import { LoadingState, ErrorState, LevelBadge, EvidencePipeline, formatINR, formatClock } from "../components/Common";

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    setError("");
    try {
      const d = await api.getStock(symbol);
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  async function handleWatchToggle() {
    setBusy(true);
    setNote("");
    try {
      if (data.onWatchlist) {
        await api.removeFromWatchlist(symbol);
        setNote("Removed from your watchlist.");
      } else {
        await api.addToWatchlist(symbol);
        setNote("Added to your watchlist — baseline set to today's price.");
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAck() {
    setBusy(true);
    try {
      await api.ackWatchlistItem(symbol);
      setNote("Marked as reviewed — your baseline is now today's price.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><LoadingState label={`Loading ${symbol}…`} /></div>;

  const verdict = data.whyThisMatters;
  const chartData = data.chart.map((c) => ({ ...c, label: new Date(c.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }));

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 18 }} onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="detail-head">
        <div className="detail-title">
          <div>
            <h1>{data.symbol}</h1>
            <div className="page-sub">
              {data.name} · {data.sector}
            </div>
          </div>
        </div>
        <div className="detail-price">
          <div className="now num">{formatINR(data.currentPrice)}</div>
          {data.lastSeen && (
            <div className="page-sub">
              since you last checked: {formatINR(data.lastSeen.price)} on {formatClock(data.lastSeen.seenAt)}
            </div>
          )}
        </div>
      </div>

      <div className="freshness-row">
        <span className={`dot ${data.isStaleFeed ? "stale" : ""}`} />
        {data.isStaleFeed ? "Data feed may be stale" : "Live simulated feed"} · as of {formatClock(data.asOf)}
      </div>

      {note && <div className="inline-success">{note}</div>}

      {data.hasConflict && (
        <div className="conflict-box">
          <b>Conflicting data sources.</b> Primary feed shows {formatINR(data.currentPrice)}, secondary feed shows{" "}
          {formatINR(data.secondaryPrice)} — a {(((data.secondaryPrice - data.currentPrice) / data.currentPrice) * 100).toFixed(2)}%
          difference. We're showing both rather than silently picking one.
        </div>
      )}
      {data.isStaleFeed && (
        <div className="stale-box">
          <b>This feed hasn't updated recently.</b> The price shown may not reflect current market conditions.
          Treat any comparisons against it with caution.
        </div>
      )}

      <div className="two-col" style={{ marginTop: 22 }}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 16, marginBottom: 14 }}>Price, recent session</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: "#e2e0d4" }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={64} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(0)} />
                <Tooltip formatter={(v) => formatINR(v)} labelFormatter={(l) => `Time: ${l}`} />
                <Line type="monotone" dataKey="price" stroke="#1f4b3f" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <div className="k">Market today</div>
              <div className="v">{data.marketTodayPct >= 0 ? "+" : ""}{data.marketTodayPct}%</div>
            </div>
            <div className="stat">
              <div className="k">{data.sector} sector today</div>
              <div className="v">{data.sectorTodayPct >= 0 ? "+" : ""}{data.sectorTodayPct}%</div>
            </div>
            {verdict?.evidence?.volumeRatio !== undefined && (
              <>
                <div className="stat">
                  <div className="k">Current volume</div>
                  <div className="v">{data.currentVolume.toLocaleString("en-IN")}</div>
                </div>
                <div className="stat">
                  <div className="k">Volume vs. recent average</div>
                  <div className="v">{verdict.evidence.volumeRatio}x</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h3 style={{ fontSize: 16 }}>Why this matters</h3>
            {verdict && <LevelBadge level={verdict.level} />}
          </div>

          {!data.onWatchlist && (
            <p className="page-sub" style={{ marginBottom: 14 }}>
              Add this to your watchlist to start tracking what changes since you last checked.
            </p>
          )}

          {verdict ? (
            <ul className="reasons-list">
              {verdict.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="page-sub">Not currently on your watchlist — no comparison history yet.</p>
          )}

          <div className="card-actions" style={{ marginTop: 18 }}>
            <button className="btn btn-sm btn-primary" onClick={handleWatchToggle} disabled={busy}>
              {busy ? "…" : data.onWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            </button>
            {data.onWatchlist && (
              <button className="btn btn-sm" onClick={handleAck} disabled={busy}>
                Mark as reviewed
              </button>
            )}
          </div>

          <p className="field-hint" style={{ marginTop: 16 }}>
            Vantage never issues buy/sell recommendations — this is evidence about what changed, not investment advice.
          </p>
        </div>
      </div>

      {verdict && (
        <div className="card card-pad" style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>How we got here</h3>
          <p className="page-sub" style={{ marginBottom: 8 }}>
            The reasoning pipeline behind the verdict above — every value is checked in order, and steps
            highlighted in green are what actually pushed the result.
          </p>
          <EvidencePipeline verdict={verdict} />
        </div>
      )}
    </div>
  );
}
