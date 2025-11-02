"use strict";

const cors = require("cors");
const { getAuth } = require("firebase-admin/auth");
const { logger } = require("firebase-functions");

const rateLimits = new Map();
const RATE_LIMIT_TOKENS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const corsMiddleware = cors({
  origin: true,
  credentials: true,
});

function rateLimitIngest(req, res, next) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : "").trim() || req.ip || "unknown";
  const now = Date.now();
  const entry = rateLimits.get(ip) || { tokens: RATE_LIMIT_TOKENS, updatedAt: now };
  const elapsed = now - entry.updatedAt;
  const refill = Math.floor(elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_TOKENS;
  entry.tokens = Math.min(RATE_LIMIT_TOKENS, entry.tokens + refill);
  entry.updatedAt = now;

  if (entry.tokens <= 0) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  entry.tokens -= 1;
  rateLimits.set(ip, entry);
  next();
}

function parseAdminList() {
  const envList = process.env.ANALYTICS_ALLOWED_EMAILS || "";
  return new Set(
    envList
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

let cachedAdmins = parseAdminList();
let cachedEnv = process.env.ANALYTICS_ALLOWED_EMAILS;

async function requireAdminAuth(req, res, next) {
  if (cachedEnv !== process.env.ANALYTICS_ALLOWED_EMAILS) {
    cachedAdmins = parseAdminList();
    cachedEnv = process.env.ANALYTICS_ALLOWED_EMAILS;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    const email = decoded.email ? decoded.email.toLowerCase() : undefined;
    if (!email || (cachedAdmins.size > 0 && !cachedAdmins.has(email))) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn("Failed to verify admin token", error);
    res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

function bodySizeLimit(limitBytes) {
  return function bodySizeMiddleware(req, res, next) {
    const header = req.headers["content-length"];
    const parsed = header ? Number(header) : Number.NaN;
    let length = Number.isNaN(parsed) ? 0 : parsed;
    if (!header && req.body && typeof req.body === "object") {
      try {
        length = Buffer.byteLength(JSON.stringify(req.body));
      } catch (error) {
        length = limitBytes + 1;
      }
    }

    if (length > limitBytes) {
      res.status(413).json({ ok: false, error: "payload_too_large" });
      return;
    }
    next();
  };
}

module.exports = { corsMiddleware, rateLimitIngest, requireAdminAuth, bodySizeLimit };
