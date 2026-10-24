"use strict";

/**
 * Stream payload decoder.
 *
 * Gateway protocol:
 *   1. GET {api}/seed?mediaId={tmdbId}      -> { seed, ttlMs }   (single use, ~30s)
 *   2. GET {api}/{provider}/sources?...&enc=2&seed={seed} -> base64url ciphertext
 *   3. decode base64url, xor with keystream derived from (seed, mediaId)
 *   4. payload = "mvm1" || utf8(json)
 */

const D = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
];

const isEven = (n) => ((n * (n + 1)) & 1) === 0;

function mix(v) {
  v >>>= 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x85ebca6b) >>> 0;
  v ^= v >>> 13;
  v = Math.imul(v, 0xc2b2ae35) >>> 0;
  v ^= v >>> 16;
  return v >>> 0;
}

function rotl(v, n) {
  v >>>= 0;
  n &= 31;
  if (n === 0) return v >>> 0;
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function fnv1a(text) {
  let acc = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) acc = Math.imul(acc ^ text.charCodeAt(i), 0x1000193) >>> 0;
  return mix(acc);
}

function perm256(text) {
  const box = new Array(256);
  for (let i = 0; i < 256; i += 1) box[i] = i;
  let t = 0;
  for (let i = 0; i < 256; i += 1) {
    t = (t + box[i] + text.charCodeAt(i % text.length)) & 255;
    const tmp = box[i];
    box[i] = box[t];
    box[t] = tmp;
  }
  return box;
}

function accInit(text) {
  let acc = 0x67452301;
  for (let i = 0; i < text.length; i += 1) acc = rotl((acc ^ Math.imul(text.charCodeAt(i), D[15 & i])) >>> 0, 5);
  return mix(acc);
}

function initState(seed, mediaId) {
  const len = seed.length;
  if (((len * (len + 1)) & 1) === 1) return { S: perm256(seed), acc: accInit(seed) };

  const box = new Array(61);
  let n = mix((fnv1a(seed) ^ mix((mediaId >>> 0) ^ 0x9e3779b9)) >>> 0) >>> 0;
  for (let i = 0; i < 8; i += 1) {
    if (isEven(i)) {
      const idx = n % 61;
      n = rotl((n + 0x9e3779b9) >>> 0, 7 + (7 & i));
      box[idx] = (n ^ mix(n)) >>> 0;
      n = mix((n + idx) >>> 0);
    } else {
      box[i] = D[15 & i];
    }
  }
  return { S: box, acc: mix(0xa5a5a5a5 ^ n) >>> 0 };
}

function nextWord(state, counter) {
  const box = state.S;
  const l = state.acc;
  const idx = l % 61;
  const present = 0 - Number(idx in box);
  const r = box[idx] >>> 0;
  const c = Math.imul(0x9e3779b9, counter + 1) >>> 0;
  const b = ((l ^ (r ^ c) >>> 0) >>> 0 | (l & (r ^ c) & present) >>> 0) >>> 0;
  const acc = mix((((rotl((b + l) >>> 0, 31 & idx) ^ rotl(l, 31 & Math.imul(idx, 7))) >>> 0) + 0x9e3779b9) >>> 0);
  state.acc = acc;
  box[idx] = acc >>> 0;
  return acc;
}

function decodeBase64Url(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(text.length / 4), "=");
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function decryptPayload(payload, seed, mediaId) {
  const data = decodeBase64Url(String(payload).trim());
  const state = initState(seed, mediaId);
  const total = data.length;
  let counter = 0;

  for (let i = 0; i < total; ) {
    const word = nextWord(state, counter);
    counter += 1;
    data[i] = data[i] ^ (word & 255);
    i += 1;
    if (i < total) { data[i] = data[i] ^ ((word >>> 8) & 255); i += 1; }
    if (i < total) { data[i] = data[i] ^ ((word >>> 16) & 255); i += 1; }
    if (i < total) { data[i] = data[i] ^ ((word >>> 24) & 255); i += 1; }
  }

  if (data[0] !== 109 || data[1] !== 118 || data[2] !== 109 || data[3] !== 49) {
    throw Object.assign(new Error("stream payload checksum mismatch"), { code: "BAD_MAGIC" });
  }
  return Buffer.from(data.subarray(4)).toString("utf8");
}

module.exports = { decryptPayload, decodeBase64Url, initState, nextWord };
