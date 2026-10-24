"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");

const FILE = path.join(config.dataDir, "db.json");

const EMPTY = { users: {}, votes: {}, watchlist: {}, history: {}, sessions: {} };

let state = null;
let writing = Promise.resolve();

function load() {
  if (state) return state;
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(FILE)) {
    state = structuredClone(EMPTY);
    return state;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    state = { ...structuredClone(EMPTY), ...raw };
  } catch {
    state = structuredClone(EMPTY);
  }
  return state;
}

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writing = writing.then(async () => {
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, "utf8");
    await fs.promises.rename(tmp, FILE);
  });
  return writing;
}

function flush() {
  return writing;
}

/* --------------------------------- user --------------------------------- */

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { salt, hash } = user.password;
  const candidate = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return candidate.length === known.length && crypto.timingSafeEqual(candidate, known);
}

function createUser({ email, password, name }) {
  const db = load();
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw Object.assign(new Error("invalid email"), { status: 400 });
  if (String(password || "").length < 6) throw Object.assign(new Error("password too short"), { status: 400 });
  if (Object.values(db.users).some((u) => u.email === normalized)) {
    throw Object.assign(new Error("email already registered"), { status: 409 });
  }
  const id = crypto.randomUUID();
  db.users[id] = {
    id,
    email: normalized,
    name: String(name || normalized.split("@")[0]).slice(0, 40),
    password: hashPassword(String(password)),
    createdAt: new Date().toISOString(),
  };
  persist();
  return publicUser(db.users[id]);
}

function findUserByEmail(email) {
  const db = load();
  const normalized = String(email || "").trim().toLowerCase();
  return Object.values(db.users).find((u) => u.email === normalized) || null;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

/* --------------------------------- votes -------------------------------- */

function voteKey(tmdbId, mediaType) {
  return `${mediaType === "tv" ? "tv" : "movie"}:${Number(tmdbId)}`;
}

function getVotes(tmdbId, mediaType, userId) {
  const db = load();
  const entry = db.votes[voteKey(tmdbId, mediaType)] || { up: 0, down: 0, byUser: {} };
  return { up: entry.up, down: entry.down, myVote: userId ? entry.byUser[userId] || null : null };
}

function castVote(tmdbId, mediaType, userId, direction) {
  const db = load();
  const key = voteKey(tmdbId, mediaType);
  const entry = db.votes[key] || { up: 0, down: 0, byUser: {} };
  const previous = entry.byUser[userId];
  const next = direction === previous ? null : direction;

  if (previous === "up") entry.up = Math.max(0, entry.up - 1);
  if (previous === "down") entry.down = Math.max(0, entry.down - 1);
  if (next === "up") entry.up += 1;
  if (next === "down") entry.down += 1;
  if (next) entry.byUser[userId] = next;
  else delete entry.byUser[userId];

  db.votes[key] = entry;
  persist();
  return { up: entry.up, down: entry.down, myVote: next };
}

/* ------------------------------- watchlist ------------------------------ */

function watchlist(userId) {
  const db = load();
  return db.watchlist[userId] || [];
}

function toggleWatchlist(userId, item) {
  const db = load();
  const list = db.watchlist[userId] || [];
  const idx = list.findIndex((x) => x.id === item.id && x.mediaType === item.mediaType);
  if (idx >= 0) {
    list.splice(idx, 1);
    db.watchlist[userId] = list;
    persist();
    return { added: false, items: list };
  }
  list.unshift({ ...item, addedAt: new Date().toISOString() });
  db.watchlist[userId] = list.slice(0, 500);
  persist();
  return { added: true, items: db.watchlist[userId] };
}

/* -------------------------------- history ------------------------------- */

function history(userId) {
  const db = load();
  return db.history[userId] || [];
}

function recordHistory(userId, entry) {
  const db = load();
  const list = db.history[userId] || [];
  const idx = list.findIndex(
    (x) => x.tmdbId === entry.tmdbId && x.mediaType === entry.mediaType && x.season === entry.season && x.episode === entry.episode,
  );
  const record = {
    ...entry,
    progress: Math.max(0, Math.min(1, Number(entry.progress) || 0)),
    watchedAt: new Date().toISOString(),
  };
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(record);
  db.history[userId] = list.slice(0, 200);
  persist();
  return db.history[userId];
}

function clearHistory(userId) {
  const db = load();
  db.history[userId] = [];
  persist();
  return [];
}

module.exports = {
  load,
  persist,
  flush,
  createUser,
  findUserByEmail,
  verifyPassword,
  publicUser,
  getVotes,
  castVote,
  watchlist,
  toggleWatchlist,
  history,
  recordHistory,
  clearHistory,
};
