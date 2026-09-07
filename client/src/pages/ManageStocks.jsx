import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { LoadingState, ErrorState, formatINR } from "../components/Common";

export default function ManageStocks() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [busySymbol, setBusySymbol] = useState(null);

  async function load(query) {
    setError("");
    try {
      const data = await api.searchStocks(query);
      setResults(data.results);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(q), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function toggle(symbol, onWatchlist) {
    setBusySymbol(symbol);
    setError("");
    try {
      if (onWatchlist) await api.removeFromWatchlist(symbol);
      else await api.addToWatchlist(symbol);
      await load(q);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusySymbol(null);
    }
  }

  return (
    <div className="page page-medium">
      <div className="page-header">
        <div>
          <h1>Add &amp; manage stocks</h1>
          <div className="page-sub">Search by symbol, company name, or sector.</div>
        </div>
        <Link to="/watchlist" className="btn">
          View my watchlist
        </Link>
      </div>

      <div className="search-bar">
        <input
          placeholder="Search e.g. RELIANCE, banking, Infosys…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      {error && <div className="inline-error">{error}</div>}

      {results === null ? (
        <LoadingState label="Loading stocks…" />
      ) : results.length === 0 ? (
        <ErrorState message={`No stocks match "${q}".`} />
      ) : (
        <div className="watch-grid">
          {results.map((s) => (
            <div className="watch-row" key={s.symbol}>
              <div className="watch-row-left">
                <div className="symbol-badge">{s.symbol.slice(0, 3)}</div>
                <div className="watch-meta">
                  <span className="sym">{s.symbol}</span>
                  <div className="name">
                    {s.name} · <span className="sector-chip">{s.sector}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className="price-now num">{formatINR(s.price)}</div>
                <button
                  className={`btn btn-sm ${s.onWatchlist ? "btn-danger" : "btn-primary"}`}
                  onClick={() => toggle(s.symbol, s.onWatchlist)}
                  disabled={busySymbol === s.symbol}
                >
                  {busySymbol === s.symbol ? "…" : s.onWatchlist ? "Remove" : "Add"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
