const functions = require("firebase-functions/v1");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin"); // <-- Required here
const axios = require("axios");
const nodemailer = require("nodemailer");
const { URLSearchParams } = require('url');
const { randomUUID } = require("crypto");
const { generateCustomLabelPdf, generateBagLabelPdf, mergePdfBuffers } = require('./helpers/pdf');
const { DEFAULT_CARRIER_CODE, buildKitTrackingUpdate } = require('./helpers/shipengine');
const wholesaleRouter = require('./routes/wholesale'); // <-- wholesale.js is loaded here
const db = admin.firestore();
const ordersCollection = db.collection("orders");
const usersCollection = db.collection("users");
const adminsCollection = db.collection("admins"); // This collection should only contain manually designated admin UIDs
const chatsCollection = db.collection("chats");

const app = express();

const allowedOrigins = [
  "https://toratyosef.github.io",
  "https://buyback-a0f05.web.app",
  "https://secondhandcell.com",
  "https://www.secondhandcell.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use('/wholesale', wholesaleRouter);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const EMAIL_LOGO_URL =
  "https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/assets/logo.png";
const COUNTDOWN_NOTICE_TEXT =
  "If we don't hear back within 7 days, we'll automatically requote your device at 75% less to keep your order moving.";
const TRUSTPILOT_REVIEW_LINK = "https://www.trustpilot.com/evaluate/secondhandcell.com";
const TRUSTPILOT_STARS_IMAGE_URL = "https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-5.png";
function buildCountdownNoticeHtml() {
  return `
    <div style="margin-top: 24px; padding: 18px 20px; background-color: #ecfdf5; border-radius: 12px; border: 1px solid #bbf7d0; color: #065f46; font-size: 17px; line-height: 1.6;">
      <strong style="display:block; font-size:18px; margin-bottom:8px;">Friendly reminder</strong>
      If we don't hear back within <strong>7 days</strong>, we'll automatically requote your device at <strong>75% less</strong> to keep your order moving.
    </div>
  `;
}

function appendCountdownNotice(text = "") {
  const trimmed = text.trim();
  if (!trimmed) {
    return COUNTDOWN_NOTICE_TEXT;
  }
  if (trimmed.includes(COUNTDOWN_NOTICE_TEXT)) {
    return trimmed;
  }
  return `${trimmed}\n\n${COUNTDOWN_NOTICE_TEXT}`;
}

const PHONECHECK_DEFAULT_BASE_URL =
  "https://clientapiv2.phonecheck.com/cloud/cloudDB/";
const PHONECHECK_DEFAULT_API_URL = `${PHONECHECK_DEFAULT_BASE_URL}CheckEsn/`;
const PHONECHECK_FALLBACK_API_KEY = "9cdbc7a1-1b9c-44ae-a98085104c71ea3e";
const PHONECHECK_FALLBACK_USERNAME = "Kai2";
const PHONECHECK_ENDPOINT_PATHS = {
  deviceInfo: "GetDeviceInfo/",
  checkEsn: "CheckEsn/",
  carrierLock: "CheckCarrierLock/",
};
const PHONECHECK_CARRIER_ALIASES = {
  att: "AT&T",
  "at&t": "AT&T",
  tmobile: "T-Mobile",
  "t-mobile": "T-Mobile",
  tmob: "T-Mobile",
  sprint: "Sprint",
  verizon: "Verizon",
  unlocked: "Unlocked",
  blacklist: "Blacklist",
  "black list": "Blacklist",
};
const PHONECHECK_ALLOWED_CARRIERS = new Set([
  "AT&T",
  "T-Mobile",
  "Sprint",
  "Verizon",
  "Unlocked",
  "Blacklist",
]);

const AUTO_REQUOTE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_CANCEL_DELAY_MS = 15 * 24 * 60 * 60 * 1000;
const AUTO_CANCEL_MONITORED_STATUSES = [
  "order_pending",
  "shipping_kit_requested",
  "kit_needs_printing",
  "kit_sent",
  "kit_in_transit",
  "label_generated",
  "emailed",
];

function ensureTrailingSlash(url = "") {
  if (!url) {
    return "/";
  }
  return url.endsWith("/") ? url : `${url}/`;
}

function resolvePhoneCheckBaseUrl(url) {
  if (!url) {
    return PHONECHECK_DEFAULT_BASE_URL;
  }
  const trimmed = url.toString().trim();
  if (!trimmed) {
    return PHONECHECK_DEFAULT_BASE_URL;
  }
  const normalized = ensureTrailingSlash(trimmed);
  const base = normalized.replace(
    /(CheckEsn|GetDeviceInfo|CheckCarrierLock)\/?$/i,
    ""
  );
  const resolved = base || PHONECHECK_DEFAULT_BASE_URL;
  return ensureTrailingSlash(resolved);
}

function getPhoneCheckConfig() {
  const config = {
    apiUrl: process.env.PHONECHECK_API_URL || PHONECHECK_DEFAULT_API_URL,
    apiKey: process.env.PHONECHECK_API_KEY || null,
    username: process.env.PHONECHECK_USERNAME || null,
    checkAll: process.env.PHONECHECK_CHECK_ALL,
  };

  try {
    const runtimeConfig = functions.config();
    if (runtimeConfig && runtimeConfig.phonecheck) {
      const phonecheck = runtimeConfig.phonecheck;
      config.apiUrl =
        phonecheck.api_url ||
        phonecheck.apiurl ||
        phonecheck.url ||
        config.apiUrl;
      config.apiKey =
        phonecheck.api_key ||
        phonecheck.apikey ||
        phonecheck.key ||
        config.apiKey;
      config.username =
        phonecheck.username || phonecheck.user || config.username;
      if (phonecheck.check_all !== undefined) {
        config.checkAll = phonecheck.check_all;
      }
    }
  } catch (error) {
    console.warn(
      "Unable to read functions.config().phonecheck values:",
      error.message
    );
  }

  if (!config.apiKey) {
    config.apiKey = PHONECHECK_FALLBACK_API_KEY;
  }
  if (!config.username) {
    config.username = PHONECHECK_FALLBACK_USERNAME;
  }
  if (!config.apiUrl) {
    config.apiUrl = PHONECHECK_DEFAULT_API_URL;
  }

  config.baseUrl = resolvePhoneCheckBaseUrl(config.apiUrl);
  config.endpoints = {
    deviceInfo: `${config.baseUrl}${PHONECHECK_ENDPOINT_PATHS.deviceInfo}`,
    checkEsn: `${config.baseUrl}${PHONECHECK_ENDPOINT_PATHS.checkEsn}`,
    carrierLock: `${config.baseUrl}${PHONECHECK_ENDPOINT_PATHS.carrierLock}`,
  };

  return config;
}

const CONDITION_EMAIL_FROM_ADDRESS =
  process.env.CONDITION_EMAIL_FROM ||
  process.env.EMAIL_FROM ||
  process.env.EMAIL_USER ||
  "no-reply@secondhandcell.com";

const CONDITION_EMAIL_BCC_RECIPIENTS = (process.env.CONDITION_EMAIL_BCC ||
  process.env.SALES_EMAIL ||
  "sales@secondhandcell.com")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const CONDITION_EMAIL_TEMPLATES = {
  outstanding_balance: {
    subject: "Action Required: Outstanding Balance Detected",
    headline: "Outstanding balance detected",
    message:
      "Our ESN verification shows the carrier still reports an outstanding balance tied to this device.",
    steps: [
      "Contact your carrier to clear the remaining balance on the device.",
      "Reply to this email with confirmation so we can re-run the check and release your payout.",
    ],
  },
  password_locked: {
    subject: "Device Locked: Action Needed",
    headline: "Device is password or account locked",
    message:
      "The device arrived locked with a password, pattern, or linked account which prevents testing and data removal.",
    steps: [
      "Send us the any passcode, password, PIN, or pattern required to unlock the device so that we can properly inspect it amd data wipe it.",
      "Reply to this email once the lock has been cleared so we can finish processing the order.",
    ],
  },
  stolen: {
    subject: "Important: Device Reported Lost or Stolen",
    headline: "Device flagged as lost or stolen",
    message:
      "The carrier database has flagged this ESN/IMEI as lost or stolen, so we cannot complete the buyback.",
    steps: [
      "If you believe this is an error, please contact your carrier to remove the flag.",
      "Provide any supporting documentation by replying to this email so we can review and re-run the check.",
    ],
  },
  fmi_active: {
    subject: "Find My / Activation Lock Detected",
    headline: "Find My or activation lock is still enabled",
    message:
      "The device still has Find My iPhone / Activation Lock (or the Android equivalent) enabled, which prevents refurbishment.",
    steps: [
      "Disable the lock from the device or from iCloud/Google using your account.",
      "Remove the device from your trusted devices list.",
      "Reply to this email once the lock has been removed so we can verify and continue.",
    ],
  },
};

function getGreetingName(fullName) {
  if (!fullName || typeof fullName !== "string") {
    return "there";
  }
  const [first] = fullName.trim().split(/\s+/);
  return first || "there";
}

function buildConditionEmail(reason, order, notes) {
  const template = CONDITION_EMAIL_TEMPLATES[reason];
  if (!template) {
    throw new Error("Unsupported condition email template.");
  }

  const shippingInfo = order && order.shippingInfo ? order.shippingInfo : {};
  const customerName = shippingInfo.fullName || shippingInfo.name || null;
  const greetingName = getGreetingName(customerName);
  const orderId = (order && order.id) || "your order";
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

  const noteHtml = trimmedNotes
    ? `<p style="margin-top:16px;"><strong>Additional details from our technician:</strong><br>${escapeHtml(
        trimmedNotes
      ).replace(/\n/g, "<br>")}</p>`
    : "";
  const noteText = trimmedNotes
    ? `\n\nAdditional details from our technician:\n${trimmedNotes}`
    : "";

  const steps = Array.isArray(template.steps) ? template.steps : [];
  const stepsHtml = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const stepsText = steps.map((step) => `• ${step}`).join("\n");

  const accentColorMap = {
    outstanding_balance: "#f97316",
    password_locked: "#6366f1",
    stolen: "#dc2626",
    fmi_active: "#f59e0b",
  };

  const bodyHtml = `
      <p>Hi ${escapeHtml(greetingName)},</p>
      <p>During our inspection of the device you sent in for order <strong>#${escapeHtml(orderId)}</strong>, we detected an issue:</p>
      <div style="background:#fff7ed; border-radius:14px; border:1px solid #fde68a; padding:18px 22px; margin:24px 0; color:#7c2d12;">
        <strong>${escapeHtml(template.headline)}</strong>
        <p style="margin:12px 0 0; color:#7c2d12;">${escapeHtml(template.message)}</p>
      </div>
      <p style="margin-bottom:16px;">Here's what to do next:</p>
      <ul style="padding-left:22px; color:#475569; margin:0 0 24px;">
        ${stepsHtml}
      </ul>
      ${noteHtml}
      <p>Reply to this email once you've taken care of the issue so we can recheck your device and keep your payout moving.</p>
  `;

  const html = buildEmailLayout({
    title: template.headline,
    accentColor: accentColorMap[reason] || "#0ea5e9",
    bodyHtml,
  });

  const text = appendCountdownNotice(`Hi ${greetingName},

During our inspection of the device you sent in for order #${orderId}, we detected an issue:

${template.headline}

${template.message}

${stepsText}${noteText}

Please reply to this email once the issue has been resolved so we can continue processing your payout.

Thank you,
SecondHandCell Team`);

  return { subject: template.subject, html, text };
}

function collectStrings(value, bucket) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      bucket.push(trimmed);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, bucket));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((entry) => collectStrings(entry, bucket));
  }
}

function normalizeKey(key) {
  return key.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractDisplayValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractDisplayValue(entry);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "response")) {
      return extractDisplayValue(value.response);
    }
    const bucket = [];
    collectStrings(value, bucket);
    return bucket.length ? bucket[0] : null;
  }
  return null;
}

function findFieldValue(data, keys) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const targets = keys.map(normalizeKey);
  const targetSet = new Set(targets);
  const stack = [data];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (Array.isArray(current)) {
      for (const entry of current) {
        if (entry && typeof entry === "object") {
          stack.push(entry);
        }
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = normalizeKey(key);
      if (targetSet.has(normalizedKey)) {
        const extracted = extractDisplayValue(value);
        if (extracted) {
          return extracted;
        }
      }
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return null;
}

function interpretBlacklistStatus(value) {
  const text = value ? String(value).trim() : "";
  if (!text) {
    return { status: "", isBlacklisted: null };
  }
  const normalized = text.toLowerCase();
  if (/(yes|blacklisted|barred|blocked|lost|stolen|fraud)/.test(normalized)) {
    return { status: text, isBlacklisted: true };
  }
  if (/(no|clear|clean|good|not blacklisted)/.test(normalized)) {
    return { status: text, isBlacklisted: false };
  }
  return { status: text, isBlacklisted: null };
}

function interpretLockStatus(value) {
  const text = value ? String(value).trim() : "";
  if (!text) {
    return { status: "", isLocked: null };
  }
  const normalized = text.toLowerCase();
  if (/(locked|yes|active|engaged)/.test(normalized) && !/(unlocked|no lock|not locked)/.test(normalized)) {
    return { status: text, isLocked: true };
  }
  if (/(unlocked|no|not locked|clear|clean)/.test(normalized)) {
    return { status: text, isLocked: false };
  }
  return { status: text, isLocked: null };
}

function analyzePhoneCheckResponse(data) {
  const strings = [];
  collectStrings(data, strings);

  const normalized = [];
  strings.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      normalized.push(trimmed);
    }
  });

  const cleanSignals = normalized.filter((value) => /\b(clean|clear)\b/i.test(value));

  const issuePatterns = [
    { regex: /balance|due|finance|owed|unpaid/i, label: "Outstanding balance reported" },
    { regex: /lock|locked|simlock|carrier lock|account lock/i, label: "Carrier or account lock detected" },
    { regex: /lost|stolen|fraud|blacklist|barred|blocked|hotlist/i, label: "Reported lost or stolen" },
    { regex: /icloud|find my|fmi|activation lock/i, label: "Find My / activation lock active" },
    { regex: /password|passcode|pin lock|screen lock/i, label: "Password or passcode lock detected" },
  ];

  const issues = new Set();
  normalized.forEach((value) => {
    issuePatterns.forEach((pattern) => {
      if (pattern.regex.test(value)) {
        issues.add(pattern.label);
      }
    });
  });

  const deviceModel = findFieldValue(data, ["model", "modelname", "devicemodel"]);
  const deviceMemory = findFieldValue(data, ["memory", "storage", "capacity", "size"]);
  const deviceColor = findFieldValue(data, ["color", "colour", "devicecolor"]);
  const carrierName = findFieldValue(data, ["carrier", "network", "carriername"]);
  const simlockStatus = interpretLockStatus(
    findFieldValue(data, ["simlock", "sim_lock", "carrierlock", "lockstatus", "simstatus"])
  );
  const blacklistStatus = interpretBlacklistStatus(
    findFieldValue(data, ["blackliststatus", "blacklist", "esnstatus", "blockedstatus"])
  );

  if (blacklistStatus.isBlacklisted === true) {
    issues.add("Reported lost or stolen (blacklisted)");
  }
  if (simlockStatus.isLocked === true) {
    issues.add("Carrier or SIM lock detected");
  }

  const detailsNotices = [];
  if (deviceModel) {
    detailsNotices.push(`Model: ${deviceModel}`);
  }
  if (deviceMemory) {
    detailsNotices.push(`Memory: ${deviceMemory}`);
  }
  if (deviceColor) {
    detailsNotices.push(`Color: ${deviceColor}`);
  }
  if (blacklistStatus.status) {
    detailsNotices.push(`Blacklist: ${blacklistStatus.status}`);
  }
  if (carrierName) {
    detailsNotices.push(`Carrier: ${carrierName}`);
  }
  if (simlockStatus.status) {
    detailsNotices.push(`SIM Lock: ${simlockStatus.status}`);
  }

  let statusText =
    (blacklistStatus.isBlacklisted === true && "Device is blacklisted.") ||
    (simlockStatus.isLocked === true && "Carrier lock detected.") ||
    cleanSignals[0] ||
    normalized.find((value) => /status|result/i.test(value.toLowerCase())) ||
    normalized[0] ||
    "No status returned.";

  const notices = [...detailsNotices, ...normalized].filter(Boolean).slice(0, 6);

  let isClean = cleanSignals.length > 0 && issues.size === 0;
  if (blacklistStatus.isBlacklisted === true || simlockStatus.isLocked === true) {
    isClean = false;
  } else if (
    blacklistStatus.isBlacklisted === false &&
    (simlockStatus.isLocked === false || simlockStatus.isLocked === null) &&
    issues.size === 0
  ) {
    isClean = true;
    statusText = statusText || "No issues detected.";
  }

  if (!isClean && issues.size === 0) {
    const firstNonClean = normalized.find((value) => !/clean|clear/i.test(value));
    if (firstNonClean) {
      issues.add(firstNonClean);
    }
  }

  return {
    isClean,
    statusText,
    reasons: Array.from(issues),
    notices,
    messages: normalized,
    deviceInfo: {
      model: deviceModel || "",
      memory: deviceMemory || "",
      color: deviceColor || "",
    },
    blacklist: blacklistStatus,
    carrierLock: {
      carrier: carrierName || "",
      simlock: simlockStatus.status,
      isLocked: simlockStatus.isLocked,
    },
  };
}

const SHIPENGINE_API_BASE_URL = "https://api.shipengine.com/v1";
const AUTO_VOID_DELAY_MS = 15 * 24 * 60 * 60 * 1000; // 15 days
const AUTO_VOID_QUERY_LIMIT = 50;
const AUTO_VOID_RETRY_DELAY_MS = 12 * 60 * 60 * 1000; // 12 hours between automatic retry attempts

