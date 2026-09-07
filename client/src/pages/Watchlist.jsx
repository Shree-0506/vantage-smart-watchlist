import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { LoadingState, EmptyState, ErrorState, formatINR } from "../components/Common";

export default function Watchlist() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busySymbol, setBusySymbol] = useState(null);

  async function load() {
    setError("");
    try {
      const data = await api.getWatchlist();
      setItems(data.items);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRemove(symbol) {
    setBusySymbol(symbol);
    try {
      await api.removeFromWatchlist(symbol);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusySymbol(null);
    }
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (items === null) return <div className="page"><LoadingState label="Loading your watchlist…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My Watchlist</h1>
          <div className="page-sub">{items.length} stock{items.length !== 1 ? "s" : ""} tracked</div>
        </div>
        <Link to="/watchlist/manage" className="btn btn-primary">
          + Add stocks
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No stocks yet"
          body="Search and add a few stocks to start building your watchlist."
          action={
            <Link to="/watchlist/manage" className="btn btn-primary">
              Add your first stock
            </Link>
          }
        />
      ) : (
        <div className="watch-grid">
          {items.map((it) => (
            <div className="watch-row" key={it.symbol}>
              <div className="watch-row-left">
                <div className="symbol-badge">{it.symbol.slice(0, 3)}</div>
                <div className="watch-meta">
                  <Link to={`/stocks/${it.symbol}`} className="sym">
                    {it.symbol}
                  </Link>
                  <div className="name">
                    {it.name} · {it.sector}
                    {it.isStaleFeed && " · Stale feed"}
                    {it.hasConflict && " · Conflicting data"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className="price-now num">{formatINR(it.price)}</div>
                <Link to={`/stocks/${it.symbol}`} className="btn btn-sm">
                  Detail
                </Link>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleRemove(it.symbol)}
                  disabled={busySymbol === it.symbol}
                >
                  {busySymbol === it.symbol ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
