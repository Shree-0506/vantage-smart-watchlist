import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div style={{ padding: "40px 0 10px" }}>
        <div className="eyebrow">Smart market watchlist</div>
        <h1 style={{ fontSize: 44, lineHeight: 1.15, maxWidth: 640 }}>
          A watchlist shouldn't make you monitor your stocks. It should monitor them for you.
        </h1>
        <p className="page-sub" style={{ fontSize: 16, maxWidth: 560, marginTop: 18 }}>
          Vantage remembers what you last saw, compares it to the market right now, and tells you — with evidence —
          what actually deserves your attention. Not a fixed +3% rule. Not a wall of tickers to scan yourself.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
          <Link to="/signup" className="btn btn-primary">
            Create an account
          </Link>
          <Link to="/login" className="btn">
            Log in
          </Link>
          <Link to="/about" className="btn btn-ghost">
            Our approach
          </Link>
        </div>
      </div>

      <div className="principle-grid" style={{ marginTop: 50 }}>
        <div className="principle">
          <h4>Since you last checked</h4>
          <p>Every visit starts with what changed since your last snapshot — not a re-scan of the whole market.</p>
        </div>
        <div className="principle">
          <h4>Meaningful, not loud</h4>
          <p>Moves are judged against a stock's own volatility and the broader market, so noise gets filtered out.</p>
        </div>
        <div className="principle">
          <h4>Evidence, not verdicts</h4>
          <p>Every alert shows the numbers behind it. No black-box scores, and never a buy/sell call.</p>
        </div>
      </div>
    </div>
  );
}