function getShipEngineApiKey() {
  try {
    if (functions.config().shipengine && functions.config().shipengine.key) {
      return functions.config().shipengine.key;
    }
  } catch (error) {
    console.warn("Unable to read functions.config().shipengine.key:", error.message);
  }
  return process.env.SHIPENGINE_KEY || null;
}

function getLabelVoidNotificationEmail() {
  try {
    if (
      functions.config().notifications &&
      functions.config().notifications.void_labels_to
    ) {
      return functions.config().notifications.void_labels_to;
    }
    if (functions.config().email && functions.config().email.user) {
      return functions.config().email.user;
    }
  } catch (error) {
    console.warn("Unable to read notification email config:", error.message);
  }
  return (
    process.env.LABEL_VOID_NOTIFICATIONS_TO ||
    process.env.VOID_NOTIFICATION_EMAIL ||
    process.env.EMAIL_USER ||
    null
  );
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
    }
    if (typeof value._seconds === "number") {
      return new Date(
        value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)
      );
    }
  }
  return null;
}

function cloneShipEngineLabelMap(labels) {
  const clone = {};
  if (!labels || typeof labels !== "object") {
    return clone;
  }
  Object.entries(labels).forEach(([key, value]) => {
    clone[key] = value && typeof value === "object" ? { ...value } : value;
  });
  return clone;
}

function formatLabelDisplayNameFromKey(key) {
  if (!key) return "Shipping Label";
  const normalizedKey = key.toString().toLowerCase();
  if (normalizedKey === "inbound") return "Inbound Shipping Label";
  if (normalizedKey === "outbound") return "Outbound Shipping Label";
  if (normalizedKey === "primary") return "Primary Shipping Label";
  if (normalizedKey === "email") return "Email Shipping Label";
  return key
    .toString()
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeShipEngineLabelMap(order) {
  const labels = cloneShipEngineLabelMap(order.shipEngineLabels);
  if (!Object.keys(labels).length && order.shipEngineLabelId) {
    labels.primary = {
      id: order.shipEngineLabelId,
      status: order.labelVoidStatus || "active",
      message: order.labelVoidMessage || null,
      trackingNumber: order.trackingNumber || null,
      generatedAt:
        order.labelGeneratedAt || order.kitLabelGeneratedAt || order.createdAt || null,
      displayName: "Primary Shipping Label",
    };
  }
  return labels;
}

function getLabelStatus(entry) {
  if (!entry) return "";
  const status = entry.status || entry.voidStatus || entry.state || "active";
  return status.toString().toLowerCase();
}

function isLabelPendingVoid(entry) {
  const status = getLabelStatus(entry);
  return !["voided", "void_denied"].includes(status);
}

function buildLabelIdList(labelMap) {
  return Object.values(labelMap)
    .map((entry) => (entry && entry.id ? entry.id : null))
    .filter(Boolean);
}

async function requestShipEngineVoid(labelId, shipengineKey) {
  const url = `${SHIPENGINE_API_BASE_URL}/labels/${encodeURIComponent(labelId)}/void`;
  const response = await axios.put(
    url,
    {},
    {
      headers: {
        "API-Key": shipengineKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );
  return response.data || {};
}

async function sendVoidNotificationEmail(order, results, options = {}) {
  const recipient = getLabelVoidNotificationEmail();
  if (!recipient) {
    console.warn("Void notification email skipped: no recipient configured.");
    return;
  }

  const approvedResults = results.filter((result) => result.approved);
  if (!approvedResults.length) {
    return;
  }

  const createdAtDate = toDate(order.createdAt);
  let ageDescription = "Unknown";
  if (createdAtDate) {
    const diffMs = Date.now() - createdAtDate.getTime();
    const days = diffMs / (24 * 60 * 60 * 1000);
    ageDescription = `${days.toFixed(1)} days`;
  }

  const reasonKey = options.reason === "automatic" ? "automatic" : "manual";
  const subject = `Shipping label voided for order ${order.id}`;
  const lines = approvedResults.map((result) => {
    const labelName = formatLabelDisplayNameFromKey(result.key);
    return `• ${labelName} (ID: ${result.labelId})${
      result.message ? ` – ${result.message}` : ""
    }`;
  });

  const introText =
    reasonKey === "automatic"
      ? "We've automatically voided the prepaid shipping label for your order because it's been a while since we heard from you."
      : "We've voided the prepaid shipping label for your order as requested.";

  const followUpText =
    "If you'd still like to send your device in, reply to this email and we'll send a fresh label right away.";

  const textBody = [
    introText,
    `Order #: ${order.id}`,
    `Order age: ${ageDescription}.`,
    "",
    "Voided label(s):",
    ...lines,
    "",
    followUpText,
  ].join("\n");

  const htmlBody = buildEmailLayout({
    title: "Shipping label voided",
    accentColor: "#0ea5e9",
    includeTrustpilot: false,
    bodyHtml: `
      <p>${
        reasonKey === "automatic"
          ? "We've automatically voided the prepaid shipping label for your order because it's been a while since we heard from you."
          : "We've voided the prepaid shipping label for your order as requested."
      }</p>
      <p>Order number: <strong>#${order.id}</strong></p>
      <p>Order age: <strong>${ageDescription}</strong>.</p>
      <p style="margin-bottom:12px;">Voided label(s):</p>
      <ul style="padding-left:22px; color:#475569;">
        ${lines.map((line) => `<li>${escapeHtml(line.substring(2))}</li>`).join("\n")}
      </ul>
      <p style="margin-top:20px;">If you'd still like to send your device in, reply to this email and we'll send a fresh label right away.</p>
    `,
  });

  await transporter.sendMail({
    from: `SecondHandCell <${process.env.EMAIL_USER}>`,
    to: recipient,
    subject,
    text: textBody,
    html: htmlBody,
  });
}

async function handleLabelVoid(order, selections, options = {}) {
  if (!order || !order.id) {
    throw new Error("Order context is required to void labels.");
  }

  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error("At least one label must be selected for voiding.");
  }

  const shipengineKey = options.shipengineKey || getShipEngineApiKey();
  if (!shipengineKey) {
    throw new Error(
      "ShipEngine API key not configured. Please set 'shipengine.key' or SHIPENGINE_KEY."
    );
  }

  const nowTimestamp = admin.firestore.Timestamp.now();
  const labels = normalizeShipEngineLabelMap(order);
  const results = [];
  let changed = false;

  for (const selection of selections) {
    const key = selection && selection.key ? selection.key : null;
    if (!key) {
      results.push({
        key: null,
        labelId: null,
        approved: false,
        message: "Invalid label selection.",
      });
      continue;
    }

    const entry = labels[key] && typeof labels[key] === "object" ? { ...labels[key] } : {};
    const labelId = selection.id || entry.id || order.shipEngineLabelId || null;

    if (!labelId) {
      results.push({
        key,
        labelId: null,
        approved: false,
        message: "No label identifier found for selection.",
      });
      continue;
    }

    entry.displayName = entry.displayName || formatLabelDisplayNameFromKey(key);
    entry.id = labelId;

    const status = getLabelStatus(entry);
    if (["voided", "void_denied"].includes(status)) {
      results.push({
        key,
        labelId,
        approved: status === "voided",
        message:
          entry.message ||
          entry.voidMessage ||
          (status === "voided"
            ? "Label has already been voided."
            : "Label void request was previously denied."),
      });
      labels[key] = entry;
      continue;
    }

    try {
      const response = await requestShipEngineVoid(labelId, shipengineKey);
      const approved = Boolean(response.approved);
      const message = response.message || response.response_message || null;

      entry.status = approved ? "voided" : "void_denied";
      entry.voidStatus = entry.status;
      entry.message = message;
      entry.voidMessage = message;
      entry.voidedAt = approved ? nowTimestamp : entry.voidedAt || null;
      entry.lastVoidAttemptAt = nowTimestamp;
      if (options.reason === "automatic") {
        entry.autoVoidAttemptedAt = nowTimestamp;
      } else {
        entry.manualVoidAttemptedAt = nowTimestamp;
      }
      if (!entry.generatedAt) {
        entry.generatedAt =
          entry.createdAt || order.labelGeneratedAt || order.kitLabelGeneratedAt || order.createdAt || nowTimestamp;
      }

      labels[key] = entry;
      changed = true;
      results.push({ key, labelId, approved, message });
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.errors?.[0]?.message ||
        error.message ||
        "Failed to void label.";

      entry.status = "void_error";
      entry.voidStatus = entry.status;
      entry.message = message;
      entry.voidMessage = message;
      entry.lastVoidAttemptAt = nowTimestamp;
      if (options.reason === "automatic") {
        entry.autoVoidAttemptedAt = nowTimestamp;
      } else {
        entry.manualVoidAttemptedAt = nowTimestamp;
      }
      if (!entry.generatedAt) {
        entry.generatedAt =
          entry.createdAt || order.labelGeneratedAt || order.kitLabelGeneratedAt || order.createdAt || nowTimestamp;
      }

      labels[key] = entry;
      changed = true;
      results.push({ key, labelId, approved: false, message, error: true });
    }
  }

  const pendingCount = Object.values(labels).filter((entry) => entry && entry.id && isLabelPendingVoid(entry)).length;
  const labelIds = buildLabelIdList(labels);

  const updates = {
    shipEngineLabels: labels,
    shipEngineLabelsLastUpdatedAt: nowTimestamp,
    hasShipEngineLabel: labelIds.length > 0,
    hasActiveShipEngineLabel: pendingCount > 0,
    shipEngineLabelIds: labelIds,
  };

  if (labels.primary) {
    updates.shipEngineLabelId = labels.primary.id || null;
    updates.labelVoidStatus = labels.primary.status || null;
    updates.labelVoidMessage = labels.primary.message || null;
    if (labels.primary.voidedAt) {
      updates.labelVoidedAt = labels.primary.voidedAt;
    }
  }

  if (changed) {
    await updateOrderBoth(order.id, updates);
  }

  return { results, updates, changed };
}

async function cancelOrderAndNotify(order, options = {}) {
  if (!order || !order.id) {
    throw new Error("Order details are required to cancel an order.");
  }

  const reason = options.reason || "cancelled";
  const initiatedBy = options.initiatedBy || null;
  const auto = options.auto === true;
  const notifyCustomer = options.notifyCustomer !== false;
  const shouldVoidLabels = options.voidLabels !== false;

  const labels = normalizeShipEngineLabelMap(order);
  const selections = Object.entries(labels)
    .filter(([, entry]) => entry && entry.id && isLabelPendingVoid(entry))
    .map(([key, entry]) => ({ key, id: entry.id }));

  let voidResults = [];
  if (shouldVoidLabels && selections.length) {
    try {
      const { results } = await handleLabelVoid(order, selections, {
        reason: auto ? "automatic" : "manual",
        shipengineKey: options.shipengineKey,
      });
      voidResults = results;
    } catch (error) {
      console.error(`Failed to void labels while cancelling order ${order.id}:`, error);
    }
  }

  const logEntries = [
    {
      type: "cancellation",
      message: auto
        ? "Order automatically cancelled after extended inactivity."
        : `Order cancelled${initiatedBy ? ` by ${initiatedBy}` : ""}.`,
      metadata: {
        reason,
        auto,
        labelsVoided: voidResults.filter((result) => result.approved).map((result) => result.labelId),
      },
    },
  ];

  const updatePayload = {
    status: "cancelled",
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelReason: reason,
    cancelRequestedBy: initiatedBy,
    autoCancelled: auto,
  };

  if (shouldVoidLabels && voidResults.length) {
    updatePayload.cancelVoidResults = voidResults;
  }

  const { order: updatedOrder } = await updateOrderBoth(order.id, updatePayload, {
    logEntries,
  });

  if (notifyCustomer && updatedOrder?.shippingInfo?.email) {
    const customerName = updatedOrder.shippingInfo.fullName || "there";
    const introMessage = auto
      ? "has been cancelled because we didn’t receive your device within 15 days."
      : "has been cancelled as requested.";
    const followUp = auto
      ? "If you still plan to send it in, reply to this email and we’ll issue a fresh shipping label right away."
      : "If you change your mind, reply to this email and we can send a fresh shipping label.";

    const htmlBody = `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>Your order <strong>#${escapeHtml(order.id)}</strong> ${introMessage}</p>
      <p>${followUp}</p>
      <p>We’re happy to help with any questions.</p>
      <p>— The SecondHandCell Team</p>
    `;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: updatedOrder.shippingInfo.email,
        subject: `Order #${updatedOrder.id} has been cancelled`,
        html: htmlBody,
        bcc: [process.env.SALES_EMAIL || "sales@secondhandcell.com"],
      });
    } catch (emailError) {
      console.error(`Failed to send cancellation email for order ${order.id}:`, emailError);
    }
  }

  return { order: updatedOrder, voidResults };
}

// --- EMAIL HTML Templates (unchanged from your version) ---
const SHIPPING_LABEL_EMAIL_HTML = buildEmailLayout({
  title: "Your Shipping Label is Ready!",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>Your shipping label for order <strong>#**ORDER_ID**</strong> is ready to go.</p>
      <p style="margin-bottom:28px;">Use the secure button below to download it instantly and get your device on the way to us.</p>
      <div style="text-align:center; margin-bottom:32px;">
        <a href="**LABEL_DOWNLOAD_LINK**" class="button-link">Download Shipping Label</a>
      </div>
      <div style="background:#f8fafc; border:1px solid #dbeafe; border-radius:14px; padding:20px 24px;">
        <p style="margin:0 0 10px;"><strong style="color:#0f172a;">Tracking Number</strong><br><span style="color:#2563eb; font-weight:600;">**TRACKING_NUMBER**</span></p>
        <p style="margin:0; color:#475569;">Drop your device off with your preferred carrier as soon as you're ready.</p>
      </div>
      <p style="margin-top:28px;">Need a hand? Reply to this email and our team will guide you.</p>
  `,
});
const SHIPPING_KIT_EMAIL_HTML = buildEmailLayout({
  title: "Your Shipping Kit is on its Way!",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>Your shipping kit for order <strong>#**ORDER_ID**</strong> is en route.</p>
      <p>Track its journey with the number below and get ready to pop your device inside once it arrives.</p>
      <div style="background:#f8fafc; border:1px solid #dbeafe; border-radius:14px; padding:20px 24px; margin:0 0 28px;">
        <p style="margin:0 0 10px;"><strong style="color:#0f172a;">Tracking Number</strong><br><span style="color:#2563eb; font-weight:600;">**TRACKING_NUMBER**</span></p>
        <p style="margin:0; color:#475569;">Keep an eye out for your kit and pack your device securely when it lands.</p>
      </div>
      <p>Have accessories you don't need? Feel free to include them—we'll recycle responsibly.</p>
      <p>Need anything else? Just reply to this email.</p>
  `,
});
const ORDER_RECEIVED_EMAIL_HTML = buildEmailLayout({
  title: "We've received your order!",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>Thanks for choosing SecondHandCell! We've logged your order for <strong>**DEVICE_NAME**</strong>.</p>
      <p>Your order ID is <strong style="color:#2563eb;">#**ORDER_ID**</strong>. Keep it handy for any questions.</p>
      <h2 style="font-size:20px; color:#0f172a; margin:32px 0 12px;">Before you ship</h2>
      <ul style="padding-left:22px; margin:0 0 20px; color:#475569;">
        <li style="margin-bottom:10px;"><strong>Backup your data</strong> so nothing personal is lost.</li>
        <li style="margin-bottom:10px;"><strong>Factory reset</strong> the device to wipe personal info.</li>
        <li style="margin-bottom:10px;"><strong>Remove accounts</strong> such as Apple ID/iCloud or Google/Samsung accounts.<br><span style="display:block; margin-top:6px; margin-left:10px;">• Turn off Find My iPhone (FMI).<br>• Disable Factory Reset Protection (FRP) on Android.</span></li>
        <li style="margin-bottom:10px;"><strong>Remove SIM cards</strong> and eSIM profiles.</li>
        <li style="margin-bottom:10px;"><strong>Pack accessories separately</strong> unless we specifically request them.</li>
      </ul>
      <div style="background:#fef3c7; border-radius:16px; padding:18px 22px; border:1px solid #fde68a; color:#92400e; margin:30px 0;">
        <strong>Important:</strong> We can't process devices that still have FMI/FRP enabled, an outstanding balance, or a blacklist/lost/stolen status.
      </div>
      **SHIPPING_INSTRUCTION**
  `,
});
const DEVICE_RECEIVED_EMAIL_HTML = buildEmailLayout({
  title: "Your device has arrived!",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>Your device for order <strong style="color:#2563eb;">#**ORDER_ID**</strong> has landed at our facility.</p>
      <p>Our technicians are giving it a full inspection now. We'll follow up shortly with an update on your payout.</p>
      <p>Have questions while you wait? Just reply to this email—real humans are here to help.</p>
  `,
});
const ORDER_PLACED_ADMIN_EMAIL_HTML = buildEmailLayout({
  title: "New order submitted",
  accentColor: "#f97316",
  bodyHtml: `
      <p>Heads up! A new order just came in.</p>
      <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:16px; padding:22px 24px; margin-bottom:28px; color:#7c2d12;">
        <p style="margin:0 0 10px;"><strong>Customer</strong>: **CUSTOMER_NAME**</p>
        <p style="margin:0 0 10px;"><strong>Order ID</strong>: #**ORDER_ID**</p>
        <p style="margin:0 0 10px;"><strong>Device</strong>: **DEVICE_NAME**</p>
        <p style="margin:0;"><strong>Estimated Quote</strong>: $**ESTIMATED_QUOTE** • <strong>Shipping</strong>: **SHIPPING_PREFERENCE**</p>
      </div>
      <div style="text-align:center; margin-bottom:20px;">
        <a href="https://secondhandcell.com/admin" class="button-link" style="background-color:#f97316;">Open in Admin</a>
      </div>
      <p style="color:#475569;">This alert is automated—feel free to reply if you notice anything unusual.</p>
  `,
});
const BLACKLISTED_EMAIL_HTML = buildEmailLayout({
  title: "Action required: Carrier blacklist detected",
  accentColor: "#dc2626",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>During our review of order <strong>#**ORDER_ID**</strong>, the carrier database flagged the device as lost, stolen, or blacklisted.</p>
      <p>We can't release payment while this status is active. Please contact your carrier to remove the flag and reply with confirmation or documentation so we can re-run the check.</p>
      <p>If you believe this alert is an error, include any proof in your reply and we'll take another look.</p>
      <p style="color:#dc2626; font-size:15px;">**LEGAL_TEXT**</p>
  `,
});
const FMI_EMAIL_HTML = buildEmailLayout({
  title: "Turn off Find My to continue",
  accentColor: "#f59e0b",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>Our inspection for order <strong>#**ORDER_ID**</strong> shows Find My iPhone / Activation Lock is still enabled.</p>
      <p>Please complete the steps below so we can finish processing your payout:</p>
      <ol style="padding-left:22px; color:#475569; margin-bottom:20px;">
        <li>Visit <a href="https://icloud.com/find" target="_blank" style="color:#2563eb;">icloud.com/find</a> and sign in.</li>
        <li>Select the device you're selling.</li>
        <li>Choose “Remove from Account”.</li>
        <li>Confirm the device no longer appears in your list.</li>
      </ol>
      <div style="text-align:center; margin:32px 0 24px;">
        <a href="**CONFIRM_URL**" class="button-link" style="background-color:#f59e0b;">I've turned off Find My</a>
      </div>
      <p style="color:#b45309; font-size:15px;">Once it's disabled, click the button above or reply to this email so we can recheck your device.</p>
  `,
});
const BAL_DUE_EMAIL_HTML = buildEmailLayout({
  title: "Balance due with your carrier",
  accentColor: "#f97316",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>When we ran your device for order <strong>#**ORDER_ID**</strong>, the carrier reported a status of <strong>**FINANCIAL_STATUS**</strong>.</p>
      <p>Please contact your carrier to clear the balance and then reply to this email so we can rerun the check and keep your payout on track.</p>
      <p style="color:#c2410c;">Need help figuring out the right department to call? Let us know and we'll point you in the right direction.</p>
  `,
});
const DOWNGRADE_EMAIL_HTML = buildEmailLayout({
  title: "Order updated after 7 days",
  accentColor: "#f97316",
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>We reached out about the issue with your device for order <strong>#**ORDER_ID**</strong> but didn't hear back within seven days.</p>
      <p>To keep things moving, we've automatically requoted the device at 75% less than the original offer. If you resolve the issue, reply to this email and we'll happily re-evaluate.</p>
      <p>We're here to help—just let us know how you'd like to proceed.</p>
  `,
});

