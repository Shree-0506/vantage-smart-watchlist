import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { LoadingState, EmptyState, ErrorState, LevelBadge, PriceDelta, EvidenceChips, formatINR, formatTimeAgo } from "../components/Common";

const LEVEL_COPY = {
  HIGH: "Needs your attention",
  MEDIUM: "Worth a look",
  LOW: "Minor, but flagged",
};

function AttentionCard({ item, onAck }) {
  const [busy, setBusy] = useState(false);

  async function handleAck() {
    setBusy(true);
    try {
      await onAck(item.symbol);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`attention-card level-${item.level}`}>
      <div className="attention-top">
        <div>
          <div className="attention-symbol-row">
            <Link to={`/stocks/${item.symbol}`} className="attention-symbol">
              {item.symbol}
            </Link>
            <LevelBadge level={item.level} />
          </div>
          <div className="attention-name">
            {item.name} · {item.sector}
          </div>
        </div>
        <div className="price-block">
          <div className="price-now">{formatINR(item.currentPrice)}</div>
          <PriceDelta pct={item.evidence?.pctChange} />
        </div>
      </div>

      <EvidenceChips evidence={item.evidence} stale={item.stale} conflicting={item.conflicting} />

      <ul className="reasons-list">
        {item.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <div className="card-actions">
        <Link to={`/stocks/${item.symbol}`} className="btn btn-sm">
          View detail
        </Link>
        {item.level !== "NONE" && (
          <button className="btn btn-sm btn-ghost" onClick={handleAck} disabled={busy}>
            {busy ? "Marking…" : "Mark as reviewed"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setError("");
    try {
      const data = await api.getFeed();
      setFeed(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAck(symbol) {
    await api.ackWatchlistItem(symbol);
    await load();
  }

  if (loading) return <div className="page"><LoadingState label="Comparing today's market against what you last saw…" /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;

  const significant = feed.items.filter((i) => i.level !== "NONE");
  const quiet = feed.items.filter((i) => i.level === "NONE");

  return (
    <div className="page">
      <div className="welcome-block">
        <div className="eyebrow">Welcome back, {user.name.split(" ")[0]}</div>
        <h1>Since your last check</h1>
        <div className="check-meta">
          {feed.previousCheckAt ? (
            <>You last checked {formatTimeAgo(feed.previousCheckAt)}. Market data as of {new Date(feed.marketAsOf).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.</>
          ) : (
            <>First visit — here's how your {feed.watchlistSize}-stock watchlist looks right now.</>
          )}
        </div>
      </div>

      {feed.items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          body="Add a few stocks and Vantage will start tracking what matters since you last looked."
          action={
            <Link to="/watchlist/manage" className="btn btn-primary">
              Add stocks
            </Link>
          }
        />
      ) : (
        <>
          <div className="summary-row">
            <div className="summary-pill high">
              <div className="count">{feed.counts.HIGH}</div>
              <div className="label">High attention</div>
            </div>
            <div className="summary-pill medium">
              <div className="count">{feed.counts.MEDIUM}</div>
              <div className="label">Medium attention</div>
            </div>
            <div className="summary-pill low">
              <div className="count">{feed.counts.LOW}</div>
              <div className="label">Low attention</div>
            </div>
            <div className="summary-pill">
              <div className="count">{feed.counts.NONE}</div>
              <div className="label">Nothing significant</div>
            </div>
          </div>

          {["HIGH", "MEDIUM", "LOW"].map((level) => {
            const items = significant.filter((i) => i.level === level);
            if (!items.length) return null;
            return (
              <div key={level}>
                <div className="section-title">{LEVEL_COPY[level]}</div>
                {items.map((item) => (
                  <AttentionCard key={item.symbol} item={item} onAck={handleAck} />
                ))}
              </div>
            );
          })}

          {quiet.length > 0 && (
            <div>
              <div className="section-title">Nothing significant</div>
              {quiet.map((item) => (
                <AttentionCard key={item.symbol} item={item} onAck={handleAck} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
