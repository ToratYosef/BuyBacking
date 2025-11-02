import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { TinyHLL, UniqueAccumulator } from "./hll";
import { Granularity, PageviewPayload, SummaryParams, TimeseriesParams, TopParams } from "./types";
import { floorDate, iso, toTimestamp } from "./utils";

const BOT_REGEX = /(bot|spider|crawler|preview|slurp|facebookexternalhit|headless|cfnetwork|wget|curl)/i;
const UNIQUE_CAP = 5000;

export interface PageviewResult {
  ok: boolean;
}

export class AnalyticsService {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async ingest(payload: PageviewPayload): Promise<PageviewResult> {
    if (payload.ua && BOT_REGEX.test(payload.ua)) {
      logger.debug("Dropping bot UA", { ua: payload.ua });
      return { ok: true };
    }

    const siteId = payload.siteId || "default";
    const ts = payload.ts ? new Date(payload.ts) : new Date();
    if (Number.isNaN(ts.getTime())) {
      throw new Error("invalid_timestamp");
    }

    if (!payload.path || !payload.path.startsWith("/")) {
      throw new Error("invalid_path");
    }

    const eventDoc = {
      siteId,
      ts: Timestamp.fromDate(ts),
      anonId: payload.anonId,
      sessionId: payload.sessionId,
      url: payload.url?.slice(0, 2048) ?? null,
      path: payload.path.slice(0, 512),
      referrer: payload.referrer?.slice(0, 2048) ?? null,
      ua: payload.ua?.slice(0, 512) ?? null,
      meta: payload.meta ?? null,
      createdAt: FieldValue.serverTimestamp(),
      bot: false,
      country: null,
    };

    const batch = this.db.batch();
    const eventsRef = this.db.collection("events").doc();
    batch.set(eventsRef, eventDoc);

    const minuteStart = floorDate(ts, "minute");
    const bucketStart = toTimestamp(minuteStart);
    const bucketIso = iso(minuteStart);

    const rollupsMinute = this.db.collection("rollups_minute");