function getOrderCompletedEmailTemplate({ includeTrustpilot = true } = {}) {
  return buildEmailLayout({
    title: "🥳 Your order is complete!",
    includeTrustpilot,
    bodyHtml: `
        <p>Hi **CUSTOMER_NAME**,</p>
        <p>Great news! Order <strong>#**ORDER_ID**</strong> is complete and your payout is headed your way.</p>
        <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:20px 24px; margin:28px 0;">
          <p style="margin:0 0 12px;"><strong style="color:#0f172a;">Device</strong><br><span style="color:#475569;">**DEVICE_SUMMARY**</span></p>
          <p style="margin:0 0 12px;"><strong style="color:#0f172a;">Payout</strong><br><span style="color:#059669; font-size:22px; font-weight:700;">$**ORDER_TOTAL**</span></p>
          <p style="margin:0;"><strong style="color:#0f172a;">Payment method</strong><br><span style="color:#475569;">**PAYMENT_METHOD**</span></p>
        </div>
        <p>Thanks for choosing SecondHandCell!</p>
    `,
  });
}

const REVIEW_REQUEST_EMAIL_HTML = buildEmailLayout({
  title: "We'd love your feedback",
  accentColor: "#0ea5e9",
  bodyHtml: `
      <p>Hello **CUSTOMER_NAME**,</p>
      <p>Thanks again for trusting us with your device. Sharing a quick review helps other sellers feel confident working with SecondHandCell.</p>
      <p style="margin-bottom:32px;">It only takes a minute and means the world to our team.</p>
      <div style="text-align:center; margin-bottom:24px;">
        <a href="${TRUSTPILOT_REVIEW_LINK}" class="button-link" style="background-color:#0ea5e9;">Leave a Trustpilot review</a>
      </div>
      <p style="text-align:center; color:#475569;">Thank you for being part of the SecondHandCell community!</p>
  `,
});


const stateAbbreviations = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
  "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
  "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
  "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
  "District of Columbia": "DC"
};

async function generateNextOrderNumber() {
  const counterRef = db.collection("counters").doc("orders");

  try {
    const newOrderNumber = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      const currentNumber = counterDoc.exists
        ? counterDoc.data().currentNumber ?? 0
        : 0;

      transaction.set(
        counterRef,
        { currentNumber: currentNumber + 1 },
        { merge: true }
      );

      const paddedNumber = String(currentNumber).padStart(5, "0");
      return `SHC-${paddedNumber}`;
    });

    return newOrderNumber;
  } catch (e) {
    console.error("Transaction to generate order number failed:", e);
    throw new Error("Failed to generate a unique order number. Please try again.");
  }
}

function formatStatusLabel(value) {
  if (!value) return "";
  return String(value)
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLogEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  return entries
    .filter(Boolean)
    .map((entry) => {
      const atValue = entry.at;
      let timestamp;

      if (atValue instanceof admin.firestore.Timestamp) {
        timestamp = atValue;
      } else if (atValue instanceof Date) {
        timestamp = admin.firestore.Timestamp.fromDate(atValue);
      } else if (
        atValue &&
        typeof atValue === "object" &&
        typeof atValue.seconds === "number"
      ) {
        timestamp = new admin.firestore.Timestamp(
          atValue.seconds,
          atValue.nanoseconds || 0
        );
      } else {
        timestamp = admin.firestore.Timestamp.now();
      }

      return {
        id: entry.id || randomUUID(),
        type: entry.type || "update",
        message: entry.message || "",
        metadata: entry.metadata ?? null,
        at: timestamp,
      };
    });
}

async function writeOrderBoth(orderId, data) {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const dataToWrite = { ...data, updatedAt: timestamp };

  if (data.status !== undefined && data.lastStatusUpdateAt === undefined) {
    dataToWrite.lastStatusUpdateAt = timestamp;
  }

  await ordersCollection.doc(orderId).set(dataToWrite);

  if (data.userId) {
    await usersCollection
      .doc(data.userId)
      .collection("orders")
      .doc(orderId)
      .set(dataToWrite);
  }
}

async function updateOrderBoth(orderId, partialData = {}, options = {}) {
  const orderRef = ordersCollection.doc(orderId);
  const existingSnap = await orderRef.get();
  const existing = existingSnap.data() || {};
  const userId = existing.userId;

  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const dataToMerge = { ...partialData, updatedAt: timestamp };

  const statusProvided = Object.prototype.hasOwnProperty.call(
    partialData,
    "status"
  );

  if (statusProvided && options.skipStatusTimestamp !== true) {
    dataToMerge.lastStatusUpdateAt = timestamp;
  }

  let logEntries = [];

  if (
    statusProvided &&
    existing.status !== partialData.status &&
    options.autoLogStatus !== false
  ) {
    logEntries.push({
      type: "status",
      message: `Status changed to ${formatStatusLabel(partialData.status)}`,
      metadata: { status: partialData.status },
    });
  }

  if (Array.isArray(options.logEntries)) {
    logEntries = logEntries.concat(options.logEntries);
  }

  const normalizedLogs = normalizeLogEntries(logEntries);
  if (normalizedLogs.length) {
    dataToMerge.activityLog = admin.firestore.FieldValue.arrayUnion(
      ...normalizedLogs
    );
  }

  await orderRef.set(dataToMerge, { merge: true });

  if (userId) {
    const userUpdate = { ...dataToMerge };
    if (normalizedLogs.length) {
      userUpdate.activityLog = admin.firestore.FieldValue.arrayUnion(
        ...normalizedLogs
      );
    }

    await usersCollection
      .doc(userId)
      .collection("orders")
      .doc(orderId)
      .set(userUpdate, { merge: true });
  }

  const updatedSnap = await orderRef.get();
  const updated = updatedSnap.data() || {};

  return { order: { id: orderId, ...updated }, userId };
}

function applyTemplate(template, replacements = {}) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }
  return output;
}

function formatDisplayText(value, fallback = "Not specified") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getOrderPayout(order = {}) {
  const potentialValues = [
    order.finalPayoutAmount,
    order.finalPayout,
    order.finalOfferAmount,
    order.finalOffer,
    order.payoutAmount,
    order.payout,
    order.reOffer?.newPrice,
    order.estimatedQuote
  ];

  for (const value of potentialValues) {
    if (value === undefined || value === null) continue;
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }
  }

  return 0;
}

function formatCurrencyValue(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return "0.00";
  }
  return numericValue.toFixed(2);
}

function buildDeviceSummary(order = {}) {
  const parts = [];
  if (order.device) {
    parts.push(String(order.device));
  }
  if (order.storage) {
    parts.push(String(order.storage));
  }
  if (order.carrier) {
    parts.push(formatDisplayText(order.carrier));
  }
  return parts.length ? parts.join(" • ") : "Device details on file";
}

function buildTrustpilotSection() {
  return `
    <div style="text-align:center; padding: 28px 24px 32px; background-color:#f8fafc; border-top: 1px solid #e2e8f0;">
      <p style="font-weight:600; color:#0f172a; font-size:18px; margin:0 0 12px 0;">Loved your experience?</p>
      <a href="${TRUSTPILOT_REVIEW_LINK}" style="display:inline-block; text-decoration:none; border:none; outline:none;">
        <img src="${TRUSTPILOT_STARS_IMAGE_URL}" alt="Rate us on Trustpilot" style="height:58px; width:auto; display:block; margin:0 auto 10px auto; border:0;">
      </a>
      <p style="font-size:15px; color:#475569; margin:12px 0 0;">Your feedback keeps the <strong>SecondHandCell</strong> community thriving.</p>
    </div>
  `;
}

function buildEmailLayout({
  title = "",
  bodyHtml = "",
  accentColor = "#16a34a",
  includeTrustpilot = true,
  footerText = "Need help? Reply to this email or call (888) 265-4612.",
} = {}) {
  const headingSection = title
    ? `
        <tr>
          <td style="background:${accentColor}; padding: 30px 24px; text-align:center;">
            <h1 style="margin:0; font-size:28px; line-height:1.3; color:#ffffff; font-weight:700;">${escapeHtml(
              title
            )}</h1>
          </td>
        </tr>
      `
    : "";

  const trustpilotSection = includeTrustpilot ? buildTrustpilotSection() : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title || "SecondHandCell Update")}</title>
      <style>
        body { background-color:#f1f5f9; margin:0; padding:24px 12px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#0f172a; }
        .email-shell { width:100%; max-width:640px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 25px 45px rgba(15,23,42,0.08); border:1px solid #e2e8f0; }
        .logo-cell { padding:28px 0 16px; text-align:center; background-color:#ffffff; }
        .logo-cell img { height:56px; width:auto; }
        .content-cell { padding:32px 30px; font-size:17px; line-height:1.75; }
        .content-cell p { margin:0 0 20px; }
        .footer-cell { padding:28px 32px; text-align:center; font-size:15px; color:#475569; background-color:#f8fafc; border-top:1px solid #e2e8f0; }
        .footer-cell p { margin:4px 0; }
        a.button-link { display:inline-block; padding:14px 26px; border-radius:9999px; background-color:#16a34a; color:#ffffff !important; font-weight:600; text-decoration:none; font-size:17px; }
      </style>
    </head>
    <body>
      <table role="presentation" cellpadding="0" cellspacing="0" class="email-shell">
        <tr>
          <td class="logo-cell">
            <img src="${EMAIL_LOGO_URL}" alt="SecondHandCell Logo" />
          </td>
        </tr>
        ${headingSection}
        <tr>
          <td class="content-cell">
            ${bodyHtml}
            ${buildCountdownNoticeHtml()}
          </td>
        </tr>
        ${trustpilotSection ? `<tr><td>${trustpilotSection}</td></tr>` : ""}
        <tr>
          <td class="footer-cell">
            <p>${footerText}</p>
            <p>© ${new Date().getFullYear()} SecondHandCell. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}


// NEW HELPER: Sanitizes data to ensure all values are strings for FCM payload compliance.
function stringifyData(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[String(k)] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

const kitStatusOrder = ['needs_printing', 'kit_sent', 'kit_in_transit', 'kit_delivered'];

function mapShipEngineStatus(code) {
  if (!code) return null;
  const normalized = String(code).toUpperCase();
  switch (normalized) {
    case 'DELIVERED':
    case 'DELIVERED_TO_AGENT':
      return 'kit_delivered';
    case 'OUT_FOR_DELIVERY':
    case 'IN_TRANSIT':
    case 'ACCEPTED':
    case 'SHIPMENT_ACCEPTED':
    case 'LABEL_CREATED':
    case 'UNKNOWN':
      return 'kit_in_transit';
    default:
      return null;
  }
}

function shouldPromoteKitStatus(currentStatus, nextStatus) {
  if (!nextStatus) return false;
  const currentIndex = kitStatusOrder.indexOf(currentStatus);
  const nextIndex = kitStatusOrder.indexOf(nextStatus);
  if (nextIndex === -1) return false;
  if (currentIndex === -1) return true;
  return nextIndex > currentIndex;
}

// Custom function to send FCM push notification to a specific token or list of tokens
async function sendPushNotification(tokens, title, body, data = {}) {
  try {
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    if (!tokenList.length) return;

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: stringifyData(data), // <-- CRITICAL FIX: Sanitize data payload
      tokens: tokenList,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      "Successfully sent FCM messages:",
      response.successCount,
      "failures:",
      response.failureCount
    );

    const tokensToRemove = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(
            `Failed to send FCM to token ${tokenList[idx]}: ${resp.error}`
          );
          // Check for token invalidation errors (e.g., 'messaging/registration-token-not-registered')
          if (resp.error?.code === 'messaging/registration-token-not-registered' || 
              resp.error?.code === 'messaging/invalid-argument') {
            tokensToRemove.push(tokenList[idx]);
          }
        }
      });
    }

    // Prune invalid tokens from Firestore
    if (tokensToRemove.length > 0) {
      console.log(`Pruning ${tokensToRemove.length} invalid FCM tokens.`);
      await admin.messaging().deleteRegistrationTokens(tokensToRemove);
      
      // OPTIONAL: Also delete token documents from the 'fcmTokens' subcollection
      // This part requires knowing the Admin UID, which we don't have here. 
      // The FCM deleteRegistrationTokens call cleans up the backend registration, which is essential.
    }

    return response;
  } catch (error) {
    console.error("Error sending FCM push notification:", error);
  }
}

// Re-using and slightly updating the old sendAdminPushNotification to fetch ALL admin tokens.
async function sendAdminPushNotification(title, body, data = {}) {
  try {
    const adminsSnapshot = await adminsCollection.get();
    let allTokens = [];

    for (const adminDoc of adminsSnapshot.docs) {
      const adminUid = adminDoc.id;
      const fcmTokensRef = adminsCollection.doc(adminUid).collection("fcmTokens");
      const tokensSnapshot = await fcmTokensRef.get();
      
      // FIX: Safely retrieve the token, checking doc.data().token or using doc.id
      tokensSnapshot.forEach((doc) => {
        const d = doc.data() || {};
        // The token is stored either as the document ID or explicitly in a 'token' field.
        const token = d.token || doc.id; 
        if (token && typeof token === 'string') {
            allTokens.push(token);
        }
      });
    }

    if (allTokens.length === 0) {
      console.log(
        "No FCM tokens found for any admin. Cannot send push notification."
      );
      return;
    }
    
    return await sendPushNotification(allTokens, title, body, data);
    
  } catch (error) {
    console.error("Error sending FCM push notification to all admins:", error);
  }
}

async function addAdminFirestoreNotification(
  adminUid,
  message,
  relatedDocType = null,
  relatedDocId = null,
  relatedUserId = null
) {
  try {
    const notificationsCollectionRef = db.collection(
      `admins/${adminUid}/notifications`
    );
    await notificationsCollectionRef.add({
      message: message,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedDocType: relatedDocType,
      relatedDocId: relatedDocId,
      relatedUserId: relatedUserId,
    });
    console.log(
      `Firestore notification added for admin ${adminUid}: ${message}`
    );
  } catch (error) {
    console.error(
      `Error adding Firestore notification for admin ${adminUid}:`,
      error
    );
  }
}

async function createShipEngineLabel(fromAddress, toAddress, labelReference, packageData) {
  const isSandbox = false;
  const payload = {
    shipment: {
      service_code: packageData.service_code,
      ship_to: toAddress,
      ship_from: fromAddress,
      packages: [
        {
          weight: { value: packageData.weight.ounces, unit: "ounce" },
          dimensions: {
            unit: "inch",
            height: packageData.dimensions.height,
            width: packageData.dimensions.width,
            length: packageData.dimensions.length,
          },
          label_messages: {
            reference1: labelReference,
          },
        },
      ],
    },
  };
  if (isSandbox) payload.testLabel = true;

  const shipEngineApiKey = getShipEngineApiKey();
  if (!shipEngineApiKey) {
    throw new Error(
      "ShipEngine API key not configured. Please set 'shipengine.key' environment variable."
    );
  }

  const response = await axios.post("https://api.shipengine.com/v1/labels", payload, {
    headers: {
      "API-Key": shipEngineApiKey,
      "Content-Type": "application/json",
    },
  });
  return response.data;
}

