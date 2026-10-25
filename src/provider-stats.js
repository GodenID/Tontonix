"use strict";

const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

const FILE = path.join(config.dataDir, "provider-stats.json");
const COOLDOWN_MS = 10 * 60 * 1000;
const COOLDOWN_PENALTY = 220;
const SAVE_DEBOUNCE_MS = 4000;

const EMPTY = { ok: 0, fail: 0, empty: 0, ewma: 0, streak: 0, lastOk: null, lastFail: null, lastError: "" };

let entries = load();
let saveTimer = 0;
let writing = Promise.resolve();

function blank() {
  return { ...EMPTY };
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object") continue;
      out[id] = {
        ok: Math.max(0, Number(value.ok) || 0),
        fail: Math.max(0, Number(value.fail) || 0),
        empty: Math.max(0, Number(value.empty) || 0),
        ewma: Math.max(0, Number(value.ewma) || 0),
        streak: Math.max(0, Number(value.streak) || 0),
        lastOk: Number(value.lastOk) || null,
        lastFail: Number(value.lastFail) || null,
        lastError: String(value.lastError || "").slice(0, 160),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function entry(id) {
  if (!entries[id]) entries[id] = blank();
  return entries[id];
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    save();
  }, SAVE_DEBOUNCE_MS);
  if (typeof saveTimer.unref === "function") saveTimer.unref();
}

function save() {
  const snapshot = JSON.stringify(entries, null, 2);
  writing = writing
    .then(async () => {
      await fs.promises.mkdir(config.dataDir, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, "utf8");
      await fs.promises.rename(tmp, FILE);
    })
    .catch(() => {});
  return writing;
}

function clampMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 120000);
}

/**
 * Record one resolution attempt.
 * `ok` is transport/mount success. `empty` means the provider answered but had
 * no playable source for this title: neutral, not a provider fault.
 */
function record(id, { ok = true, ms = 0, empty = false, error = "" } = {}) {
  const key = String(id || "").trim();
  if (!key) return;
  const e = entry(key);
  const duration = clampMs(ms);
  if (ok) {
    e.ok += 1;
    e.streak = 0;
    e.lastOk = Date.now();
    e.ewma = e.ewma ? e.ewma * 0.7 + duration * 0.3 : duration;
  } else {
    e.fail += 1;
    e.streak = Math.min(20, e.streak + 1);
    e.lastFail = Date.now();
    e.lastError = String(error || "").slice(0, 160);
  }
  if (empty) e.empty += 1;
  scheduleSave();
}

function successRate(id) {
  const e = entries[id];
  if (!e) return 0.5;
  const attempts = e.ok + e.fail;
  return (e.ok + 1) / (attempts + 2);
}

function score(id) {
  const e = entries[id];
  if (!e) return 500;
  const rate = successRate(id);
  const latency = Math.min(1800, (e.ewma || 0) / 15);
  const cooling = e.streak > 0 && e.lastFail && Date.now() - e.lastFail < COOLDOWN_MS;
  const penalty = cooling ? Math.min(660, COOLDOWN_PENALTY * e.streak) : 0;
  return Math.round(rate * 1000 - latency - penalty);
}

function order(providers) {
  return providers
    .map((provider, index) => ({ provider, index, score: score(provider.id) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.provider);
}

function snapshot() {
  return Object.entries(entries)
    .filter(([, e]) => e.ok + e.fail + e.empty > 0)
    .map(([id, e]) => ({
      id,
      ok: e.ok,
      fail: e.fail,
      empty: e.empty,
      attempts: e.ok + e.fail,
      successRate: Math.round(successRate(id) * 1000) / 1000,
      avgMs: Math.round(e.ewma || 0),
      score: score(id),
      streak: e.streak,
      lastOk: e.lastOk,
      lastFail: e.lastFail,
      lastError: e.lastError,
    }))
    .sort((a, b) => b.score - a.score);
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    save();
  }
  return writing;
}

module.exports = { record, score, order, snapshot, flush };