    for (const path of ["__all__", payload.path]) {
      const docId = `${siteId}|${path}|${bucketIso}`;
      const docRef = rollupsMinute.doc(docId);
      await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists
          ? snap.data()
          : {
              siteId,
              path,
              bucketStart,
              bucketStartIso: bucketIso,
              views: 0,
              uniques: 0,
              uniqueIds: [] as string[],
              hll: null as string | null,
              updatedAt: bucketStart,
            };

        let uniqueIds: string[] | undefined = Array.isArray(data.uniqueIds) ? data.uniqueIds.slice(0, UNIQUE_CAP) : undefined;
        let sketch = typeof data.hll === "string" && data.hll ? TinyHLL.fromBase64(data.hll) : null;
        let uniques = typeof data.uniques === "number" ? data.uniques : 0;

        if (uniqueIds && uniqueIds.length < UNIQUE_CAP) {
          if (!uniqueIds.includes(payload.anonId)) {
            uniqueIds.push(payload.anonId);
          }
          uniques = uniqueIds.length;
          if (uniqueIds.length >= UNIQUE_CAP && !sketch) {
            sketch = TinyHLL.from(uniqueIds);
            uniqueIds = [];
          }
        } else {
          if (!sketch) {
            sketch = TinyHLL.from(uniqueIds ?? []);
            uniqueIds = [];
          }
          sketch.add(payload.anonId);
          uniques = sketch.count();
        }

        const update: Record<string, unknown> = {
          siteId,
          path,
          bucketStart,
          bucketStartIso: bucketIso,
          views: (data.views ?? 0) + 1,
          uniques,
          updatedAt: FieldValue.serverTimestamp(),
          hll: sketch ? sketch.toBase64() : null,
        };

        if (uniqueIds && uniqueIds.length > 0) {
          update.uniqueIds = uniqueIds;
        } else {
          update.uniqueIds = FieldValue.delete();
        }

        tx.set(docRef, update, { merge: true });
      });
    }

    await batch.commit();

    return { ok: true };
  }

  async getSummary(params: SummaryParams): Promise<Record<string, unknown>> {
    const { siteId, windowMs } = params;
    const now = new Date();
    const start = new Date(now.getTime() - windowMs);
    const minuteStart = floorDate(start, "minute");

    const docs = await this.queryRollups(siteId, minuteStart, now, "minute", params.path);
    const accumulator = new UniqueAccumulator();
    let views = 0;

    for (const doc of docs) {
      views += doc.views ?? 0;
      if (Array.isArray(doc.uniqueIds) && doc.uniqueIds.length > 0) {
        accumulator.addValues(doc.uniqueIds);
      } else if (doc.hll) {
        accumulator.addSketch(doc.hll);
      }
    }

    const topDocs = await this.queryRollups(siteId, minuteStart, now, "minute", params.path, true);
    const topPaths = await this.getTopFromDocs(siteId, minuteStart, now, params.path, topDocs, 5);

    const activeNow = await this.getActiveUsers(siteId, now, 5 * 60 * 1000);

    return {
      pageviews: views,
      unique_users: accumulator.count(),
      active_users_now: activeNow,
      top_paths: topPaths,
    };
  }

  private async getTopFromDocs(
    siteId: string,
    start: Date,
    end: Date,
    path: string | undefined,
    docs?: FirebaseFirestore.DocumentData[],
    limit = 20
  ) {
    const data = docs ?? (await this.queryRollups(siteId, start, end, "minute", path, true));
    const grouped = new Map<string, { views: number; uniques: UniqueAccumulator }>();
    for (const doc of data) {
      const docPath = doc.path;
      if (docPath === "__all__") {
        continue;
      }
      const entry = grouped.get(docPath) ?? { views: 0, uniques: new UniqueAccumulator() };
      entry.views += doc.views ?? 0;
      if (Array.isArray(doc.uniqueIds) && doc.uniqueIds.length > 0) {
        entry.uniques.addValues(doc.uniqueIds);
      } else if (doc.hll) {
        entry.uniques.addSketch(doc.hll);
      }
      grouped.set(docPath, entry);
    }

    const result = Array.from(grouped.entries())
      .map(([pathValue, value]) => ({ path: pathValue, views: value.views, uniques: value.uniques.count() }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
    return result;
  }

  async getTimeseries(params: TimeseriesParams): Promise<Array<Record<string, unknown>>> {
    const { siteId, windowMs, path, granularity } = params;
    const now = new Date();
    const start = floorDate(new Date(now.getTime() - windowMs), granularity);

    const docs = await this.queryRollups(siteId, start, now, granularity, path);
    const map = new Map<string, { views: number; uniques: UniqueAccumulator }>();

    for (const doc of docs) {
      const bucketIso = doc.bucketStartIso || doc.bucketStart?.toDate().toISOString();
      if (!bucketIso) {
        continue;
      }
      const entry = map.get(bucketIso) ?? { views: 0, uniques: new UniqueAccumulator() };
      entry.views += doc.views ?? 0;
      if (Array.isArray(doc.uniqueIds) && doc.uniqueIds.length > 0) {
        entry.uniques.addValues(doc.uniqueIds);
      } else if (doc.hll) {
        entry.uniques.addSketch(doc.hll);
      }
      map.set(bucketIso, entry);
    }

    const result: Array<Record<string, unknown>> = [];
    let cursor = start;
    const bucketStep = granularity === "minute" ? 60 * 1000 : granularity === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    while (cursor <= now) {
      const key = cursor.toISOString();
      const entry = map.get(key);
      result.push({
        t: key,
        views: entry?.views ?? 0,
        uniques: entry ? entry.uniques.count() : 0,
      });
      cursor = new Date(cursor.getTime() + bucketStep);
    }

    return result;
  }

  async getLive(params: SummaryParams): Promise<Record<string, unknown>> {
    const { siteId, windowMs, path } = params;
    const now = new Date();
    const start = new Date(now.getTime() - windowMs);
    const docs = await this.queryRollups(siteId, start, now, "minute", path);
    const buckets = docs
      .map((doc) => ({
        t: doc.bucketStartIso || doc.bucketStart?.toDate().toISOString(),
        views: doc.views ?? 0,
        uniques: doc.uniques ?? 0,
      }))
      .sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));

    const active = await this.getActiveUsers(siteId, now, 5 * 60 * 1000);

    return {
      buckets,
      active_users_now: active,
    };
  }

  async getTop(params: TopParams): Promise<Record<string, unknown>> {
    const { siteId, windowMs, path, limit } = params;
    const now = new Date();
    const start = new Date(now.getTime() - windowMs);
    const docs = await this.queryRollups(siteId, start, now, "minute", path, true);
    const grouped = await this.getTopFromDocs(siteId, start, now, path, docs, limit);
    return { paths: grouped };
  }

  private async queryRollups(
    siteId: string,
    start: Date,
    end: Date,
    granularity: Granularity,
    path?: string,
    includeAllPaths = false
  ): Promise<FirebaseFirestore.DocumentData[]> {
    const collection = this.db.collection(`rollups_${granularity}`);
    let query: FirebaseFirestore.Query = collection
      .where("siteId", "==", siteId)
      .where("bucketStart", ">=", toTimestamp(start))
      .where("bucketStart", "<=", toTimestamp(end));
    if (!includeAllPaths) {
      if (path) {
        query = query.where("path", "==", path);
      } else {
        query = query.where("path", "==", "__all__");
      }
    }
    const snap = await query.orderBy("bucketStart").get();
    return snap.docs.map((doc) => doc.data());
  }

  private async getActiveUsers(siteId: string, now: Date, windowMs: number): Promise<number> {
    const start = new Date(now.getTime() - windowMs);
    const snap = await this.db
      .collection("events")
      .where("siteId", "==", siteId)
      .where("ts", ">=", Timestamp.fromDate(start))
      .orderBy("ts", "desc")
      .get();
    const sessions = new Set<string>();
    snap.forEach((doc) => {
      const session = doc.get("sessionId");
      if (typeof session === "string") {
        sessions.add(session);
      }
    });
    return sessions.size;
  }

  async compactMinutesToHours(cutoffMinutes = 10): Promise<{ processed: number }> {
    const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);
    const collection = this.db.collection("rollups_minute");
    const snap = await collection.where("bucketStart", "<", cutoffTs).limit(500).get();

    if (snap.empty) {
      return { processed: 0 };
    }

    const groups = new Map<string, { siteId: string; path: string; hourStart: Date; docs: FirebaseFirestore.QueryDocumentSnapshot[] }>();

    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.compactedHour === true) {
        return;
      }
      const bucketDate: Date = data.bucketStart?.toDate?.() ?? new Date(data.bucketStartIso);
      const hourStartDate = floorDate(bucketDate, "hour");
      const hourKey = `${data.siteId}|${data.path}|${hourStartDate.toISOString()}`;
      const entry = groups.get(hourKey) ?? {
        siteId: data.siteId,
        path: data.path,
        hourStart: hourStartDate,
        docs: [],
      };
      entry.docs.push(doc);
      groups.set(hourKey, entry);
    });

    const batch = this.db.batch();
    let processed = 0;

    for (const group of groups.values()) {
      const hourRef = this.db.collection("rollups_hour").doc(`${group.siteId}|${group.path}|${group.hourStart.toISOString()}`);
      let views = 0;
      const hll = new TinyHLL();
      for (const doc of group.docs) {
        const data = doc.data();
        views += data.views ?? 0;
        if (Array.isArray(data.uniqueIds) && data.uniqueIds.length > 0) {
          for (const id of data.uniqueIds) {
            hll.add(id);
          }
        } else if (data.hll) {
          hll.merge(TinyHLL.fromBase64(data.hll));
        }
        batch.update(doc.ref, { compactedHour: true });
      }

      batch.set(
        hourRef,
        {
          siteId: group.siteId,
          path: group.path,
          bucketStart: Timestamp.fromDate(group.hourStart),
          bucketStartIso: group.hourStart.toISOString(),
          views,
          uniques: hll.count(),
          hll: hll.toBase64(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      processed += group.docs.length;
    }

    await batch.commit();
    return { processed };
  }

  async compactHoursToDays(): Promise<{ processed: number }> {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);
    const collection = this.db.collection("rollups_hour");
    const snap = await collection.where("bucketStart", "<", cutoffTs).limit(300).get();

    if (snap.empty) {
      return { processed: 0 };
    }

    const groups = new Map<string, { siteId: string; path: string; dayStart: Date; docs: FirebaseFirestore.QueryDocumentSnapshot[] }>();

    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.compactedDay === true) {
        return;
      }
      const bucketDate: Date = data.bucketStart?.toDate?.() ?? new Date(data.bucketStartIso);
      const dayStartDate = floorDate(bucketDate, "day");
      const key = `${data.siteId}|${data.path}|${dayStartDate.toISOString()}`;
      const entry = groups.get(key) ?? {
        siteId: data.siteId,
        path: data.path,
        dayStart: dayStartDate,
        docs: [],
      };
      entry.docs.push(doc);
      groups.set(key, entry);
    });

    const batch = this.db.batch();
    let processed = 0;

    for (const group of groups.values()) {
      const dayRef = this.db.collection("rollups_day").doc(`${group.siteId}|${group.path}|${group.dayStart.toISOString()}`);
      const hll = new TinyHLL();
      let views = 0;
      for (const doc of group.docs) {
        const data = doc.data();
        views += data.views ?? 0;
        if (data.hll) {
          hll.merge(TinyHLL.fromBase64(data.hll));
        }
        batch.update(doc.ref, { compactedDay: true });
      }

      batch.set(
        dayRef,
        {
          siteId: group.siteId,
          path: group.path,
          bucketStart: Timestamp.fromDate(group.dayStart),
          bucketStartIso: group.dayStart.toISOString(),
          views,
          uniques: hll.count(),
          hll: hll.toBase64(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      processed += group.docs.length;
    }

    await batch.commit();
    return { processed };
  }
}
