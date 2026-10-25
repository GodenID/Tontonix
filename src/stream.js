"use strict";

const config = require("./config");
const stats = require("./provider-stats");
const { decryptPayload } = require("./streamcrypto");

/** Provider lineup, mirrors the site: name, flag, audio note, gateway slug. */
const PROVIDERS = [
  { id: "miami", name: "Miami", flag: "us", note: "Original audio. May have 4K", filter: null, alt: false, language: null },
  { id: "boise", name: "Boise", flag: "us", note: "Original audio. May have 4K", filter: null, alt: false, language: null },
  { id: "vegas", name: "Vegas", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "chicago", name: "Chicago", flag: "us", note: "Original audio", filter: null, alt: true, language: null },
  { id: "reno", name: "Reno", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "oakland", name: "Oakland", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "seattle", name: "Seattle", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "phoenix", name: "Phoenix", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "atlanta", name: "Atlanta", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "portland", name: "Portland", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "austin", name: "Austin", flag: "us", note: "Original audio", filter: "English", alt: false, language: null },
  { id: "dallas", name: "Dallas", flag: "us", note: "Original audio", filter: null, alt: false, language: null },
  { id: "munich", name: "Munich", flag: "de", note: "German audio", filter: null, alt: false, language: "german" },
  { id: "berlin", name: "Berlin", flag: "de", note: "German audio", filter: null, alt: true, language: null },
  { id: "paris", name: "Paris", flag: "fr", note: "French audio", filter: null, alt: false, language: null },
  { id: "delhi", name: "Delhi", flag: "in", note: "Hindi audio", filter: "Hindi", alt: false, language: null },
  { id: "cancun", name: "Cancun", flag: "mx", note: "Spanish audio", filter: null, alt: false, language: null },
];

const providerById = new Map(PROVIDERS.map((p) => [p.id, p]));

const seedCache = new Map();
const sourceCache = new Map();

function headers() {
  return {
    accept: "*/*",
    origin: new URL(config.streamApi).origin,
    referer: config.streamReferer,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

const seedInflight = new Map();

async function getSeed(mediaId, { force = false } = {}) {
  const key = String(mediaId);
  const hit = seedCache.get(key);
  if (!force && hit && hit.expires - 3000 > Date.now()) return hit.seed;
  if (seedInflight.has(key)) return seedInflight.get(key);

  const task = (async () => {
    const res = await fetch(`${config.streamApi}/seed?mediaId=${encodeURIComponent(mediaId)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw Object.assign(new Error(`seed ${res.status}`), { status: res.status });
    const json = await res.json();
    if (!json.seed) throw Object.assign(new Error("seed missing in response"), { status: 502 });
    seedCache.set(key, { seed: json.seed, expires: Date.now() + (json.ttlMs || 30000) });
    return json.seed;
  })();

  seedInflight.set(key, task);
  try {
    return await task;
  } finally {
    seedInflight.delete(key);
  }
}

function buildQuery(provider, req) {
  const title = provider.alt && req.titleOriginal && req.titleOriginal !== req.title ? req.titleOriginal : req.title;
  const params = new URLSearchParams({
    title: encodeURIComponent(title || ""),
    mediaType: req.mediaType === "tv" ? "tv" : "movie",
    year: String(req.year || ""),
    episodeId: String(req.episode || 1),
    seasonId: String(req.season || 1),
    tmdbId: String(req.tmdbId),
    imdbId: req.imdbId || "",
    enc: "2",
  });
  if (req.totalSeasons) params.set("totalSeasons", String(req.totalSeasons));
  if (provider.language) params.set("language", provider.language);
  if (provider.alt && req.titleOriginal && req.titleOriginal !== req.title) {
    params.set("altTitle", encodeURIComponent(req.titleOriginal));
  }
  return params;
}

async function resolveProvider(providerId, req, { force = false } = {}) {
  const provider = providerById.get(providerId);
  if (!provider) throw Object.assign(new Error("unknown provider"), { status: 404 });

  const key = [providerId, req.mediaType, req.tmdbId, req.season || 1, req.episode || 1].join("|");
  const hit = sourceCache.get(key);
  if (!force && hit && hit.expires > Date.now()) return hit.value;

  const url = `${config.streamApi}/${provider.id}/sources?${buildQuery(provider, req)}`;
  const run = async () => {
    const seed = await getSeed(req.tmdbId, { force });
    const query = buildQuery(provider, req);
    query.set("seed", seed);
    const res = await fetch(`${config.streamApi}/${provider.id}/sources?${query}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) throw Object.assign(new Error("seed rejected"), { status: 401 });
    if (!res.ok) throw Object.assign(new Error(`provider ${provider.id} ${res.status}`), { status: res.status });
    const payload = await res.text();
    return JSON.parse(decryptPayload(payload, seed, req.tmdbId));
  };

  let result;
  const startedAt = Date.now();
  try {
    try {
      result = await run();
    } catch (err) {
      if (err.status === 401 || err.code === "BAD_MAGIC") {
        seedCache.delete(String(req.tmdbId));
        result = await run();
      } else {
        throw err;
      }
    }
    stats.record(providerId, { ok: true, ms: Date.now() - startedAt, empty: !(result.sources || []).length });
  } catch (err) {
    stats.record(providerId, { ok: false, ms: Date.now() - startedAt, error: err.message });
    throw err;
  }

  let sources = result.sources || [];
  if (provider.filter) sources = sources.filter((s) => String(s.quality).startsWith(provider.filter) || s.quality === provider.filter);
  const value = {
    provider: provider.id,
    name: provider.name,
    flag: provider.flag,
    note: provider.note,
    sources,
    subtitles: result.subtitles || [],
    thumbnail: result.thumbnail || null,
    playlist: result.playlist || null,
  };
  sourceCache.set(key, { value, expires: Date.now() + config.streamCacheTtlMs });
  return value;
}

/** Resolve several providers in parallel, ordered by measured health. */
async function resolveAll(req, { limit = 6, force = false } = {}) {
  const count = Math.max(1, Math.min(PROVIDERS.length, Number(limit) || 6));
  const ordered = stats.order(PROVIDERS).slice(0, count);
  const settled = await Promise.all(
    ordered.map(async (provider) => {
      try {
        const value = await resolveProvider(provider.id, req, { force });
        return value.sources.length ? value : null;
      } catch {
        return null;
      }
    }),
  );
  return settled.filter(Boolean);
}

function countFresh(cache) {
  const now = Date.now();
  let fresh = 0;
  for (const value of cache.values()) if (value.expires > now) fresh += 1;
  return fresh;
}

function cacheStats() {
  return {
    seed: { total: seedCache.size, fresh: countFresh(seedCache) },
    sources: { total: sourceCache.size, fresh: countFresh(sourceCache), ttlMs: config.streamCacheTtlMs },
    providers: stats.snapshot(),
  };
}

module.exports = { PROVIDERS, providerById, resolveProvider, resolveAll, getSeed, cacheStats };
