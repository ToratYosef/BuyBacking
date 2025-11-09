const functions = require("firebase-functions/v1");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin"); // <-- Required here
const axios = require("axios");
const nodemailer = require("nodemailer");
const { randomUUID } = require("crypto");
const { generateCustomLabelPdf, generateBagLabelPdf, mergePdfBuffers } = require('./helpers/pdf');
const {
  DEFAULT_CARRIER_CODE,
  buildKitTrackingUpdate,
  buildManualKitScanUpdate,
  buildTrackingUrl,
  resolveCarrierCode,
} = require('./helpers/shipengine');
const wholesaleRouter = require('./routes/wholesale'); // <-- wholesale.js is loaded here
const createEmailsRouter = require('./routes/emails');
const createOrdersRouter = require('./routes/orders');

if (!admin.apps.length) {
  admin.initializeApp();
}
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

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", corsOptions.methods.join(","));
  res.header(
    "Access-Control-Allow-Headers",
    corsOptions.allowedHeaders.join(",")
  );

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  return cors(corsOptions)(req, res, next);
});

app.options("*", cors(corsOptions));
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
  "If we don't hear back, we may finalize your order at 75% less to keep your order moving.";
const TRUSTPILOT_REVIEW_LINK = "https://www.trustpilot.com/evaluate/secondhandcell.com";
const TRUSTPILOT_STARS_IMAGE_URL = "https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-5.png";
function buildCountdownNoticeHtml() {
  return `
    <div style="margin-top: 24px; padding: 18px 20px; background-color: #ecfdf5; border-radius: 12px; border: 1px solid #bbf7d0; color: #065f46; font-size: 17px; line-height: 1.6;">
      <strong style="display:block; font-size:18px; margin-bottom:8px;">Friendly reminder</strong>
      If we don't hear back, we may finalize your device at <strong>75% less</strong> to keep your order moving.
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

const EXPIRING_REMINDER_ALLOWED_STATUSES = new Set([
  "order_pending",
  "shipping_kit_requested",
  "kit_needs_printing",
  "needs_printing",
  "label_generated",
  "emailed",
  "kit_on_the_way_to_customer",
  "kit_on_the_way_to_us",
  "phone_on_the_way",
]);

const KIT_REMINDER_ALLOWED_STATUSES = new Set([
  "kit_sent",
  "kit_on_the_way_to_customer",
  "kit_delivered",
  "kit_on_the_way_to_us",
]);

const MANUAL_AUTO_REQUOTE_INELIGIBLE_STATUSES = new Set([
  'completed',
  'cancelled',
  'return-label-generated',
  're-offered-accepted',
  're-offered-declined',
  're-offered-auto-accepted',
  'requote_accepted',
]);
const AUTO_CANCEL_DELAY_MS = 15 * 24 * 60 * 60 * 1000;
const AUTO_CANCEL_MONITORED_STATUSES = [
  "order_pending",
  "shipping_kit_requested",
  "kit_needs_printing",
  "kit_sent",
  "kit_on_the_way_to_customer",
  "kit_on_the_way_to_us",
  "label_generated",
  "emailed",
  "phone_on_the_way",
];

const AUTO_CANCELLATION_ENABLED = false;

const INBOUND_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const RETURN_REMINDER_DELAY_MS = 13 * 24 * 60 * 60 * 1000;
const RETURN_AUTO_VOID_DELAY_MS = 15 * 24 * 60 * 60 * 1000;
const INBOUND_TRACKABLE_STATUSES = new Set([
  "kit_delivered",
  "delivered_to_us",
  "kit_on_the_way_to_us",
  "label_generated",
  "emailed",
  "phone_on_the_way",
]);

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
    includeTrustpilot: false,
    bodyHtml,
    includeCountdownNotice: true,
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

      await recordCustomerEmail(
        updatedOrder.id,
        'Cancellation notice email sent to customer.',
        { reason, autoCancelled: auto },
        {
          additionalUpdates: {
            cancellationNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }
      );
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
  includeCountdownNotice: true,
  includeTrustpilot: false,
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
  includeCountdownNotice: true,
  includeTrustpilot: false,
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
  includeCountdownNotice: true,
  includeTrustpilot: false,
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>When we ran your device for order <strong>#**ORDER_ID**</strong>, the carrier reported a status of <strong>**FINANCIAL_STATUS**</strong>.</p>
      <p>Please contact your carrier to clear the balance and then reply to this email so we can rerun the check and keep your payout on track.</p>
      <p style="color:#c2410c;">Need help figuring out the right department to call? Let us know and we'll point you in the right direction.</p>
  `,
});
const DOWNGRADE_EMAIL_HTML = buildEmailLayout({
  title: "Order finalized at adjusted payout",
  accentColor: "#f97316",
  includeTrustpilot: false,
  bodyHtml: `
      <p>Hi **CUSTOMER_NAME**,</p>
      <p>We reached out about the issue with your device for order <strong>#**ORDER_ID**</strong> but haven't received an update.</p>
      <p>To keep things moving, we've finalized the device at 75% less than the original offer. If you resolve the issue, reply to this email and we'll happily re-evaluate.</p>
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

async function recordCustomerEmail(orderId, message, metadata = {}, options = {}) {
  if (!orderId || !message) {
    return null;
  }

  const cleanedMetadata = {};
  if (metadata && typeof metadata === "object") {
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null && value !== "") {
        cleanedMetadata[key] = value;
      }
    }
  }

  const logEntry = {
    type: options?.logType || "email",
    message,
  };

  if (Object.keys(cleanedMetadata).length > 0) {
    logEntry.metadata = cleanedMetadata;
  }

  const additionalUpdates = {};
  if (options && typeof options.additionalUpdates === "object") {
    for (const [key, value] of Object.entries(options.additionalUpdates)) {
      if (value !== undefined) {
        additionalUpdates[key] = value;
      }
    }
  }

  const payload = {
    lastCustomerEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    ...additionalUpdates,
  };

  return updateOrderBoth(orderId, payload, {
    autoLogStatus: false,
    logEntries: [logEntry],
  });
}

function getLastCustomerEmailMillis(order = {}) {
  const candidates = [
    order.lastCustomerEmailSentAt,
    order.lastReminderSentAt,
    order.expiringReminderSentAt,
    order.kitReminderSentAt,
    order.reminderSentAt,
    order.reminderEmailSentAt,
    order.lastReminderAt,
    order.reviewRequestSentAt,
    order.returnLabelEmailSentAt,
    order.cancellationNotifiedAt,
  ];

  let latest = 0;
  for (const value of candidates) {
    const date = toDate(value);
    if (date) {
      const time = date.getTime();
      if (time > latest) {
        latest = time;
      }
    }
  }

  return latest > 0 ? latest : null;
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
  includeCountdownNotice = false,
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
  const countdownSection = includeCountdownNotice
    ? buildCountdownNoticeHtml()
    : "";

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
            ${countdownSection}
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

const kitStatusOrder = [
  'needs_printing',
  'kit_sent',
  'kit_in_transit',
  'kit_on_the_way_to_customer',
  'kit_delivered',
  'kit_on_the_way_to_us',
  'delivered_to_us',
];

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
    case 'UNKNOWN':
      return 'kit_on_the_way_to_customer';
    case 'LABEL_CREATED':
      return 'kit_sent';
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

function getTimestampMillis(value) {
  const date = toDate(value);
  return date ? date.getTime() : null;
}

function isKitOrder(order = {}) {
  return (order.shippingPreference || "").toLowerCase() === "shipping kit requested";
}

function isEmailLabelOrder(order = {}) {
  return (order.shippingPreference || "").toLowerCase() === "email label requested";
}

function getInboundTrackingNumber(order = {}) {
  if (!order || typeof order !== "object") {
    return null;
  }
  return order.inboundTrackingNumber || order.trackingNumber || null;
}

function shouldTrackInbound(order = {}) {
  if (!order || typeof order !== "object") return false;
  const status = (order.status || "").toLowerCase();
  if (!INBOUND_TRACKABLE_STATUSES.has(status)) return false;
  return Boolean(getInboundTrackingNumber(order));
}

function shouldRefreshInbound(order = {}) {
  if (!shouldTrackInbound(order)) return false;
  const lastSyncedMs = getTimestampMillis(order.labelTrackingLastSyncedAt);
  if (!lastSyncedMs) return true;
  return Date.now() - lastSyncedMs >= INBOUND_REFRESH_INTERVAL_MS;
}

function deriveInboundStatusUpdate(order = {}, normalizedStatus) {
  if (!normalizedStatus) return null;
  const upper = String(normalizedStatus).toUpperCase();

  if (upper === "DELIVERED" || upper === "DELIVERED_TO_AGENT") {
    const normalizedStatus = (order.status || "").toLowerCase();
    const kitOrder = isKitOrder(order);

    if (kitOrder) {
      if (normalizedStatus === "delivered_to_us" || normalizedStatus === "received") {
        return null;
      }
      return { nextStatus: "delivered_to_us", delivered: true };
    }

    if (normalizedStatus === "received") {
      return null;
    }
    return { nextStatus: "received", delivered: true };
  }

  const transitStatuses = new Set([
    "OUT_FOR_DELIVERY",
    "IN_TRANSIT",
    "ACCEPTED",
    "SHIPMENT_ACCEPTED",
    "LABEL_CREATED",
    "UNKNOWN",
  ]);

  if (transitStatuses.has(upper)) {
    if (isKitOrder(order)) {
      if ((order.status || "").toLowerCase() === "kit_on_the_way_to_us") {
        return null;
      }
      return { nextStatus: "kit_on_the_way_to_us", delivered: false };
    }
    if (isEmailLabelOrder(order)) {
      if ((order.status || "").toLowerCase() === "phone_on_the_way") {
        return null;
      }
      return { nextStatus: "phone_on_the_way", delivered: false };
    }
  }

  return null;
}

function getReturnCountdownStartMillis(order = {}) {
  if (!order || typeof order !== 'object') {
    return null;
  }

  const candidates = [];
  candidates.push(order.returnCountdownStartedAt);

  if (isKitOrder(order)) {
    candidates.push(order.kitDeliveredAt);
    candidates.push(order.labelGeneratedAt);
  } else {
    candidates.push(order.labelGeneratedAt);
  }

  candidates.push(order.lastStatusUpdateAt);
  candidates.push(order.createdAt);

  for (const candidate of candidates) {
    const ms = getTimestampMillis(candidate);
    if (typeof ms === 'number' && !Number.isNaN(ms)) {
      return ms;
    }
  }

  return null;
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

const emailsRouter = createEmailsRouter({
  transporter,
  sendMultipleTestEmails,
  CONDITION_EMAIL_TEMPLATES,
  CONDITION_EMAIL_FROM_ADDRESS,
  CONDITION_EMAIL_BCC_RECIPIENTS,
  buildConditionEmail,
  ordersCollection,
  updateOrderBoth,
});

app.use('/', emailsRouter);

const ordersRouter = createOrdersRouter({
  axios,
  admin,
  ordersCollection,
  adminsCollection,
  writeOrderBoth,
  updateOrderBoth,
  generateNextOrderNumber,
  stateAbbreviations,
  templates: {
    ORDER_RECEIVED_EMAIL_HTML,
    ORDER_PLACED_ADMIN_EMAIL_HTML,
    SHIPPING_KIT_EMAIL_HTML,
    SHIPPING_LABEL_EMAIL_HTML,
  },
  notifications: {
    sendAdminPushNotification,
    addAdminFirestoreNotification,
  },
  pdf: {
    generateCustomLabelPdf,
    generateBagLabelPdf,
    mergePdfBuffers,
  },
  shipEngine: {
    cloneShipEngineLabelMap,
    buildLabelIdList,
    isLabelPendingVoid,
    handleLabelVoid,
    sendVoidNotificationEmail,
  },
  createShipEngineLabel,
  transporter,
});

app.use('/', ordersRouter);

// ------------------------------
// ROUTES
// ------------------------------


app.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const notifyCustomer = req.body?.notifyCustomer !== false;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const statusUpdate = { status, lastStatusUpdateAt: timestamp };
    if (status === 'kit_sent') {
      statusUpdate.kitSentAt = timestamp;
    }
    if (status === 'needs_printing') {
      statusUpdate.needsPrintingAt = timestamp;
    }

    const { order } = await updateOrderBoth(orderId, statusUpdate);

    let emailLogMessage = null;
    let emailMetadata = { status };

    if (notifyCustomer) {
      let customerNotificationPromise = Promise.resolve();
      let customerEmailHtml = "";
      const customerName = order.shippingInfo?.fullName || 'there';

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
          emailLogMessage = "Received confirmation email sent to customer.";
          emailMetadata.trackingNumber = order.trackingNumber || order.inboundTrackingNumber || null;
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
          emailLogMessage = "Order completion email sent to customer.";
          emailMetadata.payoutAmount = formatCurrencyValue(payoutAmount);
          emailMetadata.wasReoffered = wasReoffered;
          break;
        }
        default: {
          break;
        }
      }

      await customerNotificationPromise;

      if (emailLogMessage) {
        await recordCustomerEmail(orderId, emailLogMessage, emailMetadata);
      }
    }

    const responseMessage = notifyCustomer
      ? `Order marked as ${status}`
      : `Order marked as ${status} without emailing the customer.`;

    res.json({ message: responseMessage, notifyCustomer });
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

    await recordCustomerEmail(
      orderId,
      'Review request email sent to customer.',
      { status: order.status },
      {
        additionalUpdates: {
          reviewRequestSentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }
    );

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

    const scanParam =
      (req.query && (req.query.scan ?? req.query.scan_status ?? req.query.scanStatus)) ??
      (req.body && (req.body.scan ?? req.body.scan_status ?? req.body.scanStatus));

    if (scanParam) {
      const manualResult = buildManualKitScanUpdate(order, scanParam, {
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
        defaultCarrierCode: DEFAULT_CARRIER_CODE,
      });

      if (!manualResult) {
        return res.status(400).json({ error: 'Unsupported scan parameter provided.' });
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const updateData = {
        ...manualResult.updatePayload,
        kitTrackingLastRefreshedAt: timestamp,
      };

      if (manualResult.direction === 'inbound') {
        updateData.inboundTrackingLastRefreshedAt = timestamp;
      }

      const { order: updatedOrder } = await updateOrderBoth(orderId, updateData);

      const manualMessage = manualResult.statusApplied && manualResult.appliedStatus
        ? manualResult.message || `Manual scan applied: ${manualResult.appliedStatus.replace(/_/g, ' ')}.`
        : `${manualResult.message || 'Manual scan recorded.'} Status unchanged.`;

      return res.json({
        message: manualMessage,
        manualScan: true,
        delivered: manualResult.delivered,
        direction: manualResult.direction,
        statusApplied: manualResult.statusApplied,
        scan: manualResult.scan,
        tracking: manualResult.updatePayload?.kitTrackingStatus || null,
        order: {
          id: updatedOrder.id,
          status: updatedOrder.status,
        },
      });
    }

    const hasOutbound = Boolean(order.outboundTrackingNumber);
    const hasInbound = Boolean(order.inboundTrackingNumber || order.trackingNumber);

    if (!hasOutbound && !hasInbound) {
      return res.json({ skipped: true, reason: 'No tracking numbers available for this order.' });
    }

    const shipengineKey = process.env.SHIPENGINE_KEY;
    if (!shipengineKey) {
      return res.status(500).json({ error: 'ShipEngine API key not configured.' });
    }

    let updatePayload;
    let delivered;
    let direction;

    try {
      ({ updatePayload, delivered, direction } = await buildKitTrackingUpdate(order, {
        axiosClient: axios,
        shipengineKey,
        defaultCarrierCode: DEFAULT_CARRIER_CODE,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      }));
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : '';
      if (
        message.includes('Tracking number not available') ||
        message.includes('Tracking number is required') ||
        message.includes('Carrier code is required')
      ) {
        return res.json({ skipped: true, reason: message });
      }
      throw error;
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const updateData = {
      ...updatePayload,
      kitTrackingLastRefreshedAt: timestamp,
    };

    if (direction === 'inbound') {
      updateData.inboundTrackingLastRefreshedAt = timestamp;
    }

    const { order: updatedOrder } = await updateOrderBoth(orderId, updateData);

    const message = (() => {
      if (direction === 'inbound') {
        if (delivered) {
          if (updatePayload.status === 'delivered_to_us') {
            return 'Inbound kit marked as delivered to us.';
          }
          return 'Inbound device marked as delivered.';
        }
        return 'Inbound tracking status refreshed.';
      }

      return delivered ? 'Kit marked as delivered.' : 'Kit tracking status refreshed.';
    })();

    if (delivered && shipengineKey) {
      try {
        if (shouldTrackInbound(updatedOrder)) {
          await syncInboundTrackingForOrder(updatedOrder, { shipengineKey });
        }
      } catch (inboundError) {
        console.error(
          `Error syncing inbound tracking after kit delivery for order ${orderId}:`,
          inboundError
        );
      }
    }

    res.json({
      message,
      delivered,
      direction,
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

    const carrierCode = resolveCarrierCode(order, 'outbound', DEFAULT_CARRIER_CODE);
    const trackingUrl = buildTrackingUrl({
      trackingNumber,
      carrierCode,
      defaultCarrierCode: DEFAULT_CARRIER_CODE,
    });

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
      if (normalizedStatus === 'kit_on_the_way_to_customer' && !order.kitSentAt) {
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

async function syncInboundTrackingForOrder(order, options = {}) {
  if (!order || !order.id) {
    throw new Error('Order details are required to sync inbound tracking.');
  }

  const trackingNumber = getInboundTrackingNumber(order);
  if (!trackingNumber) {
    return {
      order,
      tracking: null,
      skipped: 'no_tracking',
    };
  }

  const shipEngineKey = options.shipengineKey || process.env.SHIPENGINE_KEY;
  if (!shipEngineKey) {
    throw new Error('ShipEngine API key not configured.');
  }

  const axiosClient = options.axiosClient || axios;
  const carrierCode = resolveCarrierCode(order, 'inbound', DEFAULT_CARRIER_CODE);
  const trackingUrl = buildTrackingUrl({
    trackingNumber,
    carrierCode,
    defaultCarrierCode: DEFAULT_CARRIER_CODE,
  });

  const response = await axiosClient.get(trackingUrl, {
    headers: { 'API-Key': shipEngineKey },
  });

  const trackingData = response?.data && typeof response.data === 'object'
    ? response.data
    : null;

  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  if (!trackingData) {
    const { order: updatedOrder } = await updateOrderBoth(order.id, {
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

    return {
      order: updatedOrder,
      tracking: null,
      skipped: 'no_data',
    };
  }

  const updatePayload = {
    labelTrackingStatus: trackingData.status_code || trackingData.statusCode || null,
    labelTrackingStatusDescription: trackingData.status_description || trackingData.statusDescription || null,
    labelTrackingCarrierStatusCode: trackingData.carrier_status_code || trackingData.carrierStatusCode || null,
    labelTrackingCarrierStatusDescription:
      trackingData.carrier_status_description || trackingData.carrierStatusDescription || null,
    labelTrackingEstimatedDelivery:
      trackingData.estimated_delivery_date || trackingData.estimatedDeliveryDate || null,
    labelTrackingLastSyncedAt: timestamp,
  };

  if (Array.isArray(trackingData.events)) {
    updatePayload.labelTrackingEvents = trackingData.events;
  } else if (Array.isArray(trackingData.activities)) {
    updatePayload.labelTrackingEvents = trackingData.activities;
  }

  const normalizedStatus = String(updatePayload.labelTrackingStatus || '').toUpperCase();
  if (normalizedStatus === 'DELIVERED' || normalizedStatus === 'DELIVERED_TO_AGENT') {
    updatePayload.labelDeliveredAt = timestamp;
  }

  const statusUpdate = deriveInboundStatusUpdate(order, normalizedStatus);

  const logEntries = [
    {
      type: 'tracking',
      message: `Inbound label tracking synchronized (${updatePayload.labelTrackingStatusDescription || updatePayload.labelTrackingStatus || 'unknown'})`,
      metadata: { trackingNumber },
    },
  ];

  if (statusUpdate && statusUpdate.nextStatus && statusUpdate.nextStatus !== order.status) {
    updatePayload.status = statusUpdate.nextStatus;
    if (statusUpdate.nextStatus === 'received') {
      updatePayload.receivedAt = timestamp;
      updatePayload.autoReceived = true;
    } else if (statusUpdate.nextStatus === 'delivered_to_us') {
      updatePayload.kitDeliveredToUsAt = timestamp;
    }
    logEntries.push({
      type: 'status',
      message: `Status changed to ${formatStatusLabel(statusUpdate.nextStatus)} via inbound tracking.`,
      metadata: { trackingNumber, source: 'inbound_tracking' },
    });
  }

  const { order: updatedOrder } = await updateOrderBoth(order.id, updatePayload, {
    autoLogStatus: false,
    logEntries,
  });

  let emailSent = false;
  if (statusUpdate && statusUpdate.nextStatus === 'received') {
    emailSent = await sendDeviceReceivedNotification(updatedOrder, {
      trackingNumber,
    });
  }

  return {
    order: updatedOrder,
    tracking: trackingData,
    normalizedStatus,
    statusUpdate,
    emailSent,
  };
}

async function sendDeviceReceivedNotification(order, options = {}) {
  if (!order || !order.id) {
    return false;
  }

  if (order.receivedNotificationSentAt) {
    return false;
  }

  const email = order.shippingInfo?.email;
  if (!email) {
    return false;
  }

  const customerName = order.shippingInfo?.fullName || 'there';
  const htmlBody = applyTemplate(DEVICE_RECEIVED_EMAIL_HTML, {
    '**CUSTOMER_NAME**': customerName,
    '**ORDER_ID**': order.id,
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your SecondHandCell Device Has Arrived',
      html: htmlBody,
      bcc: ['sales@secondhandcell.com'],
    });

    await recordCustomerEmail(order.id, 'Received confirmation email sent to customer.', {
      trackingNumber: options?.trackingNumber || getInboundTrackingNumber(order) || null,
      auto: true,
    }, {
      additionalUpdates: {
        receivedNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    return true;
  } catch (error) {
    console.error(`Failed to send automatic received notification for order ${order.id}:`, error);
    return false;
  }
}

async function maybeSendReturnReminder(order) {
  if (!order || !order.id) {
    return order;
  }

  const status = (order.status || '').toLowerCase();
  if (!INBOUND_TRACKABLE_STATUSES.has(status)) {
    return order;
  }

  if (status === 'delivered_to_us') {
    return order;
  }

  if (order.returnReminderSentAt) {
    return order;
  }

  const countdownStart = getReturnCountdownStartMillis(order);
  if (!countdownStart) {
    return order;
  }

  if (Date.now() - countdownStart < RETURN_REMINDER_DELAY_MS) {
    return order;
  }

  const email = order.shippingInfo?.email;
  if (!email) {
    return order;
  }

  const customerName = order.shippingInfo?.fullName || 'there';
  const descriptor = isKitOrder(order)
    ? `It's been 13 days since your shipping kit for order #${order.id} was delivered.`
    : `It's been 13 days since we emailed your prepaid label for order #${order.id}.`;

  const htmlBody = `
    <p>Hi ${escapeHtml(customerName)},</p>
    <p>${escapeHtml(descriptor)} Your order will expire in 2 days if we don't see the device on the way back to us.</p>
    <p>Please send your device soon so we can keep everything moving and get your payout processed.</p>
    <p>If you need a hand or a fresh label, just reply to this email and we'll help right away.</p>
    <p>— The SecondHandCell Team</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Reminder: 2 days left to send your device for order #${order.id}`,
      html: htmlBody,
      bcc: ['sales@secondhandcell.com'],
    });

    const recordResult = await recordCustomerEmail(order.id, '13-day return reminder email sent to customer.', {
      auto: true,
      reminderDays: 13,
    }, {
      additionalUpdates: {
        returnReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    return recordResult?.order || order;
  } catch (error) {
    console.error(`Failed to send 13-day reminder for order ${order.id}:`, error);
    return order;
  }
}

async function maybeAutoCancelAgingOrder(order, options = {}) {
  if (!order || !order.id) {
    return order;
  }

  if (!AUTO_CANCELLATION_ENABLED) {
    return order;
  }

  const status = (order.status || '').toLowerCase();
  if (!INBOUND_TRACKABLE_STATUSES.has(status)) {
    return order;
  }

  if ((order.returnAutoCancelledAt || order.autoCancelled) && status === 'cancelled') {
    return order;
  }

  const countdownStart = getReturnCountdownStartMillis(order);
  if (!countdownStart) {
    return order;
  }

  if (Date.now() - countdownStart < RETURN_AUTO_VOID_DELAY_MS) {
    return order;
  }

  const shipengineKey = options.shipengineKey || process.env.SHIPENGINE_KEY;
  let workingOrder = order;

  try {
    const labels = normalizeShipEngineLabelMap(order);
    const selections = Object.entries(labels)
      .filter(([, entry]) => entry && entry.id && isLabelPendingVoid(entry))
      .map(([key, entry]) => ({ key, id: entry.id }));

    if (shipengineKey && selections.length) {
      await handleLabelVoid(order, selections, {
        reason: 'automatic',
        shipengineKey,
      });

      const refreshed = await ordersCollection.doc(order.id).get();
      if (refreshed.exists) {
        workingOrder = { id: refreshed.id, ...refreshed.data() };
      }
    }
  } catch (error) {
    console.error(`Failed to auto-void labels for order ${order.id}:`, error);
  }

  let cancelledOrder = workingOrder;
  try {
    const { order: updatedOrder } = await cancelOrderAndNotify(workingOrder, {
      auto: true,
      reason: 'return_window_expired',
      notifyCustomer: false,
      voidLabels: false,
    });
    cancelledOrder = updatedOrder || workingOrder;
  } catch (error) {
    console.error(`Failed to auto-cancel order ${order.id}:`, error);
    return order;
  }

  try {
    await updateOrderBoth(cancelledOrder.id, {
      returnAutoVoidedAt: admin.firestore.FieldValue.serverTimestamp(),
      returnAutoCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {
      autoLogStatus: false,
    });
  } catch (error) {
    console.error(`Failed to tag auto-cancellation timestamps for order ${order.id}:`, error);
  }

  const email = cancelledOrder.shippingInfo?.email;
  if (!email) {
    return cancelledOrder;
  }

  const customerName = cancelledOrder.shippingInfo?.fullName || 'there';
  const continuation = isKitOrder(cancelledOrder)
    ? 'Reply to this email and we will send a fresh prepaid label—just stick it on top of the replacement shipping kit when it arrives.'
    : 'Reply to this email and we will send a fresh prepaid label you can use right away.';

  const htmlBody = `
    <p>Hi ${escapeHtml(customerName)},</p>
    <p>We voided the shipping label for order <strong>#${escapeHtml(cancelledOrder.id)}</strong> because we haven\'t received your device in 15 days. We do this to keep orders moving for everyone.</p>
    <p>${escapeHtml(continuation)}</p>
    <p>If you decided not to send your device, just reply and let us know so we can close things out. If you change your mind later, respond and we\'ll send another prepaid label.</p>
    <p>— The SecondHandCell Team</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Order #${cancelledOrder.id} was voided after 15 days`,
      html: htmlBody,
      bcc: ['sales@secondhandcell.com'],
    });

    await recordCustomerEmail(cancelledOrder.id, 'Order auto-voided after 15 days without inbound shipment.', {
      auto: true,
      reason: 'return_window_expired',
    }, {
      additionalUpdates: {
        returnAutoVoidNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  } catch (error) {
    console.error(`Failed to send auto-cancellation email for order ${order.id}:`, error);
  }

  return cancelledOrder;
}

app.post('/orders/:id/sync-label-tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    const doc = await ordersCollection.doc(orderId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: doc.id, ...doc.data() };
    const result = await syncInboundTrackingForOrder(order);

    if (result.skipped === 'no_tracking') {
      return res.status(400).json({ error: 'No inbound tracking number on file for this order.' });
    }

    res.json({
      message: 'Label tracking synchronized.',
      order: { id: result.order.id, status: result.order.status },
      tracking: result.tracking ? result.tracking : result.order.labelTrackingStatus,
      statusUpdate: result.statusUpdate || null,
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

    await recordCustomerEmail(
      orderId,
      'Re-offer email sent to customer.',
      {
        newPrice: Number(newPrice).toFixed(2),
        originalQuote: Number(order.estimatedQuote || order.originalQuote || 0).toFixed(2),
      }
    );

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

    const secondHandCellAddress = {
      name: "Second Hand Cell",
      company_name: "Second Hand Cell",
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

    const isReturnToCustomer = order.status === "re-offered-declined";
    const shipFromAddress = isReturnToCustomer
      ? secondHandCellAddress
      : buyerAddress;
    const shipToAddress = isReturnToCustomer
      ? buyerAddress
      : secondHandCellAddress;

    // Package data for the return label (phone inside kit)
    const returnPackageData = {
      service_code: "usps_first_class_mail",
      dimensions: { unit: "inch", height: 2, width: 4, length: 6 },
      weight: { ounces: 8, unit: "ounce" }, // Phone weighs 8oz
    };


    const returnLabelData = await createShipEngineLabel(
      shipFromAddress,
      shipToAddress,
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

    await recordCustomerEmail(
      order.id,
      'Return label email sent to customer.',
      { trackingNumber: returnTrackingNumber },
      {
        additionalUpdates: {
          returnLabelEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }
    );

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

app.post("/orders/:id/auto-requote", async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }

    const docRef = ordersCollection.doc(orderId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = { id: doc.id, ...doc.data() };
    const status = (order.status || '').toString().toLowerCase();

    if (MANUAL_AUTO_REQUOTE_INELIGIBLE_STATUSES.has(status)) {
      return res
        .status(409)
        .json({ error: "Order status is not eligible for manual auto-requote." });
    }

    if (order.autoRequote?.manual === true) {
      return res.status(409).json({ error: "This order has already been manually auto-requoted." });
    }

    const customerEmail = order.shippingInfo?.email;
    if (!customerEmail) {
      return res.status(409).json({ error: "Order is missing a customer email address." });
    }

    const lastEmailMs = getLastCustomerEmailMillis(order);
    const lastEmailTimestamp = lastEmailMs
      ? admin.firestore.Timestamp.fromMillis(lastEmailMs)
      : null;

    const baseAmount = Number(order.reOffer?.newPrice ?? getOrderPayout(order));
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return res.status(409).json({ error: "No valid quoted amount available for auto-requote." });
    }

    const reducedAmount = Number((baseAmount * 0.25).toFixed(2));
    if (!Number.isFinite(reducedAmount) || reducedAmount <= 0) {
      return res.status(409).json({ error: "Unable to calculate the adjusted payout amount." });
    }

    const customerName = order.shippingInfo?.fullName || 'there';
    const baseDisplay = baseAmount.toFixed(2);
    const reducedDisplay = reducedAmount.toFixed(2);
    const timestampField = admin.firestore.FieldValue.serverTimestamp();

    const autoRequotePayload = {
      reducedFrom: Number(baseDisplay),
      reducedTo: reducedAmount,
      manual: true,
      initiatedBy: req.body?.initiatedBy || 'admin_manual_auto_requote',
      completedAt: timestampField,
    };

    if (lastEmailTimestamp) {
      autoRequotePayload.lastCustomerEmailAt = lastEmailTimestamp;
    }

    const { order: updatedOrder } = await updateOrderBoth(orderId, {
      status: 'completed',
      finalPayoutAmount: reducedAmount,
      finalOfferAmount: reducedAmount,
      finalPayout: reducedAmount,
      requoteAcceptedAt: timestampField,
      autoRequote: autoRequotePayload,
    }, {
      logEntries: [
        {
          type: 'auto_requote',
          message: `Order manually finalized at $${reducedDisplay} after unresolved customer communication.`,
          metadata: {
            previousStatus: order.status || null,
            reducedFrom: Number(baseDisplay),
            reducedTo: reducedAmount,
            reductionPercent: 75,
          },
        },
      ],
    });

    const emailHtml = buildEmailLayout({
      title: 'Order finalized at adjusted payout',
      accentColor: '#dc2626',
      includeTrustpilot: false,
      bodyHtml: `
        <p>Hi ${escapeHtml(customerName)},</p>
        <p>Since we have not received a response after multiple emails, we’ve finalized order <strong>#${escapeHtml(order.id)}</strong> at a payout that is 75% less than the previous quote of $${baseDisplay}.</p>
        <p>Your new payout amount is <strong>$${reducedDisplay}</strong>. You will receive your payment shortly.</p>
        <p>If you have any questions, just reply to this email and our team will be happy to help.</p>
      `,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: `Order #${order.id} finalized at adjusted payout`,
      html: emailHtml,
      bcc: [process.env.SALES_EMAIL || 'sales@secondhandcell.com'],
    });

    await recordCustomerEmail(
      orderId,
      'Manual auto-requote email sent to customer.',
      {
        status: 'completed',
        reducedFrom: baseDisplay,
        reducedTo: reducedDisplay,
      },
      { logType: 'auto_requote_email' }
    );

    res.json({
      message: `Order finalized at $${reducedDisplay} after admin confirmation.`,
      order: { id: updatedOrder.id, status: updatedOrder.status, finalPayoutAmount: reducedAmount },
    });
  } catch (error) {
    console.error('Error performing manual auto-requote:', error);
    res.status(500).json({ error: 'Failed to finalize the order with the adjusted payout.' });
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

    await recordCustomerEmail(
      orderId,
      'Re-offer acceptance confirmation email sent to customer.',
      { status: 're-offered-accepted' }
    );

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

    await recordCustomerEmail(
      orderId,
      'Return request confirmation email sent to customer.',
      { status: 're-offered-declined' }
    );

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

exports.autoRefreshInboundTracking = functions.pubsub
  .schedule("every 30 minutes")
  .onRun(async () => {
    const shipengineKey = process.env.SHIPENGINE_KEY || null;
    const statuses = Array.from(INBOUND_TRACKABLE_STATUSES);
    const processed = new Set();
    const orders = [];

    for (const status of statuses) {
      try {
        const snapshot = await ordersCollection.where('status', '==', status).get();
        snapshot.forEach((doc) => {
          if (processed.has(doc.id)) return;
          processed.add(doc.id);
          orders.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error(`Failed to fetch orders for status ${status}:`, error);
      }
    }

    for (const order of orders) {
      try {
        let currentOrder = order;
        if (shipengineKey && shouldRefreshInbound(currentOrder)) {
          const result = await syncInboundTrackingForOrder(currentOrder, { shipengineKey });
          currentOrder = result.order || currentOrder;
        }

        currentOrder = (await maybeSendReturnReminder(currentOrder)) || currentOrder;
        if (AUTO_CANCELLATION_ENABLED) {
          currentOrder =
            (await maybeAutoCancelAgingOrder(currentOrder, { shipengineKey })) || currentOrder;
        }
      } catch (error) {
        console.error(`Inbound tracking sweep failed for order ${order.id}:`, error);
      }
    }

    return null;
  });

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

      await recordCustomerEmail(
        doc.id,
        'Re-offer auto-accept email sent to customer.',
        { status: 're-offered-auto-accepted', auto: true }
      );
    });

    await Promise.all(updates);
    console.log(`Auto-accepted ${updates.length} expired offers.`);
    return null;
  });

async function runAutoCancellationSweep() {
  if (!AUTO_CANCELLATION_ENABLED) {
    console.log('Auto cancellation sweep skipped: feature disabled.');
    return;
  }

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

    await recordCustomerEmail(
      sanitizedOrderId,
      'Reminder email sent to customer.',
      { status: order.status },
      {
        logType: 'reminder',
        additionalUpdates: {
          lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
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

exports.sendExpiringReminderEmail = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const adminDoc = await adminsCollection.doc(context.auth.uid).get();
    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can send reminder emails');
    }

    const { orderId } = data || {};
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'Order ID is required');
    }

    const sanitizedOrderId = orderId.trim();
    const orderSnap = await ordersCollection.doc(sanitizedOrderId).get();
    if (!orderSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const order = orderSnap.data();
    if (!EXPIRING_REMINDER_ALLOWED_STATUSES.has(order.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'Order status is not eligible for an expiration reminder');
    }

    const customerEmail = order.shippingInfo?.email;
    if (!customerEmail) {
      throw new functions.https.HttpsError('failed-precondition', 'Order is missing a customer email address');
    }

    let createdAtDate = null;
    const createdAt = order.createdAt;
    if (createdAt) {
      if (typeof createdAt.toDate === 'function') {
        createdAtDate = createdAt.toDate();
      } else if (typeof createdAt.seconds === 'number') {
        createdAtDate = new Date(createdAt.seconds * 1000);
      } else if (typeof createdAt._seconds === 'number') {
        createdAtDate = new Date(createdAt._seconds * 1000);
      } else {
        const fallbackDate = new Date(createdAt);
        createdAtDate = Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
      }
    }

    let expiryDateText = null;
    let daysRemainingText = null;
    if (createdAtDate instanceof Date && !Number.isNaN(createdAtDate.getTime())) {
      const expiryDate = new Date(createdAtDate.getTime() + AUTO_CANCEL_DELAY_MS);
      expiryDateText = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const millisLeft = expiryDate.getTime() - Date.now();
      const daysLeft = Math.ceil(millisLeft / (24 * 60 * 60 * 1000));
      if (Number.isFinite(daysLeft)) {
        if (daysLeft <= 0) {
          daysRemainingText = 'less than a day';
        } else if (daysLeft === 1) {
          daysRemainingText = '1 day';
        } else {
          daysRemainingText = `${daysLeft} days`;
        }
      }
    }

    const payoutAmount = getOrderPayout(order);
    const payoutDisplay = formatCurrencyValue(payoutAmount);
    const deviceSummary = buildDeviceSummary(order) || [order.device, order.storage, order.carrier]
      .filter(Boolean)
      .join(' • ') || 'your device';

    const checklistItems = [
      'Back up your data to keep your memories safe.',
      'Sign out of iCloud, Google, and any other accounts.',
      'Factory reset the device to remove personal information.',
      'Remove SIM or memory cards and accessories.',
      'Pack the device securely and place the packing slip inside.',
    ];

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Don't Miss Out On Your Trade-In</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 18px; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12); overflow: hidden; }
    .card-header { background: linear-gradient(135deg, #2563eb, #38bdf8); color: #fff; padding: 36px 32px; text-align: center; }
    .card-header h1 { margin: 0; font-size: 28px; }
    .card-body { padding: 32px; color: #1f2937; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; background: rgba(37, 99, 235, 0.12); color: #1d4ed8; font-weight: 600; }
    .details-box { margin: 24px 0; padding: 20px; border-radius: 14px; background: rgba(15, 118, 110, 0.08); border: 1px solid rgba(13, 148, 136, 0.22); }
    .details-box strong { display: block; margin-bottom: 6px; color: #0f172a; }
    .checklist { margin: 0; padding-left: 18px; }
    .checklist li { margin-bottom: 10px; }
    .cta { margin-top: 28px; text-align: center; }
    .cta a { display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; border-radius: 999px; text-decoration: none; font-weight: 600; }
    .footer { padding: 24px; text-align: center; color: #64748b; font-size: 13px; background: #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="card-header">
        <div style="font-size:48px; margin-bottom:12px;">⏳</div>
        <h1>Your quote is almost up</h1>
        <p>Let's finish your trade-in so you don't lose your offer.</p>
      </div>
      <div class="card-body">
        <p>Hello ${order.shippingInfo?.fullName || 'there'},</p>
        <p>We noticed you started a trade-in for <strong>${deviceSummary}</strong> but it isn't complete yet. We’re holding your quote of <strong>${payoutDisplay}</strong>${expiryDateText ? ` until <strong>${expiryDateText}</strong>` : ''}.${daysRemainingText ? ` That’s about ${daysRemainingText} left.` : ''}</p>

        <div class="details-box">
          <strong>Order #${sanitizedOrderId}</strong>
          <div>Quoted amount: <strong>${payoutDisplay}</strong></div>
          <div>Shipping preference: ${order.shippingPreference || 'Shipping Kit Requested'}</div>
          ${expiryDateText ? `<div>Offer expires: ${expiryDateText}</div>` : ''}
        </div>

        <p class="pill">🚀 Shipping soon keeps your payout locked in</p>

        <p>Here’s a quick checklist to help you get ready:</p>
        <ol class="checklist">
          ${checklistItems.map((item) => `<li>${item}</li>`).join('')}
        </ol>

        <div class="cta">
          <a href="mailto:support@secondhandcell.com?subject=Question about order ${sanitizedOrderId}">Need help? We’re here.</a>
        </div>

        <p style="margin-top:28px;">Once your device arrives, we typically inspect and pay out within 48 hours.</p>
        <p style="margin-top:12px;">Thanks for choosing SecondHandCell!</p>
      </div>
      <div class="footer">
        SecondHandCell • Making device trade-ins simple and rewarding<br>
        Order #${sanitizedOrderId}
      </div>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: '⏳ Your SecondHandCell Quote Is Almost Expired',
      html: emailHtml,
      bcc: ["sales@secondhandcell.com"],
    });

    await recordCustomerEmail(
      sanitizedOrderId,
      'Expiration reminder email sent to customer.',
      {
        status: order.status,
        expiresOn: expiryDateText || null,
        daysRemaining: daysRemainingText || null,
      },
      {
        logType: 'expiring_reminder',
        additionalUpdates: {
          expiringReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }
    );

    await db.collection('adminAuditLogs').add({
      action: 'send_expiring_reminder_email',
      adminUid: context.auth.uid,
      adminEmail: context.auth.token?.email || 'unknown',
      orderId: sanitizedOrderId,
      orderStatus: order.status,
      recipientEmail: customerEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: true,
    });

    return { success: true, message: 'Expiration reminder email sent successfully' };
  } catch (error) {
    console.error('Error sending expiring reminder email:', error);

    if (context?.auth) {
      try {
        await db.collection('adminAuditLogs').add({
          action: 'send_expiring_reminder_email',
          adminUid: context.auth.uid,
          adminEmail: context.auth.token?.email || 'unknown',
          orderId: data?.orderId || 'unknown',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          success: false,
          errorType: error.code || 'unknown',
          errorMessage: error.message || 'Unknown error',
        });
      } catch (logError) {
        console.error('Failed to log expiring reminder audit entry:', logError);
      }
    }

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'Failed to send expiration reminder email');
  }
});

exports.sendKitReminderEmail = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const adminDoc = await adminsCollection.doc(context.auth.uid).get();
    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can send reminder emails');
    }

    const { orderId } = data || {};
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'Order ID is required');
    }

    const sanitizedOrderId = orderId.trim();
    const orderSnap = await ordersCollection.doc(sanitizedOrderId).get();
    if (!orderSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const order = orderSnap.data();
    if (!KIT_REMINDER_ALLOWED_STATUSES.has(order.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'Order status is not eligible for a kit reminder');
    }

    const shippingPreference = (order.shippingPreference || '').toString().toLowerCase();
    if (shippingPreference !== 'shipping kit requested') {
      throw new functions.https.HttpsError('failed-precondition', 'Kit reminders are only available for Shipping Kit Requested orders');
    }

    const customerEmail = order.shippingInfo?.email;
    if (!customerEmail) {
      throw new functions.https.HttpsError('failed-precondition', 'Order is missing a customer email address');
    }

    const outboundTracking = order.outboundTrackingNumber;
    const inboundTracking = order.inboundTrackingNumber || order.trackingNumber;
    const deviceSummary = buildDeviceSummary(order) || [order.device, order.storage].filter(Boolean).join(' • ') || 'your device';
    const payoutAmount = getOrderPayout(order);

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your SecondHandCell Kit Is Ready</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 18px; box-shadow: 0 20px 55px rgba(15, 23, 42, 0.12); overflow: hidden; }
    .header { background: linear-gradient(135deg, #10b981, #14b8a6); color: #fff; padding: 34px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 26px; }
    .body { padding: 30px; color: #1f2937; }
    .highlight { margin: 18px 0; padding: 18px; border-radius: 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); }
    .tracking { margin-top: 18px; padding: 18px; background: rgba(4, 120, 87, 0.08); border-radius: 12px; border: 1px solid rgba(4, 120, 87, 0.25); font-family: 'Fira Code', 'Consolas', monospace; }
    .tracking a { color: #047857; text-decoration: none; }
    .steps { margin: 0; padding-left: 20px; }
    .steps li { margin-bottom: 10px; }
    .footer { padding: 22px; text-align: center; font-size: 13px; color: #64748b; background: #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div style="font-size:46px; margin-bottom:10px;">📦</div>
        <h1>Your kit is on the way!</h1>
        <p>Let’s get your ${deviceSummary} shipped so we can finish your payout.</p>
      </div>
      <div class="body">
        <p>Hi ${order.shippingInfo?.fullName || 'there'},</p>
        <p>Your SecondHandCell shipping kit is ready and waiting for your device. Once it arrives, complete these quick steps so your payout isn’t delayed.</p>

        <div class="highlight">
          <strong>Order #${sanitizedOrderId}</strong><br />
          ${payoutAmount ? `Quoted amount: <strong>${formatCurrencyValue(payoutAmount)}</strong><br />` : ''}
          Shipping preference: <strong>${order.shippingPreference || 'Shipping Kit Requested'}</strong>
        </div>

        ${outboundTracking ? `<div class="tracking">Outbound kit tracking: <a href="https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${outboundTracking}" target="_blank" rel="noopener">${outboundTracking}</a></div>` : ''}
        ${inboundTracking ? `<div class="tracking" style="margin-top:12px;">Return label tracking: <a href="https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${inboundTracking}" target="_blank" rel="noopener">${inboundTracking}</a></div>` : ''}

        <p style="margin-top:24px;">Before you drop the kit in the mail, make sure to:</p>
        <ol class="steps">
          <li>Remove SIM and memory cards.</li>
          <li>Factory reset the device and log out of all accounts.</li>
          <li>Place the device in the protective packaging we sent.</li>
          <li>Attach the return label and drop it with USPS.</li>
        </ol>

        <p style="margin-top:20px;">Once we receive the device, we’ll inspect it and send payment within 48 hours. Have any questions? Just reply to this email—our team is ready to help.</p>
      </div>
      <div class="footer">
        SecondHandCell • Support: <a href="mailto:support@secondhandcell.com">support@secondhandcell.com</a><br />
        Order #${sanitizedOrderId}
      </div>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: '📦 Friendly reminder: Ship your SecondHandCell kit',
      html: emailHtml,
      bcc: ["sales@secondhandcell.com"],
    });

    await recordCustomerEmail(
      sanitizedOrderId,
      'Kit reminder email sent to customer.',
      {
        status: order.status,
        outboundTracking: outboundTracking || null,
        inboundTracking: inboundTracking || null,
      },
      {
        logType: 'kit_reminder',
        additionalUpdates: {
          kitReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }
    );

    await db.collection('adminAuditLogs').add({
      action: 'send_kit_reminder_email',
      adminUid: context.auth.uid,
      adminEmail: context.auth.token?.email || 'unknown',
      orderId: sanitizedOrderId,
      orderStatus: order.status,
      recipientEmail: customerEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: true,
    });

    return { success: true, message: 'Kit reminder email sent successfully' };
  } catch (error) {
    console.error('Error sending kit reminder email:', error);

    if (context?.auth) {
      try {
        await db.collection('adminAuditLogs').add({
          action: 'send_kit_reminder_email',
          adminUid: context.auth.uid,
          adminEmail: context.auth.token?.email || 'unknown',
          orderId: data?.orderId || 'unknown',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          success: false,
          errorType: error.code || 'unknown',
          errorMessage: error.message || 'Unknown error',
        });
      } catch (logError) {
        console.error('Failed to log kit reminder audit entry:', logError);
      }
    }

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'Failed to send kit reminder email');
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
