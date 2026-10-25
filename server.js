"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const config = require("./src/config");
const api = require("./src/api");
const store = require("./src/store");
const auth = require("./src/auth");
const stream = require("./src/stream");
const tmdbApi = require("./src/tmdb");
const subtitlesApi = require("./src/subtitles");

const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

const imageCache = new Map();
const IMAGE_CACHE_MAX = 400;

/* ------------------------------ utilities ------------------------------- */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(text) });
  res.end(text);
}

async function readBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("invalid json"), { status: 400 });
  }
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/* ------------------------------ image proxy ----------------------------- */

const SIZE_OK = new Set(["original", "w185", "w300", "w342", "w500", "w780", "w1280"]);

async function proxyImage(req, res, pathname) {
  const match = /^\/img\/([a-z0-9]+)(\/.+?)\/q(\d+)\.webp$/i.exec(pathname);
  if (!match) return sendText(res, 404, "not found");
  const [, size, file, quality] = match;
  if (!SIZE_OK.has(size)) return sendText(res, 400, "bad size");
  if (!/^\/(?:[A-Za-z0-9._-]+)$/.test(file)) return sendText(res, 400, "bad path");

  const target = `${config.tmdbImageBase}/${size}${file}`;
  const cached = imageCache.get(target);
  if (cached && cached.expires > Date.now()) {
    res.writeHead(200, {
      "content-type": cached.type,
      "content-length": cached.body.length,
      "cache-control": "public, max-age=86400",
      "x-image-quality": quality,
    });
    return res.end(cached.body);
  }

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) return sendText(res, upstream.status, "image unavailable");
    const body = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get("content-type") || "image/jpeg";
    if (imageCache.size > IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(target, { body, type, expires: Date.now() + 86400000 });
    res.writeHead(200, {
      "content-type": type,
      "content-length": body.length,
      "cache-control": "public, max-age=86400",
      "x-image-quality": quality,
    });
    res.end(body);
  } catch (err) {
    sendText(res, 502, `image proxy failed: ${err.message}`);
  }
}

/* --------------------------------- flags -------------------------------- */

const FLAGS = {
  us: "🇺🇸", de: "🇩🇪", fr: "🇫🇷", in: "🇮🇳", mx: "🇲🇽",
};

/* ----------------------------- stream proxy ----------------------------- */

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (host === "[::1]" || host.startsWith("[fc") || host.startsWith("[fd")) return true;
  return false;
}

function wrapStreamUrl(target) {
  return `/stream?u=${encodeURIComponent(target)}`;
}