function formatStatusForEmail(status) {
  if (status === "order_pending") return "Order Pending";
  if (status === "shipping_kit_requested" || status === "kit_needs_printing" || status === "needs_printing")
    return "Needs Printing";
  if (status === "kit_sent") return "Kit Sent";
  if (status === "kit_delivered") return "Kit Delivered";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Renamed from sendTestEmail to avoid conflict
async function sendMultipleTestEmails(email, emailTypes) {
  const mockOrderData = {
    id: "TEST-00001",
    shippingInfo: {
      fullName: "Test User",
      email: email,
      streetAddress: "123 Test St",
      city: "Test City",
      state: "TS",
      zipCode: "12345",
    },
    device: "iPhone 13",
    storage: "256GB",
    carrier: "Unlocked",
    estimatedQuote: 500,
    paymentMethod: "venmo",
    paymentDetails: {
      venmoUsername: "testuser",
    },
    uspsLabelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    trackingNumber: "1234567890",
    reOffer: {
      newPrice: 400,
      reasons: ["Cracked Screen", "Deep Scratches"],
      comments: "Device had more cosmetic damage than initially stated.",
      autoAcceptDate: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    returnLabelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    returnTrackingNumber: "0987654321",
  };
  
  const mockOrderDataWithoutReoffer = {
    id: "TEST-00002",
    shippingInfo: {
      fullName: "Test User 2",
      email: email,
    },
    device: "iPhone 15 Pro",
    storage: "256GB",
    carrier: "unlocked",
    estimatedQuote: 875,
    paymentMethod: "paypal",
    reOffer: null,
    returnLabelUrl: null,
  };

  const mockOrderDataReoffered = {
    id: "TEST-00003",
    shippingInfo: {
      fullName: "Test User 3",
      email: email,
    },
    reOffer: {
      newPrice: 350,
      reasons: ["Cracked Screen"],
      comments: "Minor cracks on the back glass.",
      autoAcceptDate: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    returnLabelUrl: null,
  };

  const mockOrderDataReturned = {
    id: "TEST-00004",
    shippingInfo: {
      fullName: "Test User 4",
      email: email,
    },
    reOffer: {
      newPrice: 350,
      reasons: ["Cracked Screen"],
      comments: "Minor cracks on the back glass.",
      autoAcceptDate: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    returnLabelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  };
  
  const mailPromises = emailTypes.map(emailType => {
    let subject;
    let htmlBody;
    let orderToUse;

    switch (emailType) {
      case "shipping-label":
        orderToUse = mockOrderData;
        subject = `[TEST] Your SecondHandCell Shipping Label for Order #${orderToUse.id}`;
        htmlBody = SHIPPING_LABEL_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, orderToUse.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, orderToUse.id)
          .replace(/\*\*TRACKING_NUMBER\*\*/g, orderToUse.trackingNumber)
          .replace(/\*\*LABEL_DOWNLOAD_LINK\*\*/g, orderToUse.uspsLabelUrl);
        break;
      case "reoffer":
        orderToUse = mockOrderData;
        subject = `[TEST] Re-offer for Order #${orderToUse.id}`;
        let reasonString = orderToUse.reOffer.reasons.join(", ");
        if (orderToUse.reOffer.comments) reasonString += `; ${orderToUse.reOffer.comments}`;
        htmlBody = buildEmailLayout({
          title: "Updated offer available",
          accentColor: "#6366f1",
          bodyHtml: `
              <p>Hi ${escapeHtml(orderToUse.shippingInfo.fullName)},</p>
              <p>Thanks for sending in your device. After inspection of order <strong>#${escapeHtml(orderToUse.id)}</strong>, we have an updated offer for you.</p>
              <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:18px; padding:20px 24px; margin:28px 0;">
                <p style="margin:0 0 12px; color:#312e81;"><strong>Original Quote:</strong> $${orderToUse.estimatedQuote.toFixed(2)}</p>
                <p style="margin:0; color:#1e1b4b; font-size:20px; font-weight:700;">New Offer: $${orderToUse.reOffer.newPrice.toFixed(2)}</p>
              </div>
              <p style="margin-bottom:12px;">Reason for the change:</p>
              <p style="background:#fef3c7; border-radius:14px; border:1px solid #fde68a; color:#92400e; padding:14px 18px; margin:0 0 28px;">${escapeHtml(reasonString).replace(/\n/g, "<br>")}</p>
              <p style="margin-bottom:20px;">Choose how you'd like to proceed:</p>
              <div style="text-align:center; margin-bottom:20px;">
                <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderToUse.id}&action=accept" class="button-link" style="background-color:#16a34a;">Accept offer ($${orderToUse.reOffer.newPrice.toFixed(2)})</a>
              </div>
              <div style="text-align:center; margin-bottom:24px;">
                <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderToUse.id}&action=return" class="button-link" style="background-color:#dc2626;">Return device instead</a>
              </div>
              <p>Questions or feedback? Reply to this email—we're here to help.</p>
          `,
        });
        break;
      case "final-offer-accepted":
        orderToUse = mockOrderData;
        subject = `[TEST] Offer Accepted for Order #${orderToUse.id}`;
        htmlBody = `
          <p>Hello ${orderToUse.shippingInfo.fullName},</p>
          <p>Great news! Your order <strong>#${orderToUse.id}</strong> has been completed and payment has been processed.</p>
          <p>If you have any questions about your payment, please let us know.</p>
          <p>Thank you for choosing SecondHandCell!</p>
        `;
        break;
      case "return-label":
        orderToUse = mockOrderData;
        subject = `[TEST] Your SecondHandCell Return Label`;
        htmlBody = `
          <p>Hello ${orderToUse.shippingInfo.fullName},</p>
          <p>As requested, here is your return shipping label for your device (Order ID: ${orderToUse.id}):</p>
          <p>Return Tracking Number: <strong>${orderToUse.returnTrackingNumber}</strong></p>
          <a href="${orderToUse.returnLabelUrl}">Download Return Label</a>
          <p>Thank you,</p>
          <p>The SecondHandCell Team</p>
        `;
        break;
      case "blacklisted":
        orderToUse = mockOrderData;
        subject = `[TEST] Important Notice Regarding Your Device - Order #${orderToUse.id}`;
        htmlBody = BLACKLISTED_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, orderToUse.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, orderToUse.id)
          .replace(/\*\*STATUS_REASON\*\*/g, "stolen or blacklisted")
          .replace(/\*\*LEGAL_TEXT\*\*/g, "This is mock legal text for testing.");
        break;
      case "fmi":
        orderToUse = mockOrderData;
        subject = `[TEST] Action Required for Order #${orderToUse.id}`;
        htmlBody = FMI_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, orderToUse.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, orderToUse.id)
          .replace(/\*\*CONFIRM_URL\*\*/g, `https://example.com/mock-confirm-fmi`);
        break;
      case "balance-due":
        orderToUse = mockOrderData;
        subject = `[TEST] Action Required for Order #${orderToUse.id}`;
        htmlBody = BAL_DUE_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, orderToUse.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, orderToUse.id)
          .replace(/\*\*FINANCIAL_STATUS\*\*/g, orderToUse.financialStatus === "BalanceDue" ? "an outstanding balance" : "a past due balance");
        break;
      case "completed":
        orderToUse = mockOrderDataWithoutReoffer;
        subject = `[TEST] Your SecondHandCell Order is Complete!`;
        const mockPayout = getOrderPayout(orderToUse);
        const template = getOrderCompletedEmailTemplate({ includeTrustpilot: !orderToUse.reOffer });
        htmlBody = applyTemplate(template, {
          "**CUSTOMER_NAME**": orderToUse.shippingInfo.fullName,
          "**ORDER_ID**": orderToUse.id,
          "**DEVICE_SUMMARY**": buildDeviceSummary(orderToUse),
          "**ORDER_TOTAL**": formatCurrencyValue(mockPayout),
          "**PAYMENT_METHOD**": formatDisplayText(orderToUse.paymentMethod, "Not specified"),
        });
        break;
      default:
        return Promise.resolve();
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: htmlBody,
    };

    return transporter.sendMail(mailOptions);
  });

  await Promise.all(mailPromises);
  return { message: "Test emails sent successfully." };
}

// ------------------------------
// ROUTES
// ------------------------------

// NEW ENDPOINT: PDF Fetching Proxy for CORS Bypass
app.post("/fetch-pdf", async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "PDF URL is required." });
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // Crucial for binary data (PDF)
            // Add necessary headers if the remote server requires them (e.g., ShipEngine sometimes needs API-Key for direct label downloads, though usually not)
        });

        // Convert the ArrayBuffer to a Base64 string for safe JSON transfer
        const base64Data = Buffer.from(response.data).toString('base64');
        
        res.json({ 
            base64: base64Data,
            mimeType: response.headers['content-type'] || 'application/pdf'
        });
    } catch (error) {
        console.error("Error fetching external PDF:", error.message);
        if (error.response) {
             console.error("External API Response Status:", error.response.status);
             console.error("External API Response Data (partial):", error.response.data ? Buffer.from(error.response.data).toString('utf-8').substring(0, 200) : 'No data');
             return res.status(error.response.status).json({ 
                 error: `Failed to fetch PDF from external service. Status: ${error.response.status}`,
                 details: error.message
             });
        }
        res.status(500).json({ error: "Internal server error during PDF proxy fetch." });
    }
});


app.get("/orders", async (req, res) => {
  try {
    const snapshot = await ordersCollection.get();
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(orders);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/orders/:id", async (req, res) => {
  try {
    const docRef = ordersCollection.doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("Error fetching single order:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

app.get("/orders/find", async (req, res) => {
  try {
    const { identifier } = req.query;
    if (!identifier) {
      return res
        .status(400)
        .json({ error: "Identifier query parameter is required." });
    }

    let orderDoc;
    if (identifier.match(/^SHC-\d{5}$/)) {
      orderDoc = await ordersCollection.doc(identifier).get();
    } else if (identifier.length === 26 && identifier.match(/^\d+$/)) {
      const snapshot = await ordersCollection
        .where("externalId", "==", identifier)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        orderDoc = snapshot.docs[0];
      }
    }

    if (!orderDoc || !orderDoc.exists) {
      return res
        .status(404)
        .json({ error: "Order not found with provided identifier." });
    }

    res.json({ id: orderDoc.id, ...orderDoc.data() });
  } catch (err) {
    console.error("Error finding order:", err);
    res.status(500).json({ error: "Failed to find order" });
  }
});

app.get("/orders/by-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const snapshot = await ordersCollection
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    res.json(orders);
  } catch (err) {
    console.error("Error fetching user's orders:", err);
    res.status(500).json({ error: "Failed to fetch user orders" });
  }
});

app.post("/submit-order", async (req, res) => {
  try {
    const orderData = req.body;
    if (!orderData?.shippingInfo || !orderData?.estimatedQuote) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    const fullStateName = orderData.shippingInfo.state;
    if (fullStateName && stateAbbreviations[fullStateName]) {
      orderData.shippingInfo.state = stateAbbreviations[fullStateName];
    } else {
      console.warn(`Could not find abbreviation for state: ${fullStateName}. Assuming it is already an abbreviation or is invalid.`);
    }

    const orderId = await generateNextOrderNumber();

    let shippingInstructions = "";
    let newOrderStatus = "order_pending";

    if (orderData.shippingPreference === "Shipping Kit Requested") {
      shippingInstructions = `
        <p style="margin-top: 24px;">Please note: You requested a shipping kit, which will be sent to you shortly. When it arrives, you'll find a return label inside to send us your device.</p>
        <p>If you have any questions, please reply to this email.</p>
      `;
      newOrderStatus = "shipping_kit_requested";
    } else {
      shippingInstructions = `
        <p style="margin-top: 24px;">We will send your shipping label shortly.</p>
        <p>If you have any questions, please reply to this email.</p>
      `;
    }

    const customerEmailHtml = ORDER_RECEIVED_EMAIL_HTML
      .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
      .replace(/\*\*ORDER_ID\*\*/g, orderId)
      .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
      .replace(/\*\*SHIPPING_INSTRUCTION\*\*/g, shippingInstructions);
    
    const adminEmailHtml = ORDER_PLACED_ADMIN_EMAIL_HTML
      .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
      .replace(/\*\*ORDER_ID\*\*/g, orderId)
      .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
      .replace(/\*\*ESTIMATED_QUOTE\*\*/g, orderData.estimatedQuote.toFixed(2))
      .replace(/\*\*SHIPPING_PREFERENCE\*\*/g, orderData.shippingPreference);


    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: orderData.shippingInfo.email,
      subject: `Your SecondHandCell Order #${orderId} Has Been Received!`,
      html: customerEmailHtml,
      bcc: ["sales@secondhandcell.com"]
    };

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: 'sales@secondhandcell.com',
      subject: `${orderData.shippingInfo.fullName} - placed an order for a ${orderData.device}`,
      html: adminEmailHtml,
      bcc: ["saulsetton16@gmail.com"]
    };

    const notificationPromises = [
      transporter.sendMail(customerMailOptions),
      transporter.sendMail(adminMailOptions),
      sendAdminPushNotification(
        "⚡ New Order Placed!",
        `Order #${orderId} for ${orderData.device} from ${orderData.shippingInfo.fullName}.`,
        {
          orderId: orderId,
          userId: orderData.userId || "guest",
          relatedDocType: "order",
          relatedDocId: orderId,
          relatedUserId: orderData.userId,
        }
      ).catch((e) => console.error("FCM Send Error (New Order):", e)),
    ];

    const adminsSnapshot = await adminsCollection.get();
    adminsSnapshot.docs.forEach((adminDoc) => {
      notificationPromises.push(
        addAdminFirestoreNotification(
          adminDoc.id,
          `New Order: #${orderId} from ${orderData.shippingInfo.fullName}.`,
          "order",
          orderId,
          orderData.userId
        ).catch((e) =>
          console.error("Firestore Notification Error (New Order):", e)
        )
      );
    });

    await Promise.all(notificationPromises);

    const toSave = {
      ...orderData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: newOrderStatus,
      id: orderId,
    };
    await writeOrderBoth(orderId, toSave);

    res.status(201).json({ message: "Order submitted", orderId: orderId });
  } catch (err) {
    console.error("Error submitting order:", err);
    res.status(500).json({ error: "Failed to submit order" });
  }
});

