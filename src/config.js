"use strict";

const path = require("node:path");

const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || "127.0.0.1",
  dataDir: env.DATA_DIR || path.join(__dirname, "..", "data"),
  jwtSecret: env.JWT_SECRET || "movy-clone-dev-secret-change-me",
  jwtTtlSeconds: 60 * 60 * 24 * 30,

  // TMDB-compatible catalog proxy (no api key needed).
  tmdbBase: env.TMDB_BASE || "https://db.wecollege.net/3",
  tmdbImageBase: env.TMDB_IMAGE_BASE || "https://image.tmdb.org/t/p",
  tmdbLang: env.TMDB_LANG || "en-US",

  // Stream source: Atlantic embed API (master playlist per title).
  streamReferer: env.STREAM_REFERER || "https://atlantic.st/",
  trailerApi: env.TRAILER_API || "https://trailers.wecollege.net",
  subtitleApi: env.SUBTITLE_API || "https://subtitles.vidy.st",

  // Atlantic's own extras: intro/recap/credits markers and its subtitle feed.
  segmentApi: env.SEGMENT_API || "https://api.theintrodb.org/v3",
  atlanticSubsApi: env.ATLANTIC_SUBS_API || "https://natsuki.hls.lol/subs",

  cacheTtlMs: Number(env.CACHE_TTL_MS || 10 * 60 * 1000),
  streamCacheTtlMs: Number(env.STREAM_CACHE_TTL_MS || 4 * 60 * 1000),

  logRequests: env.LOG_REQUESTS === "1",
};

module.exports = config;
