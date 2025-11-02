import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { AnalyticsService } from "./service";
import { corsMiddleware, rateLimitIngest, requireAdminAuth, bodySizeLimit } from "./middleware";
import { parseWindow, selectGranularity, ensurePath } from "./utils";
import { PageviewPayload } from "./types";

initializeApp();

const app = express();
app.use(express.json({ limit: "4kb" }));
app.use(corsMiddleware);

const firestore = getFirestore();
const analytics = new AnalyticsService(firestore);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/ingest/pageview", bodySizeLimit(2048), rateLimitIngest, async (req, res) => {
  try {
    const payload = req.body as PageviewPayload;
    const sanitized: PageviewPayload = {
      siteId: typeof payload.siteId === "string" ? payload.siteId.slice(0, 64) : "default",
      ts: typeof payload.ts === "string" ? payload.ts : undefined,
      url: typeof payload.url === "string" ? payload.url : undefined,
      path: typeof payload.path === "string" ? payload.path : "/",
      referrer: typeof payload.referrer === "string" ? payload.referrer : null,
      anonId: typeof payload.anonId === "string" ? payload.anonId : "",
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : "",
      ua: typeof payload.ua === "string" ? payload.ua : undefined,
      meta: typeof payload.meta === "object" && payload.meta ? payload.meta : undefined,
    };

    if (!sanitized.anonId || !sanitized.sessionId) {
      res.status(400).json({ ok: false, error: "invalid_ids" });
      return;
    }

    await analytics.ingest(sanitized);
    res.json({ ok: true });
  } catch (error) {
    logger.error("Failed to ingest pageview", error);
    res.status(400).json({ ok: false, error: (error as Error).message ?? "bad_request" });
  }
});

app.use(requireAdminAuth);

app.get("/analytics/summary", async (req, res) => {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId : "default";
    const windowMs = parseWindow(typeof req.query.window === "string" ? req.query.window : undefined, 24 * 60 * 60 * 1000);
    const path = ensurePath(typeof req.query.path === "string" ? req.query.path : undefined) || undefined;
    const summary = await analytics.getSummary({ siteId, windowMs, path });
    res.json(summary);
  } catch (error) {
    logger.error("Summary error", error);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

app.get("/analytics/timeseries", async (req, res) => {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId : "default";
    const windowMs = parseWindow(typeof req.query.window === "string" ? req.query.window : undefined, 24 * 60 * 60 * 1000);
    const granularity = selectGranularity(windowMs, typeof req.query.granularity === "string" ? req.query.granularity : undefined);
    const path = ensurePath(typeof req.query.path === "string" ? req.query.path : undefined) || undefined;
    const timeseries = await analytics.getTimeseries({ siteId, windowMs, path, granularity });
    res.json({ buckets: timeseries, granularity });
  } catch (error) {
    logger.error("Timeseries error", error);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

app.get("/analytics/live", async (req, res) => {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId : "default";
    const windowMs = parseWindow(typeof req.query.window === "string" ? req.query.window : undefined, 15 * 60 * 1000);
    const path = ensurePath(typeof req.query.path === "string" ? req.query.path : undefined) || undefined;
    const live = await analytics.getLive({ siteId, windowMs, path });
    res.json(live);
  } catch (error) {
    logger.error("Live error", error);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

app.get("/analytics/top", async (req, res) => {
  try {
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId : "default";
    const windowMs = parseWindow(typeof req.query.window === "string" ? req.query.window : undefined, 24 * 60 * 60 * 1000);
    const path = ensurePath(typeof req.query.path === "string" ? req.query.path : undefined) || undefined;
    const limit = Math.max(1, Math.min(50, typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20));
    const top = await analytics.getTop({ siteId, windowMs, path, limit });
    res.json(top);
  } catch (error) {
    logger.error("Top error", error);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

app.post("/analytics/compact", async (req, res) => {
  try {
    const minutes = typeof req.body?.minutes === "number" ? req.body.minutes : 10;
    const minuteResult = await analytics.compactMinutesToHours(minutes);
    const hourResult = await analytics.compactHoursToDays();
    res.json({ minuteResult, hourResult });
  } catch (error) {
    logger.error("Compaction error", error);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

export const analyticsApi = onRequest({ cors: false }, app);