app.post("/generate-label/:id", async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });

    const order = { id: doc.id, ...doc.data() };
    const buyerShippingInfo = order.shippingInfo;
    const orderIdForLabel = order.id || "N/A";
    const nowTimestamp = admin.firestore.Timestamp.now();
    const statusTimestamp = nowTimestamp;
    const labelRecords = cloneShipEngineLabelMap(order.shipEngineLabels);
    const generatedStatus = order.shippingPreference === "Shipping Kit Requested"
      ? "needs_printing"
      : "label_generated";

    // Define package data for the outbound and return labels
    // Outbound label is for the shipping kit (box + padding)
    const outboundPackageData = {
      service_code: "usps_first_class_mail",
      dimensions: { unit: "inch", height: 2, width: 4, length: 6 },
      weight: { ounces: 4, unit: "ounce" }, // Kit weighs 4oz
    };

    // Return label is for the phone inside the kit
    const inboundPackageData = {
      service_code: "usps_first_class_mail",
      dimensions: { unit: "inch", height: 2, width: 4, length: 6 },
      weight: { ounces: 8, unit: "ounce" }, // Phone weighs 8oz
    };

    const swiftBuyBackAddress = {
      name: "SHC Returns",
      company_name: "SecondHandCell",
      phone: "3475591707",
      address_line1: "1602 MCDONALD AVE STE REAR ENTRANCE",
      city_locality: "Brooklyn",
      state_province: "NY",
      postal_code: "11230-6336",
      country_code: "US",
    };

    const buyerAddress = {
      name: buyerShippingInfo.fullName,
      phone: "3475591707",
      address_line1: buyerShippingInfo.streetAddress,
      city_locality: buyerShippingInfo.city,
      state_province: buyerShippingInfo.state,
      postal_code: buyerShippingInfo.zipCode,
      country_code: "US",
    };

    let customerLabelData;
    let updateData = {
      status: generatedStatus,
      labelGeneratedAt: statusTimestamp,
      lastStatusUpdateAt: statusTimestamp,
    };
    if (generatedStatus === 'needs_printing') {
      updateData.needsPrintingAt = statusTimestamp;
    }
    let customerEmailSubject = "";
    let customerEmailHtml = "";
    let customerMailOptions;

    if (order.shippingPreference === "Shipping Kit Requested") {
      // Create outbound label for the kit
      const outboundLabelData = await createShipEngineLabel(
        swiftBuyBackAddress,
        buyerAddress,
        `${orderIdForLabel}-OUTBOUND-KIT`,
        outboundPackageData // Use the 4oz package data
      );

      // Create inbound label for the phone
      const inboundLabelData = await createShipEngineLabel(
        buyerAddress,
        swiftBuyBackAddress,
        `${orderIdForLabel}-INBOUND-DEVICE`,
        inboundPackageData // Use the 8oz package data
      );

      customerLabelData = outboundLabelData;

      labelRecords.outbound = {
        id:
          outboundLabelData.label_id ||
          outboundLabelData.labelId ||
          outboundLabelData.shipengine_label_id ||
          null,
        trackingNumber: outboundLabelData.tracking_number || null,
        downloadUrl: outboundLabelData.label_download?.pdf || null,
        carrierCode:
          outboundLabelData.shipment?.carrier_id ||
          outboundLabelData.carrier_code ||
          null,
        serviceCode:
          outboundLabelData.shipment?.service_code ||
          outboundPackageData.service_code ||
          null,
        generatedAt: nowTimestamp,
        createdAt: nowTimestamp,
        status: "active",
        voidStatus: "active",
        message: null,
        displayName: "Outbound Shipping Label",
        labelReference: `${orderIdForLabel}-OUTBOUND-KIT`,
      };

      labelRecords.inbound = {
        id:
          inboundLabelData.label_id ||
          inboundLabelData.labelId ||
          inboundLabelData.shipengine_label_id ||
          null,
        trackingNumber: inboundLabelData.tracking_number || null,
        downloadUrl: inboundLabelData.label_download?.pdf || null,
        carrierCode:
          inboundLabelData.shipment?.carrier_id ||
          inboundLabelData.carrier_code ||
          null,
        serviceCode:
          inboundLabelData.shipment?.service_code ||
          inboundPackageData.service_code ||
          null,
        generatedAt: nowTimestamp,
        createdAt: nowTimestamp,
        status: "active",
        voidStatus: "active",
        message: null,
        displayName: "Inbound Shipping Label",
        labelReference: `${orderIdForLabel}-INBOUND-DEVICE`,
      };

      updateData = {
        ...updateData,
        outboundLabelUrl: outboundLabelData.label_download?.pdf,
        outboundTrackingNumber: outboundLabelData.tracking_number,
        inboundLabelUrl: inboundLabelData.label_download?.pdf,
        inboundTrackingNumber: inboundLabelData.tracking_number,
        // The uspsLabelUrl and trackingNumber fields will hold the INBOUND label data
        uspsLabelUrl: inboundLabelData.label_download?.pdf,
        trackingNumber: inboundLabelData.tracking_number,
      };

      customerEmailSubject = `Your SecondHandCell Shipping Kit for Order #${order.id} is on its Way!`;
      customerEmailHtml = SHIPPING_KIT_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
        .replace(/\*\*ORDER_ID\*\*/g, order.id)
        .replace(/\*\*TRACKING_NUMBER\*\*/g, customerLabelData.tracking_number || "N/A");

      customerMailOptions = {
        from: process.env.EMAIL_USER,
        to: order.shippingInfo.email,
        subject: customerEmailSubject,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com"]
      };

    } else if (order.shippingPreference === "Email Label Requested") {
      // For a single label request, we only create the inbound label
      customerLabelData = await createShipEngineLabel(
        buyerAddress,
        swiftBuyBackAddress,
        `${orderIdForLabel}-INBOUND-DEVICE`,
        inboundPackageData // Use the 8oz package data
      );

      const labelDownloadLink = customerLabelData.label_download?.pdf;
      if (!labelDownloadLink) {
        console.error(
          "ShipEngine did not return a downloadable label PDF for order:",
          order.id,
          customerLabelData
        );
        throw new Error("Label PDF link not available from ShipEngine.");
      }

      labelRecords.email = {
        id:
          customerLabelData.label_id ||
          customerLabelData.labelId ||
          customerLabelData.shipengine_label_id ||
          null,
        trackingNumber: customerLabelData.tracking_number || null,
        downloadUrl: labelDownloadLink,
        carrierCode:
          customerLabelData.shipment?.carrier_id ||
          customerLabelData.carrier_code ||
          null,
        serviceCode:
          customerLabelData.shipment?.service_code ||
          inboundPackageData.service_code ||
          null,
        generatedAt: nowTimestamp,
        createdAt: nowTimestamp,
        status: "active",
        voidStatus: "active",
        message: null,
        displayName: "Email Shipping Label",
        labelReference: `${orderIdForLabel}-INBOUND-DEVICE`,
      };

      updateData = {
        ...updateData,
        uspsLabelUrl: labelDownloadLink,
        trackingNumber: customerLabelData.tracking_number,
      };

      customerEmailSubject = `Your SecondHandCell Shipping Label for Order #${order.id}`;
      customerEmailHtml = SHIPPING_LABEL_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
        .replace(/\*\*ORDER_ID\*\*/g, order.id)
        .replace(/\*\*TRACKING_NUMBER\*\*/g, customerLabelData.tracking_number || "N/A")
        .replace(/\*\*LABEL_DOWNLOAD_LINK\*\*/g, labelDownloadLink);

      customerMailOptions = {
        from: process.env.EMAIL_USER,
        to: order.shippingInfo.email,
        subject: customerEmailSubject,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com"]
      };
    } else {
      throw new Error(`Unknown shipping preference: ${order.shippingPreference}`);
    }

    const labelIds = buildLabelIdList(labelRecords);
    const hasActive = Object.values(labelRecords).some((entry) =>
      entry && entry.id ? isLabelPendingVoid(entry) : false
    );

    updateData = {
      ...updateData,
      shipEngineLabels: labelRecords,
      shipEngineLabelIds: labelIds,
      shipEngineLabelsLastUpdatedAt: nowTimestamp,
      hasShipEngineLabel: labelIds.length > 0,
      hasActiveShipEngineLabel: hasActive,
      shipEngineLabelId:
        labelRecords.inbound?.id ||
        labelRecords.email?.id ||
        labelIds[0] ||
        null,
      labelVoidStatus: labelIds.length ? "active" : order.labelVoidStatus || null,
      labelVoidMessage: null,
    };

    await updateOrderBoth(req.params.id, updateData);

    await transporter.sendMail(customerMailOptions);

    res.json({ message: "Label(s) generated successfully", orderId: order.id, ...updateData });
  } catch (err) {
    console.error("Error generating label:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to generate label" });
  }
});

app.post("/orders/:id/void-label", async (req, res) => {
  try {
    const orderId = req.params.id;
    const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
    if (!labels.length) {
      return res
        .status(400)
        .json({ error: "Please select at least one label to void." });
    }

    const doc = await ordersCollection.doc(orderId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = { id: doc.id, ...doc.data() };
    const { results } = await handleLabelVoid(order, labels, {
      reason: "manual",
    });

    try {
      await sendVoidNotificationEmail(order, results, { reason: "manual" });
    } catch (notificationError) {
      console.error(
        `Failed to send manual void notification for order ${orderId}:`,
        notificationError
      );
    }

    res.json({ orderId, results });
  } catch (error) {
    console.error("Error voiding label(s):", error);
    res.status(500).json({
      error: error.message || "Failed to void the selected label(s).",
    });
  }
});

app.get('/packing-slip/:id', async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const pdfData = await generateCustomLabelPdf(order);
    const buffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="packing-slip-${order.id}.pdf"`);
    res.send(buffer);
  } catch (error) {
    console.error('Failed to generate packing slip PDF:', error);
    res.status(500).json({ error: 'Failed to generate packing slip PDF' });
  }
});

app.get('/print-bundle/:id', async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const labelUrlCandidates = [];

    if (order.shippingPreference === 'Shipping Kit Requested') {
      labelUrlCandidates.push(order.outboundLabelUrl, order.inboundLabelUrl);
    } else if (order.uspsLabelUrl) {
      labelUrlCandidates.push(order.uspsLabelUrl);
    } else {
      labelUrlCandidates.push(order.outboundLabelUrl, order.inboundLabelUrl);
    }

    const uniqueLabelUrls = Array.from(new Set(labelUrlCandidates.filter(Boolean)));

    const downloadedLabels = await Promise.all(
      uniqueLabelUrls.map(async (url) => {
        try {
          const response = await axios.get(url, { responseType: 'arraybuffer' });
          return Buffer.from(response.data);
        } catch (downloadError) {
          console.error(`Failed to download label from ${url}:`, downloadError.message || downloadError);
          return null;
        }
      })
    );

    const bagLabelData = await generateBagLabelPdf(order);

    const pdfParts = [
      ...downloadedLabels.filter(Boolean),
      Buffer.isBuffer(bagLabelData) ? bagLabelData : Buffer.from(bagLabelData),
    ].filter(Boolean);

    const merged = await mergePdfBuffers(pdfParts);
    const mergedBuffer = Buffer.isBuffer(merged) ? merged : Buffer.from(merged);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="print-bundle-${order.id}.pdf"`);
    res.send(mergedBuffer);
  } catch (error) {
    console.error('Failed to generate print bundle:', error);
    res.status(500).json({ error: 'Failed to prepare print bundle' });
  }
});

app.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const statusUpdate = { status, lastStatusUpdateAt: timestamp };
    if (status === 'kit_sent') {
      statusUpdate.kitSentAt = timestamp;
    }
    if (status === 'needs_printing') {
      statusUpdate.needsPrintingAt = timestamp;
    }

    const { order } = await updateOrderBoth(orderId, statusUpdate);

    let customerNotificationPromise = Promise.resolve();
    let customerEmailHtml = "";
    const customerName = order.shippingInfo.fullName;

    switch (status) {
      case "received": {
        customerEmailHtml = DEVICE_RECEIVED_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
          .replace(/\*\*ORDER_ID\*\*/g, order.id);

        customerNotificationPromise = transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: order.shippingInfo.email,
          subject: "Your SecondHandCell Device Has Arrived",
          html: customerEmailHtml,
          bcc: ["sales@secondhandcell.com"]
        });
        break;
      }
      case "completed": {
        const payoutAmount = getOrderPayout(order);
        const wasReoffered = !!(order.reOffer && Object.keys(order.reOffer).length);
        const completedTemplate = getOrderCompletedEmailTemplate({ includeTrustpilot: !wasReoffered });
        customerEmailHtml = applyTemplate(completedTemplate, {
          "**CUSTOMER_NAME**": customerName,
          "**ORDER_ID**": order.id,
          "**DEVICE_SUMMARY**": buildDeviceSummary(order),
          "**ORDER_TOTAL**": formatCurrencyValue(payoutAmount),
          "**PAYMENT_METHOD**": formatDisplayText(order.paymentMethod, "Not specified"),
        });

        customerNotificationPromise = transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: order.shippingInfo.email,
          subject: "Your SecondHandCell Order is Complete",
          html: customerEmailHtml,
          bcc: ["sales@secondhandcell.com"]
        });
        break;
      }
      default: {
        break;
      }
    }

    await customerNotificationPromise;

    res.json({ message: `Order marked as ${status}` });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.post('/orders/:id/send-review-request', async (req, res) => {
  try {
    const orderId = req.params.id;
    const docRef = ordersCollection.doc(orderId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const customerEmail = order.shippingInfo?.email;
    if (!customerEmail) {
      return res.status(400).json({ error: 'Order does not have a customer email on file.' });
    }

    const customerName = order.shippingInfo?.fullName || 'there';
    const payoutAmount = getOrderPayout(order);

    const reviewEmailHtml = applyTemplate(REVIEW_REQUEST_EMAIL_HTML, {
      "**CUSTOMER_NAME**": customerName,
      "**ORDER_ID**": order.id,
      "**DEVICE_SUMMARY**": buildDeviceSummary(order),
      "**ORDER_TOTAL**": formatCurrencyValue(payoutAmount),
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: 'Quick review? Share your SecondHandCell experience',
      html: reviewEmailHtml,
      bcc: ['sales@secondhandcell.com']
    });

    await updateOrderBoth(orderId, {
      reviewRequestSentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Review request email sent successfully.' });
  } catch (error) {
    console.error('Error sending review request:', error);
    res.status(500).json({ error: 'Failed to send review request email.' });
  }
});

app.post('/orders/:id/mark-kit-sent', async (req, res) => {
  try {
    const orderId = req.params.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const { order } = await updateOrderBoth(orderId, {
      status: 'kit_sent',
      kitSentAt: timestamp,
      lastStatusUpdateAt: timestamp,
    });

    res.json({
      message: `Order ${orderId} marked as kit sent`,
      orderId,
      status: order.status,
    });
  } catch (error) {
    console.error('Error marking kit as sent:', error);
    res.status(500).json({ error: 'Failed to mark kit as sent' });
  }
});

app.post('/orders/:id/refresh-kit-tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    const doc = await ordersCollection.doc(orderId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };

    if (!order.outboundTrackingNumber) {
      return res.status(400).json({ error: 'Outbound tracking number not available for this order' });
    }

    const shipengineKey = process.env.SHIPENGINE_KEY;
    if (!shipengineKey) {
      return res.status(500).json({ error: 'ShipEngine API key not configured.' });
    }

    const { updatePayload, delivered } = await buildKitTrackingUpdate(order, {
      axiosClient: axios,
      shipengineKey,
      defaultCarrierCode: DEFAULT_CARRIER_CODE,
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const { order: updatedOrder } = await updateOrderBoth(orderId, {
      ...updatePayload,
      kitTrackingLastRefreshedAt: timestamp,
    });

    res.json({
      message: delivered ? 'Kit marked as delivered.' : 'Kit tracking status refreshed.',
      delivered,
      tracking: updatePayload.kitTrackingStatus,
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
      },
    });
  } catch (error) {
    console.error('Error refreshing kit tracking:', error);
    res.status(500).json({ error: 'Failed to refresh kit tracking' });
  }
});

app.post('/orders/:id/sync-outbound-tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    const doc = await ordersCollection.doc(orderId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const trackingNumber = order.outboundTrackingNumber;
    if (!trackingNumber) {
      return res.status(400).json({ error: 'No outbound tracking number on file.' });
    }

    const shipEngineKey = process.env.SHIPENGINE_KEY;
    if (!shipEngineKey) {
      return res.status(500).json({ error: 'ShipEngine API key not configured.' });
    }

    const trackingUrl = `https://api.shipengine.com/v1/tracking?tracking_number=${encodeURIComponent(trackingNumber)}`;
    const response = await axios.get(trackingUrl, {
      headers: { 'API-Key': shipEngineKey },
    });

    const trackingData = response?.data && typeof response.data === 'object'
      ? response.data
      : null;

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (!trackingData) {
      await updateOrderBoth(orderId, {
        outboundTrackingLastSyncedAt: timestamp,
      }, {
        autoLogStatus: false,
        logEntries: [
          {
            type: 'tracking',
            message: 'Outbound tracking sync attempted but ShipEngine returned no data.',
            metadata: { trackingNumber },
          },
        ],
      });

      return res.json({
        message: 'ShipEngine returned no outbound tracking data. Order was left unchanged.',
        order: { id: orderId, status: order.status },
        tracking: null,
      });
    }

    const normalizedStatus = mapShipEngineStatus(trackingData.status_code || trackingData.statusCode);
    const updatePayload = {
      outboundTrackingStatus: trackingData.status_code || trackingData.statusCode || null,
      outboundTrackingStatusDescription: trackingData.status_description || trackingData.statusDescription || null,
      outboundTrackingCarrierCode: trackingData.carrier_code || trackingData.carrierCode || null,
      outboundTrackingCarrierStatusCode: trackingData.carrier_status_code || trackingData.carrierStatusCode || null,
      outboundTrackingCarrierStatusDescription: trackingData.carrier_status_description || trackingData.carrierStatusDescription || null,
      outboundTrackingEstimatedDelivery: trackingData.estimated_delivery_date || trackingData.estimatedDeliveryDate || null,
      outboundTrackingLastSyncedAt: timestamp,
    };

    if (Array.isArray(trackingData.events)) {
      updatePayload.outboundTrackingEvents = trackingData.events;
    } else if (Array.isArray(trackingData.activities)) {
      updatePayload.outboundTrackingEvents = trackingData.activities;
    }

    if (normalizedStatus && shouldPromoteKitStatus(order.status, normalizedStatus)) {
      updatePayload.status = normalizedStatus;
      updatePayload.lastStatusUpdateAt = timestamp;

      if (normalizedStatus === 'kit_delivered') {
        updatePayload.kitDeliveredAt = timestamp;
      }
      if (normalizedStatus === 'kit_in_transit' && !order.kitSentAt) {
        updatePayload.kitSentAt = timestamp;
      }
    }

    const { order: updatedOrder } = await updateOrderBoth(orderId, updatePayload);

    res.json({
      message: 'Outbound tracking synchronized.',
      orderId,
      status: updatedOrder.status,
      tracking: trackingData,
    });
  } catch (error) {
    console.error('Error syncing outbound tracking:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to sync outbound tracking' });
  }
});

app.post('/orders/:id/sync-label-tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    const doc = await ordersCollection.doc(orderId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const trackingNumber =
      order.trackingNumber || order.inboundTrackingNumber || null;

    if (!trackingNumber) {
      return res
        .status(400)
        .json({ error: 'No inbound tracking number on file for this order.' });
    }

    const shipEngineKey = process.env.SHIPENGINE_KEY;
    if (!shipEngineKey) {
      return res.status(500).json({ error: 'ShipEngine API key not configured.' });
    }

    const trackingUrl = `https://api.shipengine.com/v1/tracking?tracking_number=${encodeURIComponent(
      trackingNumber
    )}`;
    const response = await axios.get(trackingUrl, {
      headers: { 'API-Key': shipEngineKey },
    });

    const trackingData = response?.data && typeof response.data === 'object'
      ? response.data
      : null;

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (!trackingData) {
      const { order: updatedOrder } = await updateOrderBoth(orderId, {
        labelTrackingLastSyncedAt: timestamp,
      }, {
        autoLogStatus: false,
        logEntries: [
          {
            type: 'tracking',
            message: 'Inbound label tracking sync attempted but ShipEngine returned no data.',
            metadata: { trackingNumber },
          },
        ],
      });

      return res.json({
        message: 'ShipEngine returned no inbound tracking data. Order was left unchanged.',
        order: { id: updatedOrder.id, status: updatedOrder.status },
        tracking: null,
      });
    }

    const updatePayload = {
      labelTrackingStatus:
        trackingData.status_code || trackingData.statusCode || null,
      labelTrackingStatusDescription:
        trackingData.status_description || trackingData.statusDescription || null,
      labelTrackingCarrierStatusCode:
        trackingData.carrier_status_code || trackingData.carrierStatusCode || null,
      labelTrackingCarrierStatusDescription:
        trackingData.carrier_status_description ||
        trackingData.carrierStatusDescription ||
        null,
      labelTrackingEstimatedDelivery:
        trackingData.estimated_delivery_date ||
        trackingData.estimatedDeliveryDate ||
        null,
      labelTrackingLastSyncedAt: timestamp,
    };

    if (Array.isArray(trackingData.events)) {
      updatePayload.labelTrackingEvents = trackingData.events;
    } else if (Array.isArray(trackingData.activities)) {
      updatePayload.labelTrackingEvents = trackingData.activities;
    }

    const normalizedStatus = String(
      updatePayload.labelTrackingStatus || ''
    ).toUpperCase();
    if (normalizedStatus === 'DELIVERED') {
      updatePayload.labelDeliveredAt = timestamp;
    }

    const { order: updatedOrder } = await updateOrderBoth(orderId, updatePayload, {
      autoLogStatus: false,
      logEntries: [
        {
          type: 'tracking',
          message: `Inbound label tracking synchronized (${updatePayload.labelTrackingStatusDescription || updatePayload.labelTrackingStatus || 'unknown'})`,
          metadata: { trackingNumber },
        },
      ],
    });

    res.json({
      message: 'Label tracking synchronized.',
      order: { id: updatedOrder.id, status: updatedOrder.status },
      tracking: updatePayload,
    });
  } catch (error) {
    console.error('Error syncing label tracking:', error.response?.data || error);
    const message =
      error.response?.data?.error || error.message || 'Failed to sync label tracking';
    res.status(500).json({ error: message });
  }
});

