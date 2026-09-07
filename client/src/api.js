const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "vantage_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  signup: (payload) => request("/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),

  getFeed: () => request("/feed"),

  getWatchlist: () => request("/watchlist"),
  addToWatchlist: (symbol) => request("/watchlist", { method: "POST", body: { symbol } }),
  removeFromWatchlist: (symbol) => request(`/watchlist/${symbol}`, { method: "DELETE" }),
  ackWatchlistItem: (symbol) => request(`/watchlist/${symbol}/ack`, { method: "POST" }),

  searchStocks: (q) => request(`/stocks?q=${encodeURIComponent(q || "")}`),
  getStock: (symbol) => request(`/stocks/${symbol}`),

  getProfile: () => request("/profile"),
  updateProfile: (payload) => request("/profile", { method: "PATCH", body: payload }),
  changePassword: (payload) => request("/profile/change-password", { method: "POST", body: payload }),

  adminState: () => request("/admin/state"),
  adminSetScenario: (scenario) => request("/admin/scenario", { method: "POST", body: { scenario } }),
  adminAdvance: (steps) => request("/admin/advance", { method: "POST", body: { steps } }),
  adminReset: () => request("/admin/reset", { method: "POST" }),
};

export { ApiError };
