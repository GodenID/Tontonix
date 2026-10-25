"use strict";

const config = require("./config");
const atlantic = require("./atlantic");

/**
 * Atlantic is the only source now. Its embed API answers with a ready master
 * playlist per title, so there is no gateway seed, no encrypted payload and no
 * provider lottery to rank.
 */
const PROVIDERS = [
  {
    id: "atlantic",
    name: "Atlantic",
    flag: "us",
    note: "Original audio. 4K adaptive",
    filter: null,
    alt: false,
    language: null,
    resolver: "atlantic",
  },
];

const providerById = new Map(PROVIDERS.map((p) => [p.id, p]));

const sourceCache = new Map();
const failCache = new Map();

function cacheKey(providerId, req) {
  return [providerId, req.mediaType, req.tmdbId, req.season || 1, req.episode || 1].join("|");
}

async function resolveProvider(providerId, req, { force = false } = {}) {
  const provider = providerById.get(providerId);
  if (!provider) throw Object.assign(new Error("unknown provider"), { status: 404 });

  const key = cacheKey(providerId, req);
  const hit = sourceCache.get(key);
  if (!force && hit && hit.expires > Date.now()) return hit.value;

  const miss = failCache.get(key);
  if (miss && miss.expires > Date.now()) throw Object.assign(new Error(miss.message), { status: miss.status });

  let result;
  try {
    result = await atlantic.resolve({
      tmdbId: req.tmdbId,
      mediaType: req.mediaType,
      season: req.season,
      episode: req.episode,
    });
  } catch (err) {
    if (err.status === 502 || err.status === 404) {
      failCache.set(key, { message: err.message, status: err.status, expires: Date.now() + 45000 });
      if (failCache.size > 500) failCache.delete(failCache.keys().next().value);
    }
    throw err;
  }

  let sources = result.sources || [];
  if (provider.filter) {
    sources = sources.filter((s) => String(s.quality).startsWith(provider.filter) || s.quality === provider.filter);
  }

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

/** Resolve every provider. Atlantic is the only one, so this is a thin alias. */
async function resolveAll(req, { limit = 1, force = false } = {}) {
  const count = Math.max(1, Math.min(PROVIDERS.length, Number(limit) || 1));
  const settled = await Promise.all(
    PROVIDERS.slice(0, count).map(async (provider) => {
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
    sources: { total: sourceCache.size, fresh: countFresh(sourceCache), ttlMs: config.streamCacheTtlMs },
    failed: failCache.size,
  };
}

module.exports = { PROVIDERS, providerById, resolveProvider, resolveAll, cacheStats };