app.post("/orders/:id/re-offer", async (req, res) => {
  try {
    const { newPrice, reasons, comments } = req.body;
    const orderId = req.params.id;

    if (!newPrice || !reasons || !Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({ error: "New price and at least one reason are required" });
    }

    const orderRef = ordersCollection.doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = { id: orderDoc.id, ...orderDoc.data() };

    await updateOrderBoth(orderId, {
      reOffer: {
        newPrice,
        reasons,
        comments,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        autoAcceptDate: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      status: "re-offered-pending",
    });

    let reasonString = reasons.join(", ");
    if (comments) reasonString += `; ${comments}`;

    const safeReason = escapeHtml(reasonString).replace(/\n/g, "<br>");
    const originalQuoteValue = Number(order.estimatedQuote || order.originalQuote || 0).toFixed(2);
    const newOfferValue = Number(newPrice).toFixed(2);
    const customerName = order.shippingInfo.fullName || "there";
    const acceptUrl = `${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderId}&action=accept`;
    const returnUrl = `${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderId}&action=return`;

    const customerEmailHtml = buildEmailLayout({
      title: "Updated offer available",
      accentColor: "#6366f1",
      includeTrustpilot: false,
      bodyHtml: `
          <p>Hi ${escapeHtml(customerName)},</p>
          <p>Thanks for sending in your device. After inspecting order <strong>#${escapeHtml(order.id)}</strong>, we have a revised offer for you.</p>
          <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:18px; padding:20px 24px; margin:28px 0;">
            <p style="margin:0 0 12px; color:#312e81;"><strong>Original Quote:</strong> $${originalQuoteValue}</p>
            <p style="margin:0; color:#1e1b4b; font-size:20px; font-weight:700;">New Offer: $${newOfferValue}</p>
          </div>
          <p style="margin-bottom:12px;">Reason for the change:</p>
          <p style="background:#fef3c7; border-radius:14px; border:1px solid #fde68a; color:#92400e; padding:14px 18px; margin:0 0 28px;">${safeReason}</p>
          <p style="margin-bottom:20px;">Choose how you'd like to proceed:</p>
          <div style="text-align:center; margin-bottom:20px;">
            <a href="${acceptUrl}" class="button-link" style="background-color:#16a34a;">Accept offer ($${newOfferValue})</a>
          </div>
          <div style="text-align:center; margin-bottom:24px;">
            <a href="${returnUrl}" class="button-link" style="background-color:#dc2626;">Return device instead</a>
          </div>
          <p>Questions or feedback? Reply to this email—we're here to help.</p>
      `,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: order.shippingInfo.email,
      subject: `Re-offer for Order #${order.id}`,
      html: customerEmailHtml,
      bcc: ["sales@secondhandcell.com"]
    });

    res.json({ message: "Re-offer submitted successfully", newPrice, orderId: order.id });
  } catch (err) {
    console.error("Error submitting re-offer:", err);
    res.status(500).json({ error: "Failed to submit re-offer" });
  }
});

app.post("/orders/:id/return-label", async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    const order = { id: doc.id, ...doc.data() };

    const buyerShippingInfo = order.shippingInfo;
    const orderIdForLabel = order.id || "N/A";

    const swiftBuyBackAddress = {
      name: "SHC Returns",
      company_name: "SecondHandCell",
      phone: "3475591707",
      address_line1: "1602 MCDONALD AVE STE REAR ENTRANCE",
      city_locality: "Brooklyn",
      state_province: "NY",
      postal_code: "11230-6336",
      country_code: "US",
    };

    const buyerAddress = {
      name: buyerShippingInfo.fullName,
      phone: "3475591707",
      address_line1: buyerShippingInfo.streetAddress,
      city_locality: buyerShippingInfo.city,
      state_province: buyerShippingInfo.state,
      postal_code: buyerShippingInfo.zipCode,
      country_code: "US",
    };
    
    // Package data for the return label (phone inside kit)
    const returnPackageData = {
      service_code: "usps_first_class_mail",
      dimensions: { unit: "inch", height: 2, width: 4, length: 6 },
      weight: { ounces: 8, unit: "ounce" }, // Phone weighs 8oz
    };


    const returnLabelData = await createShipEngineLabel(
      buyerAddress,
      swiftBuyBackAddress,
      `${orderIdForLabel}-RETURN`,
      returnPackageData
    );

    const returnTrackingNumber = returnLabelData.tracking_number;

    await updateOrderBoth(req.params.id, {
      status: "return-label-generated",
      returnLabelUrl: returnLabelData.label_download?.pdf,
      returnTrackingNumber: returnTrackingNumber,
    });

    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: order.shippingInfo.email,
      subject: "Your SecondHandCell Return Label",
      html: `
        <p>Hello ${order.shippingInfo.fullName},</p>
        <p>As requested, here is your return shipping label for your device (Order ID: ${order.id}):</p>
        <p>Return Tracking Number: <strong>${returnTrackingNumber || "N/A"}</strong></p>
        <a href="${returnLabelData.label_download?.pdf}">Download Return Label</a>
        <p>Thank you,</p>
        <p>The SecondHandCell Team</p>
      `,
      bcc: ["sales@secondhandcell.com"]
    };

    await transporter.sendMail(customerMailOptions);

    res.json({
      message: "Return label generated successfully.",
      returnLabelUrl: returnLabelData.label_download?.pdf,
      returnTrackingNumber: returnTrackingNumber,
      orderId: order.id,
    });
  } catch (err) {
    console.error("Error generating return label:", err.response?.data || err);
    res.status(500).json({ error: "Failed to generate return label" });
  }
});

app.post("/orders/:id/cancel", async (req, res) => {
  try {
    const orderId = req.params.id;
    const doc = await ordersCollection.doc(orderId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = { id: doc.id, ...doc.data() };
    const reason = req.body?.reason || "cancelled_by_admin";
    const initiatedBy = req.body?.initiatedBy || req.body?.cancelledBy || null;
    const notifyCustomer = req.body?.notifyCustomer !== false;
    const shouldVoidLabels = req.body?.voidLabels !== false;

    const { order: updatedOrder, voidResults } = await cancelOrderAndNotify(order, {
      auto: false,
      reason,
      initiatedBy,
      notifyCustomer,
      voidLabels: shouldVoidLabels,
    });

    const attemptedCount = Array.isArray(voidResults) ? voidResults.length : 0;
    const approvedCount = Array.isArray(voidResults)
      ? voidResults.filter((entry) => entry && entry.approved).length
      : 0;
    const deniedCount = Math.max(0, attemptedCount - approvedCount);

    let message = `Order ${orderId} has been cancelled.`;
    if (attemptedCount > 0) {
      if (approvedCount > 0) {
        message += ` ${approvedCount} shipping label${approvedCount === 1 ? '' : 's'} voided successfully.`;
      }
      if (deniedCount > 0) {
        message += ` ${deniedCount} label${deniedCount === 1 ? '' : 's'} could not be voided automatically.`;
      }
    } else if (shouldVoidLabels) {
      message += ' No active shipping labels required voiding.';
    }

    res.json({
      message,
      order: updatedOrder,
      voidResults,
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

app.post("/accept-offer-action", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    const docRef = ordersCollection.doc(orderId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = { id: doc.id, ...doc.data() };
    if (orderData.status !== "re-offered-pending") {
      return res
        .status(409)
        .json({ error: "This offer has already been accepted or declined." });
    }

    await updateOrderBoth(orderId, {
      status: "re-offered-accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const customerHtmlBody = `
      <p>Thank you for accepting the revised offer for Order <strong>#${orderData.id}</strong>.</p>
      <p>We've received your confirmation, and payment processing will now begin.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: orderData.shippingInfo.email,
      subject: `Offer Accepted for Order #${orderData.id}`,
      html: customerHtmlBody,
      bcc: ["sales@secondhandcell.com"]
    });

    res.json({ message: "Offer accepted successfully.", orderId: orderData.id });
  } catch (err) {
    console.error("Error accepting offer:", err);
    res.status(500).json({ error: "Failed to accept offer" });
  }
});

app.post("/return-phone-action", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    const docRef = ordersCollection.doc(orderId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = { id: doc.id, ...doc.data() };
    if (orderData.status !== "re-offered-pending") {
      return res
        .status(409)
        .json({ error: "This offer has already been accepted or declined." });
    }

    await updateOrderBoth(orderId, {
      status: "re-offered-declined",
      declinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const customerHtmlBody = `
      <p>We have received your request to decline the revised offer and have your device returned. We are now processing your request and will send a return shipping label to your email shortly.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: orderData.shippingInfo.email,
      subject: `Return Requested for Order #${orderData.id}`,
      html: customerHtmlBody,
      bcc: ["sales@secondhandcell.com"]
    });

    res.json({ message: "Return requested successfully.", orderId: orderData.id });
  } catch (err) {
    console.error("Error requesting return:", err);
    res.status(500).json({ error: "Failed to request return" });
  }
});

app.delete("/orders/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderRef = ordersCollection.doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const orderData = orderDoc.data();
    const userId = orderData.userId;

    // Delete from the main collection
    await orderRef.delete();

    // If a userId is associated, delete from the user's subcollection as well
    if (userId) {
      const userOrderRef = usersCollection.doc(userId).collection("orders").doc(orderId);
      await userOrderRef.delete();
    }

    res.status(200).json({ message: `Order ${orderId} deleted successfully.` });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Failed to delete order." });
  }
});

// A new route to handle sending a general email
app.post("/send-email", async (req, res) => {
    try {
        const { to, bcc, subject, html } = req.body;
        if (!to || !subject || !html) {
            return res.status(400).json({ error: "Missing required fields: to, subject, and html are required." });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            html: html,
            bcc: bcc || [], // Use the bcc from the request body, or an empty array if not provided
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "Email sent successfully." });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email." });
    }
});

async function runAutomaticLabelVoidSweep() {
  const shipengineKey = getShipEngineApiKey();
  if (!shipengineKey) {
    console.warn(
      "Skipping automatic label void sweep because ShipEngine API key is not configured."
    );
    return;
  }

  const primarySnapshot = await ordersCollection
    .where("hasActiveShipEngineLabel", "==", true)
    .limit(AUTO_VOID_QUERY_LIMIT)
    .get();

  const docsToProcess = primarySnapshot.docs ? [...primarySnapshot.docs] : [];

  if (docsToProcess.length < AUTO_VOID_QUERY_LIMIT) {
    const fallbackLimit = AUTO_VOID_QUERY_LIMIT - docsToProcess.length;
    const fallbackSnapshot = await ordersCollection
      .where("hasActiveShipEngineLabel", "==", null)
      .limit(fallbackLimit)
      .get();

    fallbackSnapshot.forEach((doc) => {
      docsToProcess.push(doc);
    });
  }

  if (!docsToProcess.length) {
    return;
  }

  const processedIds = new Set();

  for (const doc of docsToProcess) {
    if (processedIds.has(doc.id)) continue;
    processedIds.add(doc.id);
    const order = { id: doc.id, ...doc.data() };
    const labels = normalizeShipEngineLabelMap(order);
    const selections = [];

    for (const [key, entry] of Object.entries(labels)) {
      if (!entry || !entry.id) continue;
      if (!isLabelPendingVoid(entry)) continue;

      const generatedDate =
        toDate(entry.generatedAt || entry.createdAt) ||
        toDate(order.labelGeneratedAt || order.kitLabelGeneratedAt || order.createdAt);
      if (!generatedDate) continue;

      const ageMs = Date.now() - generatedDate.getTime();
      if (ageMs < AUTO_VOID_DELAY_MS) continue;

      const lastAttempt =
        toDate(entry.autoVoidAttemptedAt || entry.lastVoidAttemptAt) || null;
      if (lastAttempt) {
        const sinceLastAttempt = Date.now() - lastAttempt.getTime();
        if (sinceLastAttempt < AUTO_VOID_RETRY_DELAY_MS) {
          continue;
        }
      }

      selections.push({ key, id: entry.id });
    }

    if (!selections.length) {
      continue;
    }

    try {
      const { results } = await handleLabelVoid(order, selections, {
        reason: "automatic",
        shipengineKey,
      });
      try {
        await sendVoidNotificationEmail(order, results, { reason: "automatic" });
      } catch (notificationError) {
        console.error(
          `Failed to send automatic void notification for order ${order.id}:`,
          notificationError
        );
      }
    } catch (error) {
      console.error(
        `Automatic label void failed for order ${order.id}:`,
        error
      );
    }
  }
}

exports.autoVoidExpiredLabels = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async () => {
    try {
      await runAutomaticLabelVoidSweep();
    } catch (error) {
      console.error("Automatic label void sweep failed:", error);
    }
    return null;
  });

exports.autoAcceptOffers = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredOffers = await ordersCollection
      .where("status", "==", "re-offered-pending")
      .where("reOffer.autoAcceptDate", "<=", now)
      .get();

    const updates = expiredOffers.docs.map(async (doc) => {
      const orderData = { id: doc.id, ...doc.data() };

      const customerHtmlBody = `
        <p>Hello ${orderData.shippingInfo.fullName},</p>
        <p>As we have not heard back from you regarding your revised offer, it has been automatically accepted as per our terms and conditions.</p>
        <p>Payment processing for the revised amount of <strong>$${orderData.reOffer.newPrice.toFixed(
          2
        )}</strong> will now begin.</p>
        <p>Thank you,</p>
        <p>The SecondHandCell Team</p>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: orderData.shippingInfo.email,
        subject: `Revised Offer Auto-Accepted for Order #${orderData.id}`,
        html: customerHtmlBody,
        bcc: ["sales@secondhandcell.com"]
      });

      await updateOrderBoth(doc.id, {
        status: "re-offered-auto-accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await Promise.all(updates);
    console.log(`Auto-accepted ${updates.length} expired offers.`);
    return null;
  });

async function runAutoRequoteSweep() {
  const thresholdTimestamp = admin.firestore.Timestamp.fromMillis(
    Date.now() - AUTO_REQUOTE_DELAY_MS
  );

  const seen = new Set();
  const ordersToProcess = [];

  const emailedQuery = await ordersCollection
    .where("status", "==", "emailed")
    .where("emailedAt", "<=", thresholdTimestamp)
    .get();

  emailedQuery.forEach((doc) => {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      ordersToProcess.push({ id: doc.id, ...doc.data() });
    }
  });

  const emailedWithoutTimestamp = await ordersCollection
    .where("status", "==", "emailed")
    .where("emailedAt", "==", null)
    .where("lastStatusUpdateAt", "<=", thresholdTimestamp)
    .get();

  emailedWithoutTimestamp.forEach((doc) => {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      ordersToProcess.push({ id: doc.id, ...doc.data() });
    }
  });

  for (const order of ordersToProcess) {
    try {
      const { order: updatedOrder } = await updateOrderBoth(
        order.id,
        {
          status: "requote_accepted",
          requoteAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          requoteAutoAccepted: true,
        },
        {
          logEntries: [
            {
              type: "system",
              message:
                "Order automatically moved to Requote Accepted after 7 days without a response.",
              metadata: { previousStatus: order.status },
            },
          ],
        }
      );

      if (updatedOrder?.shippingInfo?.email) {
        const customerName = updatedOrder.shippingInfo.fullName || "there";
        const htmlBody = `
          <p>Hi ${escapeHtml(customerName)},</p>
          <p>We followed up about your shipping label for order <strong>#${escapeHtml(
            updatedOrder.id
          )}</strong> but didn’t hear back.</p>
          <p>To keep your account tidy we’ve marked the order as <strong>Requote Accepted</strong>. If you still plan to send your device, reply to this email and we’ll send a fresh label.</p>
          <p>— The SecondHandCell Team</p>
        `;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: updatedOrder.shippingInfo.email,
          subject: `Order #${updatedOrder.id} marked as Requote Accepted`,
          html: htmlBody,
          bcc: [process.env.SALES_EMAIL || "sales@secondhandcell.com"],
        });
      }
    } catch (error) {
      console.error(
        `Failed to auto-requote emailed order ${order.id}:`,
        error
      );
    }
  }
}

exports.autoFinalizeEmailedOrders = functions.pubsub
  .schedule("every 12 hours")
  .onRun(async () => {
    try {
      await runAutoRequoteSweep();
    } catch (error) {
      console.error("Automatic requote sweep failed:", error);
    }
    return null;
  });

async function runAutoCancellationSweep() {
  const thresholdTimestamp = admin.firestore.Timestamp.fromMillis(
    Date.now() - AUTO_CANCEL_DELAY_MS
  );

  const snapshot = await ordersCollection
    .where("status", "in", AUTO_CANCEL_MONITORED_STATUSES)
    .where("lastStatusUpdateAt", "<=", thresholdTimestamp)
    .get();

  for (const doc of snapshot.docs) {
    const order = { id: doc.id, ...doc.data() };
    try {
      await cancelOrderAndNotify(order, {
        auto: true,
        reason: "no_activity_15_days",
      });
    } catch (error) {
      console.error(
        `Failed to auto-cancel dormant order ${order.id}:`,
        error
      );
    }
  }
}

