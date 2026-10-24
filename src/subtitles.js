"use strict";

const config = require("./config");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const searchCache = new Map();
const SEARCH_CACHE_MAX = 200;

/* ------------------------------- decoding ------------------------------- */

function normalizeEncoding(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  const aliases = {
    "utf8": "utf-8",
    "utf-8": "utf-8",
    "utf 8": "utf-8",
    "utf16": "utf-16le",
    "utf-16": "utf-16le",
    "utf-16le": "utf-16le",
    "utf-16be": "utf-16be",
    "cp1250": "windows-1250",
    "windows-1250": "windows-1250",
    "cp1251": "windows-1251",
    "windows-1251": "windows-1251",
    "cp1252": "windows-1252",
    "windows-1252": "windows-1252",
    "cp1253": "windows-1253",
    "windows-1253": "windows-1253",
    "cp1254": "windows-1254",
    "windows-1254": "windows-1254",
    "cp1255": "windows-1255",
    "windows-1255": "windows-1255",
    "cp1256": "windows-1256",
    "windows-1256": "windows-1256",
    "cp1257": "windows-1257",
    "windows-1257": "windows-1257",
    "cp1258": "windows-1258",
    "windows-1258": "windows-1258",
    "latin1": "windows-1252",
    "latin-1": "windows-1252",
    "iso-8859-1": "windows-1252",
    "iso8859-1": "windows-1252",
  };
  return aliases[value] || (/^iso-8859-\d+$/.test(value) ? value : null);
}

function decodeSubtitle(buffer, encoding) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const declared = normalizeEncoding(encoding);
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      /* fall through to detection */
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (broken > Math.max(2, utf8.length * 0.001)) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      /* keep the utf-8 result */
    }
  }
  return utf8;
}

/* ------------------------------ conversion ------------------------------ */

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function vttTime(seconds) {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function parseAssTime(value) {
  const match = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(value || "").trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] || "0").padEnd(3, "0").slice(0, 3));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function splitLimited(text, count) {
  const parts = [];
  let rest = text;
  for (let i = 0; i < count - 1; i++) {
    const at = rest.indexOf(",");
    if (at < 0) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  parts.push(rest);
  return parts;
}

function cuesToVtt(cues) {
  const out = ["WEBVTT", ""];
  for (const cue of cues) {
    if (!cue.start || !cue.end || !cue.text) continue;
    out.push(`${cue.start} --> ${cue.end}`, cue.text, "");
  }
  return out.length > 2 ? out.join("\n") : "";
}

function srtToVtt(text) {
  const body = cleanText(text)
    .replace(/(\d{1,3}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/(\d{1,2}:\d{2}),(\d{3})/g, "00:$1.$2");
  if (!body.includes("-->")) return "";
  return `WEBVTT\n\n${body}\n`;
}

function assToVtt(text) {
  const lines = cleanText(text).split("\n");
  let inEvents = false;
  let fields = null;
  const cues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[events\]/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[[^\]]+\]/.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(trimmed)) {
      fields = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .split(",")
        .map((part) => part.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(trimmed)) continue;

    const body = line.slice(line.indexOf(":") + 1);
    const parts = splitLimited(body, fields ? Math.max(fields.length, 2) : 10);
    const pick = (name, fallback) => {
      const index = fields ? fields.indexOf(name) : -1;
      return parts[index >= 0 ? index : fallback] || "";
    };
    const start = parseAssTime(pick("start", 1));
    const end = parseAssTime(pick("end", 2));
    const raw = pick("text", parts.length - 1);
    const content = raw
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (start && end && content) cues.push({ start, end, text: content });
  }

  return cuesToVtt(cues);
}

function microDvdToVtt(text) {
  const lines = cleanText(text).split("\n");
  let fps = 23.976;
  const header = /^\{(\d+)\}\{(\d+)\}([\d.]+)\s*$/.exec(lines[0] || "");
  if (header) {
    fps = Number(header[3]) || fps;
    lines.shift();
  }
  const cues = [];
  for (const line of lines) {
    const match = /^\{(\d+)\}\{(\d+)\}(.*)$/.exec(line.trim());
    if (!match) continue;
    const start = vttTime(Number(match[1]) / fps);
    const end = vttTime(Number(match[2]) / fps);
    const content = match[3]
      .replace(/\{[^}]*\}/g, "")
      .replace(/\|/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (start && end && content) cues.push({ start, end, text: content });
  }
  return cuesToVtt(cues);
}

