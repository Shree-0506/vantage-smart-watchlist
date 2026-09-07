import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Since You Last Checked" },
  { to: "/watchlist", label: "My Watchlist" },
  { to: "/watchlist/manage", label: "Add Stocks" },
  { to: "/about", label: "Our Approach" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to={user ? "/dashboard" : "/"} className="brand-mark">
            <span className="brand-mark-icon" />
            Vantage
          </NavLink>

          {user && (
            <nav className="nav-links">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                  end={item.to === "/watchlist"}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="nav-right">
            {user ? (
              <>
                <button
                  className="user-chip btn-ghost btn"
                  onClick={() => navigate("/profile")}
                  title="Profile & settings"
                >
                  <span className="avatar">{initials}</span>
                  {user.name.split(" ")[0]}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/about" className="btn btn-ghost btn-sm">
                  Our Approach
                </NavLink>
                <NavLink to="/login" className="btn btn-sm">
                  Log in
                </NavLink>
                <NavLink to="/signup" className="btn btn-primary btn-sm">
                  Sign up
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
      <footer className="site-footer">
        Vantage — built for Groww CODE 2026 · Simulated market data for demonstration purposes only. Not investment advice.
      </footer>
    </div>
  );
}