exports.autoCancelDormantOrders = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    try {
      await runAutoCancellationSweep();
    } catch (error) {
      console.error("Automatic cancellation sweep failed:", error);
    }
    return null;
  });

// This function creates a user document in the 'users' collection, but NOT in the 'admins' collection.
exports.createUserRecord = functions.auth.user().onCreate(async (user) => {
  try {
    // Do not create a user record if the user is anonymous (no email)
    if (!user.email) {
      console.log(`Anonymous user created: ${user.uid}. Skipping Firestore record creation.`);
      return null;
    }

    console.log(`New user created: ${user.uid}`);
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null,
      phoneNumber: user.phoneNumber || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // NOTE: No 'isAdmin' field is set here. User accounts are only written to the usersCollection.
    };

    await usersCollection.doc(user.uid).set(userData);
    console.log(`User data for ${user.uid} saved to Firestore (users collection).`);
  } catch (error) {
    console.error("Error saving user data to Firestore:", error);
  }
});

// Send Reminder Email for label_generated orders
exports.sendReminderEmail = functions.https.onCall(async (data, context) => {
  try {
    // 1. Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    // 2. Verify user is an admin by checking admins collection
    const adminDoc = await adminsCollection.doc(context.auth.uid).get();
    if (!adminDoc.exists) {
      console.warn(`Unauthorized reminder email attempt by user: ${context.auth.uid}`);
      throw new functions.https.HttpsError('permission-denied', 'Only admins can send reminder emails');
    }

    const { orderId } = data;
    
    // 3. Validate orderId is provided
    if (!orderId) {
      throw new functions.https.HttpsError('invalid-argument', 'Order ID is required');
    }

    // 4. Validate orderId format (prevent injection attacks)
    if (typeof orderId !== 'string' || orderId.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid order ID format');
    }

    const sanitizedOrderId = orderId.trim();

    // 5. Get order and verify it exists
    const orderDoc = await ordersCollection.doc(sanitizedOrderId).get();
    
    if (!orderDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const order = orderDoc.data();
    
    // 6. Verify order status is label_generated/emailed
    if (!['label_generated', 'emailed'].includes(order.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'Can only send reminders for orders with generated labels');
    }

    // Create super cool email template
    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⏰ Reminder: We're Waiting for Your Device!</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ea580c 100%);
      padding: 48px 32px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      animation: pulse 3s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
    
    .emoji-icon {
      font-size: 64px;
      margin-bottom: 16px;
      display: block;
      animation: bounce 2s ease-in-out infinite;
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: relative;
      z-index: 1;
    }
    
    .header p {
      font-size: 16px;
      color: rgba(255,255,255,0.95);
      margin: 12px 0 0;
      position: relative;
      z-index: 1;
    }
    
    .content {
      padding: 40px 32px;
      color: #374151;
      font-size: 16px;
      line-height: 1.6;
    }
    
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 24px;
    }
    
    .message-box {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-left: 4px solid #f59e0b;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.1);
    }
    
    .message-box p {
      margin: 0 0 12px;
      color: #92400e;
      font-weight: 600;
      font-size: 17px;
    }
    
    .message-box p:last-child {
      margin-bottom: 0;
    }
    
    .tracking-box {
      background: #f3f4f6;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    
    .tracking-label {
      font-size: 13px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .tracking-number {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      font-family: 'Courier New', monospace;
      letter-spacing: 1px;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
      color: #ffffff;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 700;
      font-size: 16px;
      margin: 24px auto;
      display: block;
      text-align: center;
      max-width: 280px;
      box-shadow: 0 8px 24px rgba(245, 158, 11, 0.3);
      transition: all 0.3s ease;
    }
    
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(245, 158, 11, 0.4);
    }
    
    .urgency-text {
      background: #fef2f2;
      border: 2px solid #fecaca;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    
    .urgency-text p {
      margin: 0;
      color: #991b1b;
      font-weight: 600;
      font-size: 15px;
    }
    
    .urgency-text .icon {
      font-size: 24px;
      margin-bottom: 8px;
      display: block;
    }
    
    .footer {
      background: #f9fafb;
      padding: 32px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    
    .footer p {
      margin: 8px 0;
      color: #6b7280;
      font-size: 14px;
    }
    
    .footer a {
      color: #f59e0b;
      text-decoration: none;
      font-weight: 600;
    }
    
    .footer a:hover {
      text-decoration: underline;
    }
    
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, #e5e7eb 50%, transparent 100%);
      margin: 32px 0;
    }
    
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 20px auto;
        border-radius: 0;
      }
      
      .header {
        padding: 32px 24px;
      }
      
      .header h1 {
        font-size: 24px;
      }
      
      .content {
        padding: 32px 24px;
      }
      
      .emoji-icon {
        font-size: 48px;
      }
      
      .tracking-number {
        font-size: 18px;
      }
      
      .cta-button {
        padding: 14px 24px;
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <span class="emoji-icon">⏰</span>
      <h1>Friendly Reminder!</h1>
      <p>We're excited to complete your device trade-in</p>
    </div>
    
    <div class="content">
      <p class="greeting">Hi ${order.shippingInfo?.fullName || 'there'},</p>
      
      <p>We wanted to send you a quick reminder about your device trade-in for order <strong>#${orderId}</strong>!</p>
      
      <div class="message-box">
        <p>📦 Your shipping label is ready and waiting!</p>
        <p>We're excited to receive your <strong>${order.device}</strong> and complete your trade-in.</p>
      </div>
      
      ${order.trackingNumber || order.inboundTrackingNumber ? `
      <div class="tracking-box">
        <div class="tracking-label">Your Tracking Number</div>
        <div class="tracking-number">${order.trackingNumber || order.inboundTrackingNumber}</div>
      </div>
      ` : ''}
      
      <div class="steps-list">
        <h3>📝 Quick Checklist Before Shipping:</h3>
        <ol>
          <li><strong>Back up your data</strong> - Save all photos, contacts, and files</li>
          <li><strong>Factory reset your device</strong> - Remove all personal information</li>
          <li><strong>Sign out of all accounts</strong> (iCloud, Google, etc.)</li>
          <li><strong>Remove your SIM card</strong></li>
          <li><strong>Pack securely</strong> and attach your shipping label</li>
        </ol>
      </div>
      
      ${order.trackingNumber || order.inboundTrackingNumber ? `
      <a href="https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${order.trackingNumber || order.inboundTrackingNumber}" class="cta-button">
        📍 Track Your Shipment
      </a>
      ` : ''}
      
      <div class="urgency-text">
        <span class="icon">⚡</span>
        <p>The sooner you ship, the sooner you get paid!</p>
        <p>We typically process devices within 24-48 hours of receipt.</p>
      </div>
      
      <div class="divider"></div>
      
      <p style="text-align: center; color: #6b7280; font-size: 15px;">
        Have questions? Just reply to this email - we're here to help! 💬
      </p>
    </div>
    
    <div class="footer">
      <p><strong>SecondHandCell</strong></p>
      <p>Making device trade-ins simple and rewarding</p>
      <p style="margin-top: 16px;">
        <a href="https://secondhandcell.com">Visit our website</a> • 
        <a href="mailto:support@secondhandcell.com">Contact Support</a>
      </p>
      <p style="margin-top: 16px; font-size: 12px;">
        This is an automated reminder for your trade-in order #${orderId}
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    // 7. Send the email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: order.shippingInfo?.email,
      subject: '⏰ Friendly Reminder: We\'re Waiting for Your Device! 📱',
      html: emailHtml,
      bcc: ["sales@secondhandcell.com"]
    });

    await updateOrderBoth(
      sanitizedOrderId,
      { lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp() },
      {
        autoLogStatus: false,
        logEntries: [
          {
            type: 'reminder',
            message: 'Reminder email sent to customer.',
          },
        ],
      }
    );

    // 8. Log admin action for audit trail
    const auditLog = {
      action: 'send_reminder_email',
      adminUid: context.auth.uid,
      adminEmail: context.auth.token.email || 'unknown',
      orderId: sanitizedOrderId,
      orderStatus: order.status,
      recipientEmail: order.shippingInfo?.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    };
    
    await db.collection('adminAuditLogs').add(auditLog);
    
    console.log(`[AUDIT] Admin ${context.auth.uid} sent reminder email for order ${sanitizedOrderId} to ${order.shippingInfo?.email}`);
    
    return { 
      success: true, 
      message: 'Reminder email sent successfully' 
    };
  } catch (error) {
    console.error('Error sending reminder email:', error);
    
    // Log failed attempts for security monitoring
    if (context?.auth) {
      try {
        await db.collection('adminAuditLogs').add({
          action: 'send_reminder_email',
          adminUid: context.auth.uid,
          adminEmail: context.auth.token?.email || 'unknown',
          orderId: data?.orderId || 'unknown',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          success: false,
          errorType: error.code || 'unknown',
          errorMessage: error.message || 'Unknown error'
        });
      } catch (logError) {
        console.error('Failed to log audit entry:', logError);
      }
    }
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to send reminder email');
  }
});

exports.onChatTransferUpdate = functions.firestore
  .document("chats/{chatId}")
  .onUpdate(async (change, context) => {
    // Removed all chat transfer notification logic
    return null;
  });

