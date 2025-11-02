import { Timestamp } from "firebase-admin/firestore";
import { Granularity } from "./types";

export function parseWindow(value: string | undefined, fallbackMs: number): number {
  if (!value) {
    return fallbackMs;
  }
  const match = /^(\d+)([mhd])$/i.exec(value.trim());
  if (!match) {
    return fallbackMs;
  }
  const [, amountRaw, unitRaw] = match;
  const amount = Number(amountRaw);
  const unit = unitRaw.toLowerCase();
  if (Number.isNaN(amount) || amount <= 0) {
    return fallbackMs;
  }
  switch (unit) {
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

export function floorDate(date: Date, granularity: Granularity): Date {
  const copy = new Date(date);
  copy.setUTCSeconds(0, 0);
  if (granularity === "hour") {
    copy.setUTCMinutes(0);
  }
  if (granularity === "day") {
    copy.setUTCHours(0, 0, 0, 0);
  }
  return copy;
}

export function addToDate(date: Date, granularity: Granularity, amount: number): Date {
  const copy = new Date(date);
  if (granularity === "minute") {
    copy.setUTCMinutes(copy.getUTCMinutes() + amount);
  } else if (granularity === "hour") {
    copy.setUTCHours(copy.getUTCHours() + amount);
  } else {
    copy.setUTCDate(copy.getUTCDate() + amount);
  }
  return copy;
}

export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function selectGranularity(windowMs: number, requested?: string | null): Granularity {
  if (requested === "minute" || requested === "hour" || requested === "day") {
    return requested;
  }
  const twoHours = 2 * 60 * 60 * 1000;
  const fortyEightHours = 48 * 60 * 60 * 1000;
  if (windowMs <= twoHours) {
    return "minute";
  }
  if (windowMs <= fortyEightHours) {
    return "hour";
  }
  return "day";
}

export function ensurePath(path: string | undefined): string {
  if (!path) {
    return "";
  }
  if (!path.startsWith("/")) {
    return "";
  }
  return path;
}

export function bucketCount(start: Date, end: Date, granularity: Granularity): number {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const step =
    granularity === "minute"
      ? 60 * 1000
      : granularity === "hour"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((endTime - startTime) / step));
}

export function clamp<T>(value: T | undefined, fallback: T): T {
  return value === undefined || value === null ? fallback : value;
}
