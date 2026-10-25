"use strict";

/**
 * Atlantic source resolver.
 *
 * Atlantic exposes a public embed API keyed by TMDB id. The gateway answers
 * with a ready master playlist that already carries the full bitrate ladder
 * (2160p/1080p/720p/480p), so the player can run adaptive streaming instead of
 * being pinned to one rendition.
 */

const BASE = "https://zcdn.bluevelvet.space";
const REFERER = "https://atlantic.st/";

function headers() {
  return {
    accept: "*/*",
    referer: REFERER,
    origin: new URL(REFERER).origin,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

function catalogGap(message) {
  return Object.assign(new Error(message), { status: 404 });
}

async function fetchJson(url, timeoutMs) {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const status = res.status >= 500 ? 502 : res.status;
    throw Object.assign(new Error(`atlantic ${res.status}`), { status });
  }
  return res.json();
}

/** Turn the master playlist into labelled renditions, best first. */
async function renditions(masterUrl) {
  let text = "";
  try {
    const res = await fetch(masterUrl, { headers: headers(), signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const next = (lines[i + 1] || "").trim();
    if (!next || next.startsWith("#")) continue;
    const resolution = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    const width = resolution ? Number(resolution[1]) : 0;
    const height = resolution ? Number(resolution[2]) : 0;
    out.push({
      rank: Math.max(width, height),
      quality: qualityLabel(width, height),
      url: new URL(next, masterUrl).toString(),
    });
  }

  out.sort((a, b) => b.rank - a.rank);
  return out.map(({ quality, url }) => ({ quality, url }));
}

/**
 * Frame height is the usual tier name, but a 4:3 master reports its long edge
 * in height (1440x2076). Label by the short edge so 1440p stays 1440p.
 */
function qualityLabel(width, height) {
  const short = Math.min(width, height) || Math.max(width, height);
  if (!short) return "auto";
  const tiers = [480, 720, 1080, 1440, 2160];
  let best = tiers[0];
  for (const tier of tiers) if (Math.abs(tier - short) < Math.abs(best - short)) best = tier;
  if (Math.abs(best - short) <= best * 0.12) return `${best}p`;
  return `${short}p`;
}

async function resolve({ tmdbId, mediaType, season, episode }) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const params = new URLSearchParams({ tmdb: String(tmdbId), type });
  if (type === "tv") {
    params.set("season", String(season || 1));
    params.set("episode", String(episode || 1));
  }

  const json = await fetchJson(`${BASE}/cdn?${params}`, 12000);
  if (!json || !json.ready || typeof json.url !== "string" || !json.url) {
    throw catalogGap("atlantic: title not available");
  }

  const sources = await renditions(json.url);
  return {
    sources: sources.length ? sources : [{ quality: "auto", url: json.url }],
    subtitles: [],
    thumbnail: null,
    playlist: json.url,
  };
}

module.exports = { resolve };
