import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth, RequireAdmin, RedirectIfAuthed } from "./components/Guards";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Watchlist from "./pages/Watchlist";
import ManageStocks from "./pages/ManageStocks";
import StockDetail from "./pages/StockDetail";
import Profile from "./pages/Profile";
import About from "./pages/About";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthed>
              <Signup />
            </RedirectIfAuthed>
          }
        />

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/watchlist"
          element={
            <RequireAuth>
              <Watchlist />
            </RequireAuth>
          }
        />
        <Route
          path="/watchlist/manage"
          element={
            <RequireAuth>
              <ManageStocks />
            </RequireAuth>
          }
        />
        <Route
          path="/stocks/:symbol"
          element={
            <RequireAuth>
              <StockDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<div className="page state-block"><h3>Page not found</h3></div>} />
      </Routes>
    </Layout>
  );
}
