"use strict";

const tmdbApi = require("./tmdb");
const stream = require("./stream");

const INTERVAL_MS = Number(process.env.WARM_INTERVAL_MS || 30 * 60 * 1000);
const START_DELAY_MS = Number(process.env.WARM_START_MS || 20000);
const TITLES = Math.max(1, Math.min(20, Number(process.env.WARM_TITLES || 8)));
const PROVIDERS = Math.max(1, Math.min(17, Number(process.env.WARM_PROVIDERS || 6)));
const PAUSE_MS = Math.max(0, Number(process.env.WARM_PAUSE_MS || 300));
const ENABLED = process.env.CACHE_WARM !== "0";

const status = {
  enabled: ENABLED,
  running: false,
  runs: 0,
  reason: "",
  lastRunAt: null,
  lastDurationMs: 0,
  lastWarmed: 0,
  lastFailed: 0,
  lastTitles: [],
  lastError: "",
  nextRunAt: 0,
};

let timer = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicStatus() {
  return {
    ...status,
    intervalMs: INTERVAL_MS,
    titlesPerRun: TITLES,
    providersPerTitle: PROVIDERS,
  };
}

async function candidates(limit) {
  const [week, popularMovie, popularTv] = await Promise.all([
    tmdbApi.tmdb("/trending/all/week", { page: 1 }),
    tmdbApi.tmdb("/movie/popular", { page: 1 }),
    tmdbApi.tmdb("/tv/popular", { page: 1 }),
  ]);
  const merged = [
    ...(week.results || []),
    ...(popularMovie.results || []),
    ...(popularTv.results || []),
  ];
  const seen = new Set();
  const out = [];
  for (const item of merged) {
    const type = item.media_type || (item.first_air_date ? "tv" : "movie");
    if (type !== "movie" && type !== "tv") continue;
    const key = `${type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: Number(item.id), mediaType: type, title: item.title || item.name || "", year: (item.release_date || item.first_air_date || "").slice(0, 4) });
    if (out.length >= limit) break;
  }
  return out;
}

function toRequest(detail) {
  const tv = detail.mediaType === "tv";
  return {
    tmdbId: detail.tmdbId,
    mediaType: detail.mediaType,
    title: detail.title || "",
    titleOriginal: detail.titleOriginal || "",
    year: detail.year || "",
    imdbId: detail.imdbId || "",
    season: 1,
    episode: 1,
    totalSeasons: tv ? detail.episodeInfo?.seasons || detail.seasons?.length || 1 : undefined,
  };
}

async function run({ limit = TITLES, providers = PROVIDERS, reason = "manual" } = {}) {
  if (!ENABLED) return { enabled: false, skipped: true };
  if (status.running) return { running: true, skipped: true, status: publicStatus() };

  const startedAt = Date.now();
  status.running = true;
  status.reason = reason;
  status.lastError = "";
  status.lastWarmed = 0;
  status.lastFailed = 0;
  status.lastTitles = [];

  try {
    const picks = await candidates(Math.max(1, Math.min(20, Number(limit) || TITLES)));
    for (const pick of picks) {
      try {
        const detail = pick.mediaType === "tv" ? await tmdbApi.tvDetail(pick.id) : await tmdbApi.movieDetail(pick.id);
        const values = await stream.resolveAll(toRequest(detail), { limit: Math.max(1, Math.min(17, Number(providers) || PROVIDERS)) });
        status.lastWarmed += values.length;
        status.lastTitles.push({ tmdbId: detail.tmdbId, mediaType: detail.mediaType, title: detail.title, providers: values.length });
      } catch (err) {
        status.lastFailed += 1;
        status.lastError = String(err.message || err).slice(0, 200);
      }
      if (PAUSE_MS) await sleep(PAUSE_MS);
    }
    status.lastDurationMs = Date.now() - startedAt;
    status.lastRunAt = Date.now();
    status.runs += 1;
    return { ok: true, warmed: status.lastWarmed, failed: status.lastFailed, durationMs: status.lastDurationMs, titles: status.lastTitles };
  } catch (err) {
    status.lastError = String(err.message || err).slice(0, 200);
    status.lastDurationMs = Date.now() - startedAt;
    status.lastRunAt = Date.now();
    return { ok: false, error: status.lastError };
  } finally {
    status.running = false;
    if (ENABLED) {
      status.nextRunAt = Date.now() + INTERVAL_MS;
      schedule(INTERVAL_MS);
    }
  }
}

function schedule(delay) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    run({ reason: "schedule" }).catch(() => {});
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  status.nextRunAt = Date.now() + delay;
}

function start() {
  if (!ENABLED) {
    status.nextRunAt = 0;
    return publicStatus();
  }
  schedule(START_DELAY_MS);
  return publicStatus();
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  status.nextRunAt = 0;
}

module.exports = { start, stop, run, status: publicStatus, config: { enabled: ENABLED, intervalMs: INTERVAL_MS, titles: TITLES, providers: PROVIDERS } };
