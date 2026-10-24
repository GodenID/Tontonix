"use strict";

const crypto = require("node:crypto");
const config = require("./config");

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", config.jwtSecret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", config.jwtSecret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function issue(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: user.id, email: user.email, iat: now, exp: now + config.jwtTtlSeconds });
}

module.exports = { sign, verify, issue };