// FCM Push Notifications for New Chat Messages
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const userIdentifier = chatData.ownerUid || chatData.guestId || "Unknown User";
    const relatedUserId = chatData.ownerUid;
    const assignedAdminUid = chatData.assignedAdminUid;
    
    // Truncate message to 100 characters for notification
    const messageText = newMessage.text || "";
    const truncatedMessage = messageText.length > 100 
      ? messageText.substring(0, 100) + "..." 
      : messageText;

    // Update chat metadata
    await chatDocRef.set({
      lastMessageSender: newMessage.sender,
      lastMessageSeenByAdmin: false,
    }, { merge: true });

    // Notification data payload with all required fields for client
    const notificationData = {
      chatId: chatId,
      message: truncatedMessage,
      userIdentifier: userIdentifier,
      userId: relatedUserId || "guest",
      relatedDocType: "chat",
      relatedDocId: chatId,
      relatedUserId: relatedUserId || "guest",
      timestamp: Date.now().toString(),
    };

    // Determine routing: assigned admin vs all admins
    if (assignedAdminUid) {
      // Chat is assigned - send to specific admin only
      const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
      const adminTokens = adminTokenSnapshot.docs.map(doc => {
        const d = doc.data() || {};
        return d.token || doc.id;
      }).filter(token => token && typeof token === 'string');
      
      if (adminTokens.length > 0) {
        await sendPushNotification(
          adminTokens,
          "💬 New Chat Message",
          `Message from ${userIdentifier}: "${truncatedMessage}"`,
          notificationData
        ).catch((e) => console.error("FCM Send Error (Assigned Chat):", e));
      }
      
      // Add Firestore Notification for the assigned admin
      await addAdminFirestoreNotification(
        assignedAdminUid,
        `New message from ${userIdentifier}: "${truncatedMessage}"`,
        "chat",
        chatId,
        relatedUserId
      ).catch((e) => console.error("Firestore Notification Error:", e));
      
      console.log(`New message in assigned chat ${chatId}. Notification sent to admin ${assignedAdminUid}.`);
    } else {
      // Chat is unassigned - send to ALL admins
      const fcmPromise = sendAdminPushNotification(
        "💬 New Chat Message",
        `Message from ${userIdentifier}: "${truncatedMessage}"`,
        notificationData
      ).catch((e) => console.error("FCM Send Error (Unassigned Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New message from ${userIdentifier}: "${truncatedMessage}"`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error:", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New message in unassigned chat ${chatId}. Notifications sent to all admins.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send email notification.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    const chatId = context.params.chatId;
    const chatData = snap.data();
    
    const userIdentifier = chatData.ownerUid || chatData.guestId || "Unknown User";
    
    // Create email notification for admin
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366F1 0%, #22D3EE 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #6366F1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
            .info { background: white; padding: 16px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #6366F1; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>💬 New Chat Started</h2>
            </div>
            <div class="content">
              <p>A new customer chat has been initiated on SecondHandCell.</p>
              <div class="info">
                <strong>Chat ID:</strong> ${chatId}<br>
                <strong>User:</strong> ${userIdentifier}<br>
                <strong>Time:</strong> ${new Date().toLocaleString()}
              </div>
              <p>Please respond to this chat as soon as possible to provide excellent customer service.</p>
              <a href="https://secondhandcell.com/admin/chat" class="button">View Chat in Admin Panel</a>
            </div>
          </div>
        </body>
      </html>
    `;
    
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: 'sales@secondhandcell.com',
        subject: `New Chat Started - ${userIdentifier}`,
        html: adminEmailHtml,
        bcc: ["saulsetton16@gmail.com"]
      });
      
      console.log(`Email notification sent for new chat ${chatId} from ${userIdentifier}`);
    } catch (error) {
      console.error("Error sending email notification for new chat:", error);
    }
    
    return null;
  });

app.post("/test-emails", async (req, res) => {
  const { email, emailTypes } = req.body;

  if (!email || !emailTypes || !Array.isArray(emailTypes)) {
    return res.status(400).json({ error: "Email and emailTypes array are required." });
  }

  try {
    const testResult = await sendMultipleTestEmails(email, emailTypes);
    console.log("Test emails sent. Types:", emailTypes);
    res.status(200).json(testResult);
  } catch (error) {
    console.error("Failed to send test emails:", error);
    res.status(500).json({ error: `Failed to send test emails: ${error.message}` });
  }
});

function normalizeCheckAllFlag(value, fallbackEnabled) {
  if (value === undefined || value === null || value === "") {
    return fallbackEnabled ? "1" : "0";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "number") {
    return Number(value) === 0 ? "0" : "1";
  }
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) {
    return fallbackEnabled ? "1" : "0";
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return "0";
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return "1";
  }
  return fallbackEnabled ? "1" : "0";
}

function normalizeDeviceTypeForPhoneCheck(value) {
  if (value === undefined || value === null) {
    return "Android";
  }
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) {
    return "Android";
  }
  if (["apple", "ios", "iphone", "ipad", "watch"].includes(normalized)) {
    return "Apple";
  }
  return "Android";
}

function normalizeCarrierForPhoneCheck(value) {
  if (value === undefined || value === null) {
    return "Unlocked";
  }
  const trimmed = value.toString().trim();
  if (!trimmed) {
    return "Unlocked";
  }
  const aliasKey = trimmed.toLowerCase();
  const mapped = PHONECHECK_CARRIER_ALIASES[aliasKey];
  if (mapped && PHONECHECK_ALLOWED_CARRIERS.has(mapped)) {
    return mapped;
  }
  const normalized = trimmed.toUpperCase();
  for (const option of PHONECHECK_ALLOWED_CARRIERS) {
    if (option.toUpperCase() === normalized) {
      return option;
    }
  }
  return "Unlocked";
}

function buildPhoneCheckPayload(fields) {
  const params = new URLSearchParams();
  fields.forEach((field) => {
    if (!field || field.value === undefined || field.value === null) {
      return;
    }
    const stringValue = String(field.value);
    const variants = new Set();
    const primary = field.key || "";
    if (primary) {
      variants.add(primary);
      variants.add(primary.toLowerCase());
      variants.add(primary.toUpperCase());
    }
    (field.aliases || []).forEach((alias) => {
      if (!alias) {
        return;
      }
      variants.add(alias);
      variants.add(alias.toLowerCase());
      variants.add(alias.toUpperCase());
    });
    variants.forEach((variant) => {
      if (variant) {
        params.append(variant, stringValue);
      }
    });
  });
  return params;
}

async function callPhoneCheckEndpoint(url, fields, label) {
  const payload = buildPhoneCheckPayload(fields);
  try {
    const response = await axios.post(url, payload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    });
    return response.data || {};
  } catch (error) {
    const baseMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Unknown error";
    error.message = `${label} request failed: ${baseMessage}`;
    throw error;
  }
}

async function handlePhoneCheckRequest(req, res) {
  try {
    const config = getPhoneCheckConfig();
    if (!config.apiKey || !config.username) {
      return res
        .status(500)
        .json({ error: "PhoneCheck credentials are not configured." });
    }

    const {
      imei,
      deviceType,
      carrier,
      checkAll,
      orderId,
    } = req.body || {};

    const sanitizedImei =
      typeof imei === "string"
        ? imei.trim()
        : String(imei || "").trim();

    if (!sanitizedImei) {
      return res.status(400).json({ error: "IMEI is required." });
    }

    const sanitizedDeviceType = normalizeDeviceTypeForPhoneCheck(deviceType);
    const sanitizedCarrier = normalizeCarrierForPhoneCheck(carrier);

    const defaultCheckAll = normalizeCheckAllFlag(
      config.checkAll,
      true
    );
    const resolvedCheckAll = normalizeCheckAllFlag(
      checkAll,
      defaultCheckAll === "1"
    );

    const endpoints = config.endpoints || {
      deviceInfo: `${
        config.baseUrl || resolvePhoneCheckBaseUrl(config.apiUrl)
      }${PHONECHECK_ENDPOINT_PATHS.deviceInfo}`,
      checkEsn: config.apiUrl || PHONECHECK_DEFAULT_API_URL,
      carrierLock: `${
        config.baseUrl || resolvePhoneCheckBaseUrl(config.apiUrl)
      }${PHONECHECK_ENDPOINT_PATHS.carrierLock}`,
    };

    const [deviceInfoData, esnData, carrierLockData] = await Promise.all([
      callPhoneCheckEndpoint(
        endpoints.deviceInfo,
        [
          { key: "Apikey", value: config.apiKey, aliases: ["apiKey"] },
          { key: "Username", value: config.username, aliases: ["user", "Userid"] },
          { key: "IMEI", value: sanitizedImei },
        ],
        "Device info"
      ),
      callPhoneCheckEndpoint(
        endpoints.checkEsn,
        [
          { key: "Apikey", value: config.apiKey, aliases: ["apiKey"] },
          { key: "Username", value: config.username, aliases: ["user"] },
          { key: "IMEI", value: sanitizedImei },
          { key: "devicetype", value: sanitizedDeviceType },
          { key: "carrier", value: sanitizedCarrier },
          { key: "checkAll", value: resolvedCheckAll },
        ],
        "ESN"
      ),
      callPhoneCheckEndpoint(
        endpoints.carrierLock,
        [
          { key: "Apikey", value: config.apiKey, aliases: ["apiKey"] },
          { key: "Userid", value: config.username, aliases: ["Username", "user"] },
          { key: "devicetype", value: sanitizedDeviceType },
          { key: "Deviceid", value: sanitizedImei, aliases: ["deviceId", "IMEI"] },
        ],
        "Carrier lock"
      ),
    ]);

    const combinedData = {
      deviceInfo: deviceInfoData,
      esn: esnData,
      carrierLock: carrierLockData,
    };
    const summary = analyzePhoneCheckResponse(combinedData);

    const trimmedOrderId =
      typeof orderId === "string" ? orderId.trim() : String(orderId || "").trim();

    let orderUpdated = false;
    if (trimmedOrderId) {
      try {
        const orderRef = ordersCollection.doc(trimmedOrderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
          await updateOrderBoth(
            trimmedOrderId,
            {
              phoneCheck: {
                summary,
                raw: combinedData,
                lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
                imei: sanitizedImei,
              },
              imei: sanitizedImei,
            },
            {
              autoLogStatus: false,
              logEntries: [
                {
                  type: "phonecheck",
                  message: "PhoneCheck completed",
                  metadata: {
                    imei: sanitizedImei,
                    carrier: sanitizedCarrier,
                    deviceType: sanitizedDeviceType,
                  },
                },
              ],
            }
          );
          orderUpdated = true;
        } else {
          console.warn(
            `PhoneCheck update skipped because order ${trimmedOrderId} was not found.`
          );
        }
      } catch (updateError) {
        console.error("Failed to persist PhoneCheck results:", updateError);
      }
    }

    res.json({ success: true, summary, raw: combinedData, orderUpdated });
  } catch (error) {
    console.error(
      "PhoneCheck API error:",
      error.response?.data || error.message || error
    );
    const status = error.response?.status;
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Failed to complete PhoneCheck request.";
    const payload = { error: message };
    if (error.response?.data && typeof error.response.data === "object") {
      payload.details = error.response.data;
    }
    res.status(status && status >= 400 ? status : 500).json(payload);
  }
}

app.post("/api/phone-check", handlePhoneCheckRequest);
app.post("/check-esn", handlePhoneCheckRequest);

app.post("/orders/:id/send-condition-email", async (req, res) => {
  try {
    const { reason, notes } = req.body || {};
    if (!reason || !CONDITION_EMAIL_TEMPLATES[reason]) {
      return res
        .status(400)
        .json({ error: "A valid email reason is required." });
    }

    const orderRef = ordersCollection.doc(req.params.id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = { id: orderSnap.id, ...orderSnap.data() };
    const shippingInfo = order.shippingInfo || {};
    const customerEmail = shippingInfo.email || shippingInfo.emailAddress;
    if (!customerEmail) {
      return res
        .status(400)
        .json({ error: "The order does not have a customer email address." });
    }

    if (!transporter) {
      return res
        .status(500)
        .json({ error: "Email service is not configured." });
    }

    const { subject, html, text } = buildConditionEmail(reason, order, notes);
    const mailOptions = {
      from: CONDITION_EMAIL_FROM_ADDRESS,
      to: customerEmail,
      subject,
      html,
      text,
    };

    if (CONDITION_EMAIL_BCC_RECIPIENTS.length) {
      mailOptions.bcc = CONDITION_EMAIL_BCC_RECIPIENTS;
    }

    await transporter.sendMail(mailOptions);

    res.json({ message: "Email sent successfully." });
  } catch (error) {
    console.error("Failed to send condition email:", error);
    res.status(500).json({ error: "Failed to send condition email." });
  }
});

app.post("/orders/:id/fmi-cleared", async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = ordersCollection.doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return res.status(404).json({ error: "Order not found" });

      const order = { id: doc.id, ...doc.data() };
      
      if (order.status !== "fmi_on_pending") {
          return res.status(409).json({ error: "Order is not in the correct state to be marked FMI cleared." });
      }
      
      await updateOrderBoth(id, {
          status: "fmi_cleared",
          fmiAutoDowngradeDate: null,
      });

      res.json({ message: "FMI status updated successfully." });

    } catch (err) {
        console.error("Error clearing FMI status:", err);
        res.status(500).json({ error: "Failed to clear FMI status" });
    }
});

app.delete("/orders/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderRef = ordersCollection.doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const orderData = orderDoc.data();
    const userId = orderData.userId;

    // Delete from the main collection
    await orderRef.delete();

    // If a userId is associated, delete from the user's subcollection as well
    if (userId) {
      const userOrderRef = usersCollection.doc(userId).collection("orders").doc(orderId);
      await userOrderRef.delete();
    }

    res.status(200).json({ message: `Order ${orderId} deleted successfully.` });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Failed to delete order." });
  }
});

function getWholesaleNotificationInbox() {
  if (process.env.WHOLESALE_NOTIFICATIONS_TO) {
    return process.env.WHOLESALE_NOTIFICATIONS_TO;
  }
  if (process.env.INFO_EMAIL) {
    return process.env.INFO_EMAIL;
  }
  try {
    if (
      functions.config().notifications &&
      functions.config().notifications.wholesale_to
    ) {
      return functions.config().notifications.wholesale_to;
    }
  } catch (error) {
    console.warn(
      "Unable to read notifications.wholesale_to config:",
      error.message
    );
  }
  return "info@secondhandcell.com";
}

function getWholesaleFromAddress() {
  if (process.env.EMAIL_USER) {
    return process.env.EMAIL_USER;
  }
  try {
    if (functions.config().email && functions.config().email.user) {
      return functions.config().email.user;
    }
  } catch (error) {
    console.warn("Unable to read email.user config:", error.message);
  }
  return "info@secondhandcell.com";
}

function formatUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function escapeHtml(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildWholesaleItemsTable(items, { priceOverrides } = {}) {
  const list = Array.isArray(items) ? items : [];
  const overrides = priceOverrides && typeof priceOverrides === "object" ? priceOverrides : {};

  if (!list.length) {
    return "<p style=\"margin:16px 0;\">No line items were provided.</p>";
  }

  let units = 0;
  let total = 0;

  const rows = list
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const overrideKey = item.lineId || item.lineID || item.line_id;
      const overridePrice =
        overrideKey !== undefined && overrideKey !== null
          ? overrides[overrideKey]
          : undefined;
      const price = Number(
        overridePrice ??
          item.acceptedPrice ??
          item.counterPrice ??
          item.offerPrice ??
          0
      );
      const lineTotal = quantity * price;
      units += quantity;
      total += lineTotal;

      const deviceParts = [item.brand, item.model, item.storage, item.grade]
        .filter(Boolean)
        .map((part) => String(part));
      const label =
        item.device ||
        item.title ||
        deviceParts.join(" • ") ||
        "Wholesale device";

      const safeLabel = escapeHtml(label);

      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${safeLabel}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatUsd(price)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatUsd(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f8fafc;">
          <tr>
            <th style="text-align:left;padding:10px 12px;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">Item</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
            <th style="text-align:right;padding:10px 12px;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">Unit Price</th>
            <th style="text-align:right;padding:10px 12px;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">Line Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td style="padding:12px;font-weight:600;color:#0f172a;">Totals</td>
            <td style="padding:12px;text-align:center;font-weight:600;color:#0f172a;">${units}</td>
            <td></td>
            <td style="padding:12px;text-align:right;font-weight:600;color:#0f172a;">${formatUsd(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function buildWholesaleEmailTemplate({
  title,
  intro,
  items,
  priceOverrides,
  note,
  cta,
  footer,
}) {
  const itemsTable = buildWholesaleItemsTable(items, { priceOverrides });
  const safeNote = escapeHtml(note).replace(/\n/g, "<br />");
  const noteBlock = note
    ? `
        <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600;">Notes</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;">${safeNote}</p>
        </div>
      `
    : "";
  const ctaButton = cta && cta.url && cta.label
    ? `
        <div style="margin:24px 0;">
          <a href="${cta.url}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#10b981;color:#ffffff;font-weight:600;text-decoration:none;">${cta.label}</a>
        </div>
      `
    : "";
  const footerBlock = footer
    ? `<p style=\"margin-top:24px;font-size:12px;color:#94a3b8;\">${escapeHtml(footer)}</p>`
    : "";

  const bodyHtml = `
      <div style="font-size:16px; line-height:1.7; color:#334155;">${intro}</div>
      ${noteBlock}
      ${itemsTable}
      ${ctaButton}
      ${footerBlock}
  `;

  return buildEmailLayout({
    title,
    accentColor: "#0ea5e9",
    bodyHtml,
  });
}

async function sendWholesaleEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn("Wholesale notification skipped due to missing recipient.", {
      subject,
    });
    return;
  }

  const mailOptions = {
    from: getWholesaleFromAddress(),
    to,
    subject,
    html,
  };

  if (text) {
    mailOptions.text = text;
  }

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send wholesale notification email:", error);
  }
}

exports.notifyWholesaleOfferCreated = functions.firestore
  .document("wholesale/{userId}/offers/{offerDocId}")
  .onCreate(async (snap, context) => {
    const offer = snap.data() || {};
    const offerId = offer.id || context.params.offerDocId;
    const buyer = offer.buyer || {};
    const buyerName = buyer.name || buyer.company || buyer.email || "Wholesale buyer";
    const buyerEmail = buyer.email || "Unknown";
    const internalRecipient = getWholesaleNotificationInbox();
    const safeOfferId = escapeHtml(offerId);
    const safeBuyerName = escapeHtml(buyerName);
    const safeBuyerEmail = escapeHtml(buyerEmail);

    const intro = `
      <p style="margin:0 0 12px;">A new wholesale offer has been submitted.</p>
      <p style="margin:0;">Buyer: <strong>${safeBuyerName}</strong> (${safeBuyerEmail})</p>
      <p style="margin:12px 0 0;">Offer ID: <strong>${safeOfferId}</strong></p>
    `;

    const html = buildWholesaleEmailTemplate({
      title: "New wholesale offer received",
      intro,
      items: offer.items,
      priceOverrides: null,
      note: offer.note,
      cta: {
        label: "Review in admin",
        url: "https://secondhandcell.com/buy/admin.html#offers",
      },
      footer: "This notification was generated automatically when the buyer submitted their cart.",
    });

    const text = `New wholesale offer ${offerId} from ${buyerName} (${buyerEmail}).`;

    await sendWholesaleEmail({
      to: internalRecipient,
      subject: `New wholesale offer ${offerId} submitted`,
      html,
      text,
    });

    return null;
  });

exports.notifyWholesaleOfferUpdated = functions.firestore
  .document("wholesale/{userId}/offers/{offerDocId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const offerId = after.id || before.id || context.params.offerDocId;
    const buyer = after.buyer || before.buyer || {};
    const buyerName = buyer.name || buyer.company || buyer.email || "Wholesale buyer";
    const buyerEmail = buyer.email || null;
    const statusBefore = before.status || "pending";
    const statusAfter = after.status || "pending";
    const notifications = [];
    const displayBuyerEmail = buyerEmail || "Not provided";
    const safeOfferId = escapeHtml(offerId);
    const safeBuyerName = escapeHtml(buyerName);

    const counterBefore = (before.counter && before.counter.items) || {};
    const counterAfter = (after.counter && after.counter.items) || {};
    const noteBefore = (before.counter && before.counter.note) || "";
    const noteAfter = (after.counter && after.counter.note) || "";
    const counterChanged =
      statusAfter === "counter" &&
      (statusBefore !== "counter" ||
        JSON.stringify(counterBefore) !== JSON.stringify(counterAfter) ||
        noteBefore !== noteAfter);

    if (counterChanged && buyerEmail) {
      const intro = `
        <p style="margin:0 0 12px;">We reviewed your wholesale request and provided updated pricing.</p>
        <p style="margin:0;">Offer ID: <strong>${safeOfferId}</strong></p>
      `;
      const html = buildWholesaleEmailTemplate({
        title: "We've provided a counter offer",
        intro,
        items: after.items,
        priceOverrides: counterAfter,
        note: noteAfter,
        cta: {
          label: "Review counter in My Account",
          url: "https://secondhandcell.com/buy/my-account.html#pending",
        },
        footer: "Sign in to your wholesale portal to accept or decline this counter.",
      });
      const text = `A counter offer is ready for ${offerId}. Review it in your wholesale portal.`;
      notifications.push(
        sendWholesaleEmail({
          to: buyerEmail,
          subject: `Counter offer ready for ${offerId}`,
          html,
          text,
        })
      );
    }

    if (statusBefore !== statusAfter && statusAfter === "accepted" && buyerEmail) {
      const intro = `
        <p style="margin:0 0 12px;">Great news! Your wholesale offer is ready to check out.</p>
        <p style="margin:0;">Offer ID: <strong>${safeOfferId}</strong></p>
      `;
      const html = buildWholesaleEmailTemplate({
        title: "Your offer has been approved",
        intro,
        items: after.items,
        priceOverrides: counterAfter,
        note: "Checkout is ready whenever you are.",
        cta: {
          label: "Proceed to checkout",
          url: `https://secondhandcell.com/buy/checkout.html?offer=${encodeURIComponent(offerId)}`,
        },
        footer: "Payment is due within 24 hours to keep inventory reserved.",
      });
      const text = `Offer ${offerId} has been accepted. Complete checkout at https://secondhandcell.com/buy/checkout.html?offer=${offerId}`;
      notifications.push(
        sendWholesaleEmail({
          to: buyerEmail,
          subject: `Offer ${offerId} approved – complete checkout` ,
          html,
          text,
        })
      );
    }

    if (statusBefore !== statusAfter && statusAfter === "declined" && buyerEmail) {
      const intro = `
        <p style="margin:0 0 12px;">We wanted to let you know that this wholesale offer has been declined.</p>
        <p style="margin:0;">Offer ID: <strong>${safeOfferId}</strong></p>
      `;
      const html = buildWholesaleEmailTemplate({
        title: "Update on your wholesale offer",
        intro,
        items: after.items,
        priceOverrides: null,
        note: noteAfter,
        cta: {
          label: "View details in My Account",
          url: "https://secondhandcell.com/buy/my-account.html#history",
        },
        footer: "Reach out to your account manager if you'd like to revisit this submission.",
      });
      const text = `Offer ${offerId} was declined. Sign in to review details.`;
      notifications.push(
        sendWholesaleEmail({
          to: buyerEmail,
          subject: `Offer ${offerId} was declined`,
          html,
          text,
        })
      );
    }

    if (statusBefore !== statusAfter && statusAfter === "processing") {
      const orderId = after.payment && after.payment.orderId;
      const totalAmount = after.payment && after.payment.totalAmount;
      const intro = `
        <p style="margin:0 0 12px;">${safeBuyerName} started checkout for their wholesale offer.</p>
        <p style="margin:0;">Offer ID: <strong>${safeOfferId}</strong></p>
        <p style="margin:12px 0 0;">Expected charge: <strong>${formatUsd(totalAmount)}</strong></p>
        ${
          orderId
            ? `<p style="margin:12px 0 0;">Wholesale order ID: <strong>${escapeHtml(orderId)}</strong></p>`
            : ""
        }
      `;
      const html = buildWholesaleEmailTemplate({
        title: "Wholesale checkout started",
        intro,
        items: after.items,
        priceOverrides: counterAfter,
        note: noteAfter,
        cta: {
          label: "Open admin dashboard",
          url: "https://secondhandcell.com/buy/admin.html#offers",
        },
        footer: `Buyer: ${buyerName} (${displayBuyerEmail || "No email on file"})`,
      });
      const text = `Buyer ${buyerName} started checkout for ${offerId}.`;
      notifications.push(
        sendWholesaleEmail({
          to: getWholesaleNotificationInbox(),
          subject: `Checkout started for wholesale offer ${offerId}`,
          html,
          text,
        })
      );
    }

    if (statusBefore !== statusAfter && statusAfter === "completed") {
      const orderId = after.payment && after.payment.orderId;
      const totalAmount = after.payment && after.payment.totalAmount;
      const paymentIntentId =
        after.payment && (after.payment.paymentIntentId || after.payment.intentId);
      const intro = `
        <p style="margin:0 0 12px;">Payment for this wholesale offer has been confirmed.</p>
        <p style="margin:0;">Offer ID: <strong>${safeOfferId}</strong></p>
        ${
          orderId
            ? `<p style="margin:12px 0 0;">Wholesale order ID: <strong>${escapeHtml(orderId)}</strong></p>`
            : ""
        }
        ${
          totalAmount
            ? `<p style="margin:12px 0 0;">Total collected: <strong>${formatUsd(totalAmount)}</strong></p>`
            : ""
        }
        ${
          paymentIntentId
            ? `<p style="margin:12px 0 0;">Stripe PI: <strong>${escapeHtml(paymentIntentId)}</strong></p>`
            : ""
        }
      `;
      const html = buildWholesaleEmailTemplate({
        title: "Wholesale payment received",
        intro,
        items: after.items,
        priceOverrides: counterAfter,
        note: noteAfter,
        cta: {
          label: "View order in admin",
          url: "https://secondhandcell.com/buy/admin.html#offers",
        },
        footer: `Buyer: ${buyerName} (${displayBuyerEmail || "No email on file"})`,
      });
      const text = `Wholesale offer ${offerId} is paid. Total: ${formatUsd(totalAmount)}.`;
      notifications.push(
        sendWholesaleEmail({
          to: getWholesaleNotificationInbox(),
          subject: `Wholesale offer ${offerId} payment received`,
          html,
          text,
        })
      );
    }

    if (!notifications.length) {
      return null;
    }

    await Promise.all(notifications);
    return null;
  });

exports.api = functions.https.onRequest(app);
