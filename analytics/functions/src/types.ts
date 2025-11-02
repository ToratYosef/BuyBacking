import { Timestamp } from "firebase-admin/firestore";

export type Granularity = "minute" | "hour" | "day";

export interface PageviewPayload {
  siteId: string;
  ts?: string;
  url?: string;
  path: string;
  referrer?: string | null;
  anonId: string;
  sessionId: string;
  ua?: string;
  meta?: Record<string, unknown> | null;
}

export interface RollupDoc {
  siteId: string;
  path: string;
  bucketStart: Timestamp;
  bucketStartIso: string;
  views: number;
  uniques: number;
  uniqueIds?: string[];
  hll?: string | null;
  updatedAt: Timestamp;
  compactedHour?: boolean;
  compactedDay?: boolean;
}

export interface SummaryParams {
  siteId: string;
  windowMs: number;
  path?: string;
}

export interface TimeseriesParams extends SummaryParams {
  granularity: Granularity;
}

export interface TopParams extends SummaryParams {
  limit: number;
}
