"use strict";

const { Timestamp } = require("firebase-admin/firestore");

function parseWindow(value, fallbackMs) {
  if (!value) {
    return fallbackMs;
  }
  const match = /^(\d+)([mhd])$/i.exec(value.trim());
  if (!match) {
    return fallbackMs;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
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

function floorDate(date, granularity) {
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

function addToDate(date, granularity, amount) {
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

function toTimestamp(date) {
  return Timestamp.fromDate(date);
}

function iso(date) {
  return date.toISOString();
}

function selectGranularity(windowMs, requested) {
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

function ensurePath(path) {
  if (!path) {
    return "";
  }
  if (!path.startsWith("/")) {
    return "";
  }
  return path;
}

function bucketCount(start, end, granularity) {
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

function clamp(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

module.exports = {
  parseWindow,
  floorDate,
  addToDate,
  toTimestamp,
  iso,
  selectGranularity,
  ensurePath,
  bucketCount,
  clamp,
};