function rewritePlaylist(text, baseUrl) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          try {
            return `URI="${wrapStreamUrl(new URL(uri, baseUrl).toString())}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        return wrapStreamUrl(new URL(trimmed, baseUrl).toString());
      } catch {
        return line;
      }
    })
    .join("\n");
}

async function proxyStream(req, res, url) {
  const raw = url.searchParams.get("u");
  if (!raw) return sendText(res, 400, "missing stream url");

  let target;
  try {
    target = new URL(raw);
  } catch {
    return sendText(res, 400, "bad stream url");
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return sendText(res, 400, "stream url not allowed");
  }

  const headers = {
    referer: config.streamReferer,
    origin: new URL(config.streamReferer).origin,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    accept: "*/*",
  };
  if (req.headers.range) headers.range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(target.toString(), { headers, redirect: "follow", signal: AbortSignal.timeout(25000) });
  } catch (err) {
    return sendText(res, 502, `stream fetch failed: ${err.message}`);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return sendText(res, upstream.status, `upstream ${upstream.status}`);
  }

  const type = upstream.headers.get("content-type") || "";
  const isPlaylist = /mpegurl/i.test(type) || /\.m3u8($|\?)/i.test(target.pathname + target.search);

  if (isPlaylist) {
    const text = await upstream.text();
    const body = Buffer.from(rewritePlaylist(text, upstream.url || target.toString()), "utf8");
    res.writeHead(200, {
      "content-type": "application/vnd.apple.mpegurl",
      "content-length": body.length,
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    return res.end(body);
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const outHeaders = {
    "content-type": type || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
  if (upstream.headers.get("content-range")) outHeaders["content-range"] = upstream.headers.get("content-range");
  if (upstream.headers.get("accept-ranges")) outHeaders["accept-ranges"] = upstream.headers.get("accept-ranges");
  res.writeHead(upstream.status === 206 ? 206 : 200, outHeaders);
  res.end(body);
}

/* ---------------------------- subtitle layer ---------------------------- */

const subtitleFileCache = new Map();
const SUBTITLE_FILE_CACHE_MAX = 160;
const SUBTITLE_FILE_TTL_MS = 60 * 60 * 1000;

function sendVtt(res, body) {
  res.writeHead(200, {
    "content-type": "text/vtt; charset=utf-8",
    "content-length": body.length,
    "cache-control": "public, max-age=3600",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function proxySubtitle(req, res, url) {
  const raw = url.searchParams.get("u");
  if (!raw) return sendText(res, 400, "missing subtitle url");

  let target;
  try {
    target = new URL(raw);
  } catch {
    return sendText(res, 400, "bad subtitle url");
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return sendText(res, 400, "subtitle url not allowed");
  }

  const format = url.searchParams.get("fmt") || "";
  const encoding = url.searchParams.get("enc") || "";
  const cacheKey = `${target.toString()}|${format}|${encoding}`;
  const cached = subtitleFileCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return sendVtt(res, cached.body);

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "*/*",
        referer: config.streamReferer,
        origin: new URL(config.streamReferer).origin,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return sendText(res, 502, `subtitle fetch failed: ${err.message}`);
  }
  if (!upstream.ok) return sendText(res, upstream.status, "subtitle unavailable");

  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) return sendText(res, 413, "subtitle too large");

  const vtt = subtitlesApi.toVtt(buffer, { format, encoding });
  if (!vtt) return sendText(res, 415, "unsupported subtitle format");

  const body = Buffer.from(vtt, "utf8");
  if (subtitleFileCache.size >= SUBTITLE_FILE_CACHE_MAX) subtitleFileCache.delete(subtitleFileCache.keys().next().value);
  subtitleFileCache.set(cacheKey, { body, expires: Date.now() + SUBTITLE_FILE_TTL_MS });
  return sendVtt(res, body);
}

/* --------------------------------- routes ------------------------------- */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  const lang = q.lang || undefined;
  const method = req.method || "GET";

  if (p === "/v1/home" && method === "GET") {
    return sendJson(res, 200, await api.homeFeed({ language: lang }));
  }

  if (p === "/v1/browse" && method === "GET") {
    return sendJson(res, 200, await api.browse({ ...q, language: lang }));
  }

  if (p === "/v1/search" && method === "GET") {
    return sendJson(res, 200, await api.search({ ...q, language: lang }));
  }

  if (p === "/v1/providers" && method === "GET") {
    return sendJson(res, 200, { providers: stream.PROVIDERS.map(({ id, name, flag, note }) => ({ id, name, flag, note })) });
  }

  if (p === "/v1/votes" && method === "GET") {
    return sendJson(res, 200, store.getVotes(Number(q.tmdbId), q.mediaType, api.currentUser(req)?.id));
  }

  if (p === "/v1/votes" && method === "POST") {
    const user = api.requireUser(req);
    const body = await readBody(req);
    if (!["up", "down"].includes(body.direction)) throw Object.assign(new Error("direction must be up or down"), { status: 400 });
    return sendJson(res, 200, store.castVote(Number(body.tmdbId), body.mediaType, user.id, body.direction));
  }

  if (p === "/v1/sources" && method === "GET") {
    return sendJson(res, 200, await api.sourcesFor(q));
  }

  if (p === "/v1/sources/all" && method === "GET") {
    return sendJson(res, 200, await api.sourcesAll(q));
  }

  if (p === "/v1/subtitles" && method === "GET") {
    return sendJson(res, 200, await subtitlesApi.search(q));
  }

  if (p === "/v1/subtitles/convert" && method === "POST") {
    const body = await readBody(req, 4 * 1024 * 1024);
    const text = String(body.text || "");
    if (!text.trim()) throw Object.assign(new Error("text required"), { status: 400 });
    const vtt = subtitlesApi.toVtt(Buffer.from(text, "utf8"), {
      format: String(body.format || ""),
      encoding: String(body.encoding || ""),
    });
    if (!vtt) return sendJson(res, 415, { error: "unsupported subtitle format" });
    return sendJson(res, 200, { vtt });
  }

  if (p === "/v1/trailer" && method === "GET") {
    if (!q.imdbId) throw Object.assign(new Error("imdbId required"), { status: 400 });
    try {
      const upstream = await fetch(`${config.trailerApi}/getOldestTrailer?id=${encodeURIComponent(q.imdbId)}`, {
        headers: { referer: config.streamReferer, origin: new URL(config.streamApi).origin },
        signal: AbortSignal.timeout(10000),
      });
      return sendJson(res, upstream.status, await upstream.json());
    } catch (err) {
      return sendJson(res, 502, { error: "trailer unavailable", message: err.message });
    }
  }

  const seasonMatch = /^\/v1\/tv\/(\d+)\/season\/(\d+)$/.exec(p);
  if (seasonMatch && method === "GET") {
    return sendJson(res, 200, await tmdbApi.seasonDetail(seasonMatch[1], seasonMatch[2], { language: lang }));
  }

  const detailMatch = /^\/v1\/(movie|tv)\/(\d+)$/.exec(p);
  if (detailMatch && method === "GET") {
    return sendJson(res, 200, await api.detail(detailMatch[1], detailMatch[2], { language: lang }));
  }

  if (p === "/v1/auth/register" && method === "POST") {
    const body = await readBody(req);
    const user = store.createUser(body);
    return sendJson(res, 201, { token: auth.issue(user), user });
  }

  if (p === "/v1/auth/login" && method === "POST") {
    const body = await readBody(req);
    const user = store.findUserByEmail(body.email);
    if (!user || !store.verifyPassword(String(body.password || ""), user)) {
      throw Object.assign(new Error("invalid credentials"), { status: 401 });
    }
    return sendJson(res, 200, { token: auth.issue(user), user: store.publicUser(user) });
  }

  if (p === "/v1/auth/me" && method === "GET") {
    const user = api.currentUser(req);
    if (!user) return sendJson(res, 200, { user: null });
    return sendJson(res, 200, { user: store.publicUser(user) });
  }

  if (p === "/v1/watchlist" && method === "GET") {
    const user = api.requireUser(req);
    return sendJson(res, 200, { items: store.watchlist(user.id) });
  }

  if (p === "/v1/watchlist" && method === "POST") {
    const user = api.requireUser(req);
    const body = await readBody(req);
    if (!body.id || !body.mediaType) throw Object.assign(new Error("id and mediaType required"), { status: 400 });
    return sendJson(res, 200, store.toggleWatchlist(user.id, body));
  }

  if (p === "/v1/history" && method === "GET") {
    const user = api.requireUser(req);
    return sendJson(res, 200, { items: store.history(user.id) });
  }

  if (p === "/v1/history" && method === "POST") {
    const user = api.requireUser(req);
    const body = await readBody(req);
    if (!body.tmdbId || !body.mediaType) throw Object.assign(new Error("tmdbId and mediaType required"), { status: 400 });
    return sendJson(res, 200, { items: store.recordHistory(user.id, body) });
  }

  if (p === "/v1/history" && method === "DELETE") {
    const user = api.requireUser(req);
    return sendJson(res, 200, { items: store.clearHistory(user.id) });
  }

  return sendJson(res, 404, { error: "unknown endpoint", path: p });
}

/* -------------------------------- static -------------------------------- */

function serveStatic(res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexCandidate = path.join(filePath, "index.html");
    if (fs.existsSync(indexCandidate)) filePath = indexCandidate;
    else return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-cache" });
  res.end(body);
  return true;
}

/* -------------------------------- server -------------------------------- */

const server = http.createServer(async (req, res) => {
  req.cookies = parseCookies(req.headers.cookie);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  if (config.logRequests) console.log(`[req] ${req.method} ${pathname}`);

  try {
    if (pathname === "/stream") return await proxyStream(req, res, url);

    if (pathname === "/sub") return await proxySubtitle(req, res, url);

    if (pathname.startsWith("/img/")) return await proxyImage(req, res, pathname);

    if (pathname.startsWith("/flags/") && pathname.endsWith(".svg")) {
      const code = pathname.slice(7, -4);
      const label = FLAGS[code] || "🏳️";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><text y="15" font-size="16">${label}</text></svg>`;
      return sendText(res, 200, svg, "image/svg+xml");
    }

    if (pathname.startsWith("/v1/") || pathname === "/v1") return await handleApi(req, res, url);

    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method not allowed" });

    if (serveStatic(res, pathname)) return;

    // SPA routes -> index.html
    if (!pathname.includes(".")) {
      const index = path.join(PUBLIC_DIR, "index.html");
      const body = fs.readFileSync(index);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": body.length });
      return res.end(body);
    }

    return sendText(res, 404, "not found");
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[error] ${req.method} ${pathname}:`, err.message);
    if (!res.headersSent) sendJson(res, status, { error: err.message || "internal error" });
    else res.end();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Tontonix listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  store.flush().finally(() => server.close(() => process.exit(0)));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