function samiToVtt(text) {
  const clean = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = [];
  const pattern = /<sync[^>]*\bstart\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<sync\b|<\/body|$)/gi;
  let match;
  while ((match = pattern.exec(clean))) {
    const content = match[2]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
    blocks.push({ start: Number(match[1]) || 0, content });
  }

  const cues = [];
  for (let i = 0; i < blocks.length; i++) {
    if (!blocks[i].content) continue;
    const next = blocks.slice(i + 1).find((block) => block.start > blocks[i].start);
    const end = next ? next.start : blocks[i].start + 4000;
    cues.push({ start: vttTime(blocks[i].start / 1000), end: vttTime(end / 1000), text: blocks[i].content });
  }
  return cuesToVtt(cues);
}

function toVtt(input, { format = "", encoding = "" } = {}) {
  const text = Buffer.isBuffer(input) ? decodeSubtitle(input, encoding) : String(input || "");
  const clean = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^\s*WEBVTT\b/i.test(clean)) return `${clean.trim()}\n`;

  const fmt = String(format || "").toLowerCase();
  if (fmt === "ass" || fmt === "ssa" || /\[script info\]|\[events\]/i.test(clean)) {
    const out = assToVtt(clean);
    if (out) return out;
  }
  if (fmt === "sub" || /^\{\d+\}\{\d+\}/.test(clean.trim())) {
    const out = microDvdToVtt(clean);
    if (out) return out;
  }
  if (fmt === "smi" || fmt === "sami" || /<sami\b|<sync\b/i.test(clean)) {
    const out = samiToVtt(clean);
    if (out) return out;
  }
  if (clean.includes("-->")) {
    const out = srtToVtt(clean);
    if (out) return out;
  }
  return "";
}

/* -------------------------------- search -------------------------------- */

async function search({ tmdbId, mediaType, season = 1, episode = 1 } = {}) {
  const id = /^\d+$/.test(String(tmdbId || "")) ? String(tmdbId) : "";
  if (!id) return { subtitles: [], total: 0 };

  const isTv = mediaType === "tv";
  const seasonNo = Math.max(1, Number(season) || 1);
  const episodeNo = Math.max(1, Number(episode) || 1);
  const key = `${id}|${isTv ? `${seasonNo}:${episodeNo}` : "movie"}`;
  const hit = searchCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const base = config.subtitleApi.replace(/\/+$/, "");
  const params = new URLSearchParams({ id });
  if (isTv) {
    params.set("season", String(seasonNo));
    params.set("episode", String(episodeNo));
  }

  try {
    const response = await fetch(`${base}/search?${params}`, {
      headers: {
        accept: "application/json",
        referer: config.streamReferer,
        origin: new URL(config.streamReferer).origin,
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { subtitles: [], total: 0 };

    const rows = await response.json();
    const seen = new Set();
    const subtitles = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !row.url) continue;
      const dedupe = String(row.id || row.url);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      let target = String(row.url).trim();
      if (!/^https?:/i.test(target)) {
        try {
          target = new URL(target, base).toString();
        } catch {
          continue;
        }
      }

      const code = String(row.language || row.display || "").toLowerCase().trim();
      const display = String(row.display || code || "Unknown").trim();
      const format = String(row.format || "").toLowerCase().trim();
      const encoding = String(row.encoding || "").trim();
      const proxy = new URLSearchParams({ u: target });
      if (format) proxy.set("fmt", format);
      if (encoding) proxy.set("enc", encoding);

      subtitles.push({
        id: row.id || null,
        lang: code || display.toLowerCase(),
        language: display,
        display,
        url: `/sub?${proxy.toString()}`,
        hi: Boolean(row.isHearingImpaired),
        format,
        encoding,
        origin: String(row.origin || "").trim(),
        release: String(row.release || "").replace(/\s+/g, " ").trim(),
        fileName: String(row.fileName || "").trim(),
        downloads: Number(row.downloadCount) || 0,
        trusted: Boolean(row.isTrusted),
        source: row.source || "opensubtitles",
      });
    }

    subtitles.sort(
      (a, b) =>
        a.language.localeCompare(b.language) ||
        Number(b.trusted) - Number(a.trusted) ||
        b.downloads - a.downloads,
    );

    const value = { subtitles, total: subtitles.length };
    if (searchCache.size >= SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key, { value, expires: Date.now() + config.cacheTtlMs });
    return value;
  } catch {
    return { subtitles: [], total: 0 };
  }
}

module.exports = { search, toVtt, decodeSubtitle };
