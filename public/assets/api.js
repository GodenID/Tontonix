const TOKEN_KEY = "movy:token";
const LANG_KEY = "movy:lang";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getLang() {
  return localStorage.getItem(LANG_KEY) || "en";
}
export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { accept: "application/json" };
  if (body) headers["content-type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const withLang = (path) => {
  const lang = getLang();
  if (!lang || lang === "en") return path;
  return path + (path.includes("?") ? "&" : "?") + `lang=${encodeURIComponent(lang === "id" ? "id-ID" : lang)}`;
};

export const api = {
  home: () => request(withLang("/v1/home")),
  browse: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(withLang(`/v1/browse?${q}`));
  },
  search: (q, page = 1) => request(withLang(`/v1/search?q=${encodeURIComponent(q)}&page=${page}`)),
  movie: (id) => request(withLang(`/v1/movie/${id}`)),
  tv: (id) => request(withLang(`/v1/tv/${id}`)),
  season: (id, n) => request(withLang(`/v1/tv/${id}/season/${n}`)),
  providers: () => request("/v1/providers"),
  sources: (params) => request(`/v1/sources?${new URLSearchParams(params)}`),
  sourcesAll: (params) => request(`/v1/sources/all?${new URLSearchParams(params)}`),
  subtitles: (params) => request(`/v1/subtitles?${new URLSearchParams(params)}`),
  votes: (tmdbId, mediaType) => request(`/v1/votes?tmdbId=${tmdbId}&mediaType=${mediaType}`),
  vote: (tmdbId, mediaType, direction) =>
    request("/v1/votes", { method: "POST", body: { tmdbId, mediaType, direction }, auth: true }),
  register: (body) => request("/v1/auth/register", { method: "POST", body }),
  login: (body) => request("/v1/auth/login", { method: "POST", body }),
  me: () => request("/v1/auth/me", { auth: true }),
  watchlist: () => request("/v1/watchlist", { auth: true }),
  toggleWatchlist: (item) => request("/v1/watchlist", { method: "POST", body: item, auth: true }),
  history: () => request("/v1/history", { auth: true }),
  recordHistory: (entry) => request("/v1/history", { method: "POST", body: entry, auth: true }),
  clearHistory: () => request("/v1/history", { method: "DELETE", auth: true }),
};
