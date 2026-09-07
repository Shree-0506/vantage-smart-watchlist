export default function About() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Our approach</h1>
          <div className="page-sub">Why Vantage exists, and how it decides what deserves your attention.</div>
        </div>
      </div>

      <div className="prose">
        <h2>The problem: watchlists make you do the work</h2>
        <p>
          Most watchlists are a wall of tickers and numbers. Every time you open one, you're left doing the same
          manual work: scanning fifteen rows, remembering roughly where each price was last time, and guessing
          whether a move is worth caring about. The watchlist stores data. It doesn't do anything with it.
        </p>
        <p>
          That's backwards. A tool that requires you to monitor it constantly isn't saving you effort — it's just
          moving the effort from "finding stocks" to "interpreting a spreadsheet." Vantage starts from a different
          premise.
        </p>

        <h2>The "what did I miss?" philosophy</h2>
        <p>
          Every time you open Vantage, we already know what you saw last time — we stored a snapshot of price and
          volume at the moment you last checked each stock. When you come back, we don't show you the market. We
          show you the <i>difference</i> between the market now and the market you already know about, ranked by
          how much it deserves your attention.
        </p>
        <p>
          If nothing meaningful happened, we say so directly — "Nothing significant" is a first-class outcome, not
          an empty state to apologize for. Confidently telling you when you can stop looking is as valuable as
          telling you when you can't.
        </p>

        <h2>How we decide what's "meaningful"</h2>
        <p>
          A fixed rule like "alert on any 3% move" fails in both directions: it's noisy for volatile stocks and
          numb for stable ones, and it can't tell the difference between a stock moving on its own and a stock
          moving because the entire market moved. Instead, every change is evaluated on several axes at once:
        </p>

        <div className="principle-grid">
          <div className="principle">
            <h4>Volatility-adjusted size</h4>
            <p>We compare the move to that specific stock's own recent volatility, not a flat percentage.</p>
          </div>
          <div className="principle">
            <h4>Market &amp; sector context</h4>
            <p>A move that just tracks a market-wide rally scores lower than the same move happening in isolation.</p>
          </div>
          <div className="principle">
            <h4>Volume anomalies</h4>
            <p>Trading activity well above the recent average is treated as its own signal, even with modest price moves.</p>
          </div>
        </div>

        <p>
          These combine into a 0–100 score, which maps to HIGH / MEDIUM / LOW / Nothing significant. Every score
          comes with the evidence behind it in plain language — we never show a verdict without the numbers that
          produced it.
        </p>

        <h2>Reliability decisions</h2>
        <p>
          Market data isn't always clean, and pretending otherwise would make the product untrustworthy. Vantage
          explicitly detects and surfaces two failure modes rather than hiding them:
        </p>
        <ul>
          <li><b>Stale data</b> — if a feed hasn't updated in a while, we say so and reduce our confidence in the
            verdict, instead of quietly comparing against a frozen price as if it were current.</li>
          <li><b>Conflicting data</b> — if two sources disagree on a price, we show both values rather than
            silently averaging or picking one. You decide how to weigh it.</li>
        </ul>
        <p>Every page also shows a freshness timestamp, so you always know exactly how current what you're looking at is.</p>

        <h2>What we deliberately don't do</h2>
        <p>
          Vantage never recommends buying or selling anything. It surfaces evidence — price action, volatility
          context, volume, market/sector comparison — and lets you draw your own conclusions. This isn't just a
          disclaimer; it's a design constraint that shaped what the product does and doesn't build.
        </p>

        <h2>Engineering trade-offs</h2>
        <p>
          Market data here is deterministically simulated rather than pulled from a live feed, seeded by symbol and
          scenario so the same scenario always reproduces the same numbers — this makes the product demoable and
          testable without depending on market hours or a paid data provider. The admin panel lets specific
          scenarios (a genuine outlier move, a volume spike, a market-wide rally, stale data, conflicting data) be
          triggered on demand, which is how the "meaningful change" logic can be verified end-to-end rather than
          only in unit tests.
        </p>
      </div>
    </div>
  );
}
