"use strict";

const fs = require("node:fs");
const path = require("node:path");
const api = require("./api");
const tmdbApi = require("./tmdb");

const TEMPLATE = path.join(__dirname, "..", "public", "index.html");
const META_TTL_MS = 15 * 60 * 1000;
const META_MISS_TTL_MS = 60 * 1000;
const SITEMAP_TTL_MS = 60 * 60 * 1000;
const SITEMAP_MAX = 400;

const pageCache = new Map();
const templateCache = { mtimeMs: 0, html: "" };
let sitemapCache = { at: 0, origin: "", body: "" };

const SITE = "Tontonix";
const DEFAULT_DESC =
  "Watch free movies and TV shows online in HD on Tontonix. Stream the latest films, series and anime for free, no signup required.";

/* ------------------------------- utilities ------------------------------- */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

function clip(text, max = 200) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentence > max * 0.55) return `${slice.slice(0, sentence + 1).trimEnd()}`;
  const cut = slice.lastIndexOf(" ");
  const body = (cut > max * 0.6 ? slice.slice(0, cut) : slice).replace(/[\s:;,.\-–—]+$/, "");
  return `${body}…`;
}

function ogImage(origin, detail) {
  const raw = String(detail.background || detail.poster || "");
  if (!raw) return "";
  return absolute(origin, raw.replace(/\/img\/w(185|300|342)\//, "/img/w780/"));
}

function absolute(origin, url) {
  if (!url) return "";
  try {
    return new URL(url, origin).toString();
  } catch {
    return "";
  }
}

function originOf(req) {
  const protoHeader = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = protoHeader || (req.socket && req.socket.encrypted ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function template() {
  try {
    const stat = fs.statSync(TEMPLATE);
    if (stat.mtimeMs !== templateCache.mtimeMs || !templateCache.html) {
      templateCache.html = fs.readFileSync(TEMPLATE, "utf8");
      templateCache.mtimeMs = stat.mtimeMs;
    }
    return templateCache.html;
  } catch {
    return "";
  }
}

/* -------------------------------- metadata ------------------------------- */

function headBlock({ title, description, canonical, image, ogType = "website", robots = "index,follow", jsonLd = null }) {
  const lines = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
  ];
  if (image) {
    lines.push(
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    );
  } else {
    lines.push(`<meta name="twitter:card" content="summary" />`);
  }
  lines.push(
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  );
  if (jsonLd) {
    const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    lines.push(`<script type="application/ld+json">${json}</script>`);
  }
  return lines.join("\n    ");
}

function inject(html, head) {
  if (!html) return "";
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");
  return stripped.replace(/<\/head>/i, `  ${head}\n  </head>`);
}

function titleFor(detail) {
  const year = detail.year ? ` (${detail.year})` : "";
  if (detail.mediaType === "tv") return `Watch ${detail.title}${year} - Seasons & Episodes | ${SITE}`;
  return `Watch ${detail.title}${year} Free Online | ${SITE}`;
}

function jsonLdFor(detail, canonical, image) {
  const base = {
    "@context": "https://schema.org",
    "@type": detail.mediaType === "tv" ? "TVSeries" : "Movie",
    name: detail.title,
    url: canonical,
    description: clip(detail.desc, 500),
  };
  if (detail.titleOriginal && detail.titleOriginal !== detail.title) base.alternateName = detail.titleOriginal;
  if (image) base.image = image;
  if (detail.release_date) base.datePublished = detail.release_date;
  if (detail.categories?.length) base.genre = detail.categories;
  if (detail.score > 0 && detail.scoreCount > 0) {
    base.aggregateRating = { "@type": "AggregateRating", ratingValue: detail.score, ratingCount: detail.scoreCount, bestRating: 10 };
  }
  if (detail.actors?.length) {
    base.actor = detail.actors.slice(0, 8).map((actor) => ({ "@type": "Person", name: actor.name }));
  }
  if (detail.mediaType === "movie") {
    if (detail.directors?.length) base.director = detail.directors.map((name) => ({ "@type": "Person", name }));
    if (detail.duration) base.duration = `PT${Math.round(detail.duration)}M`;
  } else {
    if (detail.creators?.length) base.creator = detail.creators.map((name) => ({ "@type": "Person", name }));
    if (detail.episodeInfo?.seasons) base.numberOfSeasons = detail.episodeInfo.seasons;
    if (detail.episodeInfo?.episodes) base.numberOfEpisodes = detail.episodeInfo.episodes;
  }
  return base;
}

async function titleMeta(type, id, { watch, params, origin }) {
  const detail = await api.detail(type, id);
  const canonicalPath = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const canonical = absolute(origin, canonicalPath);
  const image = ogImage(origin, detail);

  let episode = null;
  let seasonNumber = 0;
  let episodeNumber = 0;
  if (watch && type === "tv") {
    seasonNumber = Math.max(1, Number(params.get("season") || 1) || 1);
    episodeNumber = Math.max(1, Number(params.get("episode") || 1) || 1);
    try {
      const season = await tmdbApi.seasonDetail(id, seasonNumber);
      episode = (season.episodes || []).find((row) => row.episode_number === episodeNumber) || null;
    } catch {
      episode = null;
    }
  }

  const suffix = episode ? ` - S${seasonNumber}E${episodeNumber}${episode.name ? ` ${episode.name}` : ""}` : "";
  const title = watch && episode ? `Watch ${detail.title}${suffix} | ${SITE}` : titleFor(detail);
  const description = clip(episode?.overview || detail.desc || DEFAULT_DESC, 200);
  const head = headBlock({
    title,
    description,
    canonical,
    image,
    ogType: type === "tv" ? "video.tv_show" : "video.movie",
    robots: watch ? "noindex,follow" : "index,follow,max-image-preview:large",
    jsonLd: watch ? null : jsonLdFor(detail, canonical, image),
  });
  return { head, ok: true };
}

const BROWSE_PAGES = {
  movie: { label: "Movies", desc: "Browse and stream movies by genre, year and rating. Free HD and 4K films, no signup required." },
  tv: { label: "TV Shows", desc: "Browse TV series and episodes by genre, year and rating. Stream current and classic shows free." },
  anime: { label: "Anime", desc: "Browse Japanese animation, subbed and dubbed, sorted by popularity, rating and release year." },
};

function browseMeta(type, origin) {
  const page = BROWSE_PAGES[type] || BROWSE_PAGES.movie;
  const canonical = absolute(origin, `/browse/${type}`);
  const title = `${page.label} - Watch Free Online | ${SITE}`;
  const head = headBlock({
    title,
    description: page.desc,
    canonical,
    image: absolute(origin, "/assets/logo.png"),
    robots: "index,follow",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${page.label} on ${SITE}`,
      description: page.desc,
      url: canonical,
    },
  });
  return { head, ok: true };
}

function genericMeta(pathname, origin) {
  const canonical = absolute(origin, pathname);
  const title = `${SITE} - Watch Free Movies & TV Shows Online`;
  const head = headBlock({
    title,
    description: DEFAULT_DESC,
    canonical,
    image: absolute(origin, "/assets/logo.png"),
    robots: "index,follow",
  });
  return { head, ok: true };
}

function privateMeta(pathname, origin, label) {
  const canonical = absolute(origin, pathname);
  const head = headBlock({
    title: `${label} | ${SITE}`,
    description: DEFAULT_DESC,
    canonical,
    image: absolute(origin, "/assets/logo.png"),
    robots: "noindex,follow",
  });
  return { head, ok: true };
}

async function buildMeta(pathname, search, origin) {
  const params = new URLSearchParams(search || "");
  const watchMatch = /^\/watch\/(movie|tv)\/(\d+)\/?$/.exec(pathname);
  if (watchMatch) return titleMeta(watchMatch[1], watchMatch[2], { watch: true, params, origin });

  const detailMatch = /^\/(movie|tv)\/(\d+)\/?$/.exec(pathname);
  if (detailMatch) return titleMeta(detailMatch[1], detailMatch[2], { watch: false, params, origin });

  const browseMatch = /^\/browse\/(movie|tv|anime)\/?$/.exec(pathname);
  if (browseMatch) return browseMeta(browseMatch[1], origin);

  if (pathname === "/" || pathname === "") return genericMeta("/", origin);
  if (pathname === "/search") return privateMeta("/search", origin, "Search");
  if (pathname === "/watchlist") return privateMeta("/watchlist", origin, "Watchlist");
  if (pathname === "/history") return privateMeta("/history", origin, "History");
  if (pathname === "/account") return privateMeta("/account", origin, "Account");
  if (pathname === "/login") return privateMeta("/login", origin, "Sign in");
  if (pathname === "/signup") return privateMeta("/signup", origin, "Sign up");
  if (pathname.startsWith("/legal/")) return privateMeta(pathname, origin, "Legal");
  if (pathname === "/help") return privateMeta("/help", origin, "Help");

  return {
    head: headBlock({ title: `${SITE} - Page not found`, description: DEFAULT_DESC, canonical: absolute(origin, pathname), robots: "noindex,follow" }),
    ok: true,
    status: 404,
  };
}

async function pageMeta(pathname, search, origin) {
  const key = `${pathname}?${search || ""}`;
  const hit = pageCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value;
  try {
    value = await buildMeta(pathname, search, origin);
  } catch {
    value = {
      head: headBlock({ title: `${SITE} - Watch Free Movies & TV Shows Online`, description: DEFAULT_DESC, canonical: absolute(origin, pathname), robots: "noindex,follow" }),
      ok: false,
    };
  }
  pageCache.set(key, { value, expires: Date.now() + (value.ok ? META_TTL_MS : META_MISS_TTL_MS) });
  if (pageCache.size > 600) pageCache.delete(pageCache.keys().next().value);
  return value;
}

async function renderHtml({ pathname, search = "", origin }) {
  const html = template();
  if (!html) return { html: "", status: 200 };
  const page = await pageMeta(pathname, search, origin);
  return { html: inject(html, page.head), status: page.status || 200 };
}

/* -------------------------------- robots -------------------------------- */

function robots(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /v1/",
    "Disallow: /stream",
    "Disallow: /sub",
    "Disallow: /img/",
    "Disallow: /watch/",
    "Disallow: /search",
    "Disallow: /account",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /watchlist",
    "Disallow: /history",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/* -------------------------------- sitemap ------------------------------- */

async function sitemap(origin) {
  if (sitemapCache.origin === origin && Date.now() - sitemapCache.at < SITEMAP_TTL_MS && sitemapCache.body) {
    return sitemapCache.body;
  }

  const seen = new Set();
  const items = [];
  const push = (type, id) => {
    if (!id) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ type, id });
  };

  try {
    const [week, popularMovie, popularTv, topMovie, topTv] = await Promise.all([
      tmdbApi.tmdb("/trending/all/week", { page: 1 }),
      tmdbApi.tmdb("/movie/popular", { page: 1 }),
      tmdbApi.tmdb("/tv/popular", { page: 1 }),
      tmdbApi.tmdb("/movie/top_rated", { page: 1 }),
      tmdbApi.tmdb("/tv/top_rated", { page: 1 }),
    ]);
    for (const row of week.results || []) {
      const type = row.media_type || (row.first_air_date ? "tv" : "movie");
      if (type === "movie" || type === "tv") push(type, row.id);
    }
    for (const row of popularMovie.results || []) push("movie", row.id);
    for (const row of popularTv.results || []) push("tv", row.id);
    for (const row of topMovie.results || []) push("movie", row.id);
    for (const row of topTv.results || []) push("tv", row.id);
  } catch {
    /* fall back to the static routes only */
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/browse/movie`, priority: "0.9" },
    { loc: `${origin}/browse/tv`, priority: "0.9" },
    { loc: `${origin}/browse/anime`, priority: "0.8" },
    ...items.slice(0, SITEMAP_MAX).map((item) => ({
      loc: `${origin}/${item.type}/${item.id}`,
      priority: "0.7",
    })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url><loc>${escapeXml(url.loc)}</loc><lastmod>${today}</lastmod><changefreq>${url.loc.endsWith("/") ? "daily" : "weekly"}</changefreq><priority>${url.priority}</priority></url>`,
    ),
    "</urlset>",
    "",
  ].join("\n");

  sitemapCache = { at: Date.now(), origin, body };
  return body;
}

module.exports = { renderHtml, robots, sitemap, originOf, inject, headBlock };
