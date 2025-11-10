import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import fs from "fs";
import axios from "axios";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const AUTO_VOID_DELAY_MS =
  27 * 24 * 60 * 60 * 1000 + // 27 days
  12 * 60 * 60 * 1000; // 12 hours
const AUTO_VOID_INTERVAL_MS = (() => {
  if (process.env.AUTO_VOID_INTERVAL_MS === undefined) {
    return 60 * 60 * 1000;
  }
  const parsed = Number(process.env.AUTO_VOID_INTERVAL_MS);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 60 * 60 * 1000;
})();

// Configure CORS to allow requests from your GitHub Pages domain.
// This is crucial for enabling communication between your frontend and backend.
app.use(
  cors({
    origin: "https://toratyosef.github.io",
    
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Firebase Admin Initialization
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, "serviceAccountKey.json"))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const ordersCollection = db.collection("orders");
const usersCollection = db.collection("users");

let mailTransporter;
const notificationEmail = process.env.NOTIFICATION_EMAIL_TO || "";
const emailFromAddress =
  process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@secondhandcell.com";

function getMailTransporter() {
  if (mailTransporter !== undefined) {
    return mailTransporter;
  }

  if (!notificationEmail) {
    console.warn(
      "Void label notifications are disabled because NOTIFICATION_EMAIL_TO is not configured."
    );
    mailTransporter = null;
    return mailTransporter;
  }

  const {
    EMAIL_SERVICE,
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_SECURE,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_PASS,
  } = process.env;

  try {
    const transportConfig = {};

    if (EMAIL_SERVICE) {
      transportConfig.service = EMAIL_SERVICE;
    } else if (EMAIL_HOST) {
      transportConfig.host = EMAIL_HOST;
      transportConfig.port = EMAIL_PORT ? parseInt(EMAIL_PORT, 10) : 587;
      transportConfig.secure = EMAIL_SECURE === "true";
    } else {
      console.warn(
        "Void label notifications are disabled because neither EMAIL_SERVICE nor EMAIL_HOST is configured."
      );
      mailTransporter = null;
      return mailTransporter;
    }

    const password = EMAIL_PASSWORD || EMAIL_PASS;
    if (EMAIL_USER && password) {
      transportConfig.auth = { user: EMAIL_USER, pass: password };
    }

    mailTransporter = nodemailer.createTransport(transportConfig);
  } catch (error) {
    console.error("Failed to configure email transporter:", error);
    mailTransporter = null;
  }

  return mailTransporter;
}

function formatLabelDisplayName(key) {
  if (!key) return "Shipping Label";
  return key
    .toString()
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function timestampToFirestore(value) {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds || 0);
  }
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds || 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return admin.firestore.Timestamp.fromDate(parsed);
}

function timestampToDate(value) {
  const firestoreTimestamp = timestampToFirestore(value);
  return firestoreTimestamp ? firestoreTimestamp.toDate() : null;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getGreetingName(fullName) {
  if (!fullName) {
    return "there";
  }
  const [first] = fullName.trim().split(/\s+/);
  return first || "there";
}

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
      "Remove any screen lock, Apple ID, Google account, or MDM profile from the device.",
      "Restart the device and confirm it boots to the home screen without requesting credentials.",
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

function buildConditionEmail(reason, order, notes) {
  const template = CONDITION_EMAIL_TEMPLATES[reason];
  if (!template) {
    throw new Error("Unsupported condition email template.");
  }

  const customerName = order?.shippingInfo?.fullName;
  const greetingName = getGreetingName(customerName);
  const orderId = order?.id || "your order";
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

  const noteHtml = trimmedNotes
    ? `<p style="margin-top:16px;"><strong>Additional details from our technician:</strong><br>${escapeHtml(
        trimmedNotes
      ).replace(/\n/g, "<br>")}</p>`
    : "";
  const noteText = trimmedNotes
    ? `\n\nAdditional details from our technician:\n${trimmedNotes}`
    : "";

  const stepsHtml = (template.steps || [])
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("");
  const stepsText = (template.steps || []).map((step) => `• ${step}`).join("\n");

  const html = `
    <p>Hi ${escapeHtml(greetingName)},</p>
    <p>During our inspection of the device you sent in for order <strong>#${escapeHtml(orderId)}</strong>, we detected an issue:</p>
    <p><strong>${escapeHtml(template.headline)}</strong></p>
    <p>${escapeHtml(template.message)}</p>
    <ul>${stepsHtml}</ul>
    ${noteHtml}
    <p>Please reply to this email if you have any questions or once the issue has been resolved so we can continue processing your payout.</p>
    <p>Thank you,<br/>SecondHandCell Team</p>
  `;

  const text = [
    `Hi ${greetingName},`,
    "",
    `During our inspection of the device you sent in for order #${orderId}, we detected an issue:`,
    "",
    template.headline,
    template.message,
    "",
    stepsText,
    noteText,
    "",
    "Please reply to this email if you have any questions or once the issue has been resolved so we can continue processing your payout.",
    "",
    "Thank you,",
    "SecondHandCell Team",
  ]
    .filter(Boolean)
    .join("\n");

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

function normalizeLabelData(order) {
  const normalized = {};
  let mutated = false;

  if (order.shipEngineLabels && typeof order.shipEngineLabels === "object") {
    Object.entries(order.shipEngineLabels).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;

      const labelId = value.id || value.labelId || value.shipEngineLabelId;
      if (!labelId) return;

      const generatedAt =
        value.generatedAt instanceof admin.firestore.Timestamp
          ? value.generatedAt
          : timestampToFirestore(value.generatedAt) || null;

      const displayName = value.displayName || formatLabelDisplayName(key);
      const status = (value.status || value.voidStatus || "active").toLowerCase();

      const updated = {
        ...value,
        id: labelId,
        displayName,
        generatedAt,
        status,
      };

      if (
        value.id !== updated.id ||
        value.displayName !== updated.displayName ||
        value.generatedAt !== updated.generatedAt ||
        (value.status || value.voidStatus || "active").toLowerCase() !== status
      ) {
        mutated = true;
      }

      normalized[key] = updated;
    });
  }

  if (!Object.keys(normalized).length && order.shipEngineLabelId) {
    normalized.primary = {
      id: order.shipEngineLabelId,
      trackingNumber: order.trackingNumber || null,
      downloadUrl: order.uspsLabelUrl || null,
      status: (order.labelVoidStatus || "active").toLowerCase(),
      displayName: "Primary Shipping Label",
      generatedAt:
        timestampToFirestore(order.labelGeneratedAt) ||
        timestampToFirestore(order.createdAt) ||
        admin.firestore.Timestamp.now(),
      message: order.labelVoidMessage || null,
    };
    mutated = true;
  }

  order.shipEngineLabels = normalized;
  return { normalized, mutated };
}

function buildLabelDefinitions(order) {
  const { normalized, mutated } = normalizeLabelData(order);
  const definitions = new Map();

  Object.entries(normalized).forEach(([key, value]) => {
    if (!value?.id) return;
    const generatedAt =
      value.generatedAt instanceof admin.firestore.Timestamp
        ? value.generatedAt
        : timestampToFirestore(value.generatedAt) || admin.firestore.Timestamp.now();

    const displayName = value.displayName || formatLabelDisplayName(key);
    const status = (value.status || "active").toLowerCase();

    const enrichedValue = {
      ...value,
      id: value.id,
      generatedAt,
      displayName,
      status,
    };

    definitions.set(key, {
      key,
      labelId: value.id,
      displayName,
      generatedAt,
      status,
      info: enrichedValue,
      isPrimary:
        key === "primary" ||
        key === "inboundDevice" ||
        value.id === order.shipEngineLabelId,
    });

    order.shipEngineLabels[key] = enrichedValue;
  });

  return { definitions, mutated };
}

function interpretVoidResponse(response) {
  if (!response || typeof response !== "object") {
    return { approved: false, message: null };
  }

  const statusText =
    typeof response.status === "string" ? response.status.toLowerCase() : "";

  const approved =
    typeof response.approved === "boolean"
      ? response.approved
      : ["approved", "voided", "success", "completed"].includes(statusText);

  const message =
    response.message ||
    response.response_message ||
    response.responseMessage ||
    response.carrier_message ||
    null;

  return { approved, message };
}

function computeOutstandingLabelTimestamp(labelsState) {
  let latest = null;
  Object.values(labelsState || {}).forEach((info) => {
    if (!info || !info.id) return;
    const status = (info.status || "").toLowerCase();
    if (status === "voided" || status === "void_denied") return;
    const generatedAt = timestampToFirestore(info.generatedAt);
    if (!generatedAt) return;
    if (!latest || generatedAt.toMillis() > latest.toMillis()) {
      latest = generatedAt;
    }
  });
  return latest;
}

async function voidShipEngineLabel(labelId) {
  const apiKey = process.env.SS_API_KEY;
  if (!apiKey) {
    throw new Error("ShipEngine API key (SS_API_KEY) is not configured.");
  }

  const response = await axios.put(
    `https://api.shipengine.com/v1/labels/${encodeURIComponent(labelId)}/void`,
    {},
    {
      headers: {
        "API-Key": apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

async function sendVoidNotificationEmail(order, results, triggerSource) {
  const transporter = getMailTransporter();
  if (!transporter) return;

  const successful = results.filter((item) => item.approved);
  if (!successful.length) return;

  const descriptor = triggerSource === "automatic" ? "automatically" : "manually";
  const orderCreatedAt = timestampToDate(order.createdAt);
  const orderAgeDays = orderCreatedAt
    ? ((Date.now() - orderCreatedAt.getTime()) / (24 * 60 * 60 * 1000)).toFixed(1)
    : "N/A";

  const listItems = successful
    .map((item) => {
      const labelName = item.displayName || formatLabelDisplayName(item.key);
      const message = item.message ? ` – ${item.message}` : "";
      return `<li><strong>${labelName}</strong> (Label ID: ${item.labelId})${message}</li>`;
    })
    .join("");

  const html = `
    <p>The following shipping label(s) were ${descriptor} voided for order <strong>#${order.id}</strong>:</p>
    <ul>${listItems}</ul>
    <p>Order age at time of void: <strong>${orderAgeDays} days</strong>.</p>
  `;

  const textLines = [
    `The following shipping label(s) were ${descriptor} voided for order #${order.id}:`,
    ...successful.map((item) => {
      const labelName = item.displayName || formatLabelDisplayName(item.key);
      const message = item.message ? ` – ${item.message}` : "";
      return `• ${labelName} (Label ID: ${item.labelId})${message}`;
    }),
  ];
  if (orderAgeDays !== "N/A") {
    textLines.push(`Order age at time of void: ${orderAgeDays} days.`);
  }

  try {
    await transporter.sendMail({
      from: emailFromAddress,
      to: notificationEmail,
      subject: `Label voided for order ${order.id}`,
      html,
      text: textLines.join("\n"),
    });
  } catch (error) {
    console.error("Failed to send void notification email:", error);
  }
}

async function processLabelVoid(order, labelRequests, triggerSource = "manual") {
  if (!Array.isArray(labelRequests) || !labelRequests.length) {
    throw new Error("At least one label must be selected for voiding.");
  }

  const orderRef = ordersCollection.doc(order.id);
  const { definitions, mutated } = buildLabelDefinitions(order);

  if (!definitions.size) {
    throw new Error("No ShipEngine label data is associated with this order.");
  }

  if (mutated) {
    await orderRef.set({ shipEngineLabels: order.shipEngineLabels }, { merge: true });
  }

  const updates = {};
  const results = [];
  const nextLabelsState = { ...order.shipEngineLabels };
  const nowTimestamp = admin.firestore.FieldValue.serverTimestamp();

  for (const request of labelRequests) {
    const key = request?.key || request?.labelKey || request;
    const overrideId = request?.id || request?.labelId;

    if (!key) {
      results.push({ key: null, approved: false, message: "Invalid label selection." });
      continue;
    }

    const definition = definitions.get(key);
    if (!definition) {
      results.push({ key, approved: false, message: "Selected label was not found." });
      continue;
    }

    const labelId = overrideId || definition.labelId;
    if (!labelId) {
      results.push({ key, approved: false, message: "Label ID is missing for this selection." });
      continue;
    }

    try {
      const response = await voidShipEngineLabel(labelId);
      const { approved, message } = interpretVoidResponse(response);
      const statusValue = approved ? "voided" : "void_denied";
      const basePath = `shipEngineLabels.${key}`;

      updates[`${basePath}.status`] = statusValue;
      updates[`${basePath}.message`] = message || null;
      updates[`${basePath}.lastVoidAttemptAt`] = nowTimestamp;
      updates[`${basePath}.lastVoidResponse`] = response;
      if (approved) {
        updates[`${basePath}.voidedAt`] = nowTimestamp;
      }

      nextLabelsState[key] = {
        ...(nextLabelsState[key] || {}),
        status: statusValue,
        message: message || null,
      };

      if (definition.isPrimary) {
        updates.labelVoidStatus = statusValue;
        updates.labelVoidMessage = message || null;
        if (approved) {
          updates.labelVoidedAt = nowTimestamp;
        }
      }

      results.push({
        key,
        labelId,
        approved,
        message: message || null,
        displayName: definition.displayName,
        carrierResponse: response,
      });
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.errors?.[0]?.message ||
        error?.message ||
        "Failed to void the selected label.";

      const basePath = `shipEngineLabels.${key}`;
      updates[`${basePath}.status`] = "void_error";
      updates[`${basePath}.message`] = errorMessage;
      updates[`${basePath}.lastVoidAttemptAt`] = nowTimestamp;
      if (error?.response?.data) {
        updates[`${basePath}.lastVoidResponse`] = error.response.data;
      }

      nextLabelsState[key] = {
        ...(nextLabelsState[key] || {}),
        status: "void_error",
        message: errorMessage,
      };

      if (definition.isPrimary) {
        updates.labelVoidStatus = "void_error";
        updates.labelVoidMessage = errorMessage;
      }

      results.push({
        key,
        labelId,
        approved: false,
        error: true,
        message: errorMessage,
        displayName: definition.displayName,
      });
    }
  }

  const outstandingTimestamp = computeOutstandingLabelTimestamp(nextLabelsState);
  if (outstandingTimestamp) {
    updates.latestLabelGeneratedAt = outstandingTimestamp;
  } else {
    updates.latestLabelGeneratedAt = admin.firestore.FieldValue.delete();
  }

  if (Object.keys(updates).length) {
    await orderRef.update(updates);
  }

  const updatedDoc = await orderRef.get();
  const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

  await sendVoidNotificationEmail(updatedOrder, results, triggerSource);

  return { results, order: updatedOrder };
}

// Serve admin.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Fetch all orders
app.get("/api/orders", async (req, res) => {
  try {
    const snapshot = await ordersCollection.get();
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch orders from Firestore" });
  }
});

// Fetch single order
app.get("/api/orders/:id", async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch order from Firestore" });
  }
});

// Submit a new order
// This is the new endpoint to handle the front-end form submission.
app.post("/api/submit-order", async (req, res) => {
  try {
    const orderData = req.body;
    // Basic validation of incoming data
    if (!orderData || !orderData.shippingInfo || !orderData.estimatedQuote) {
      return res.status(400).json({ error: "Invalid order data" });
    }
    // Add the new order to the Firestore database
    const docRef = await ordersCollection.add({
      ...orderData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending_shipment",
    });
    console.log(`Order ${docRef.id} successfully added to Firestore.`);
    // Respond to the client with a success message
    res.status(201).json({
      message: "Order submitted successfully",
      orderId: docRef.id,
    });
  } catch (error) {
    console.error("Error submitting order:", error);
    res.status(500).json({ error: "Failed to submit order" });
  }
});

// ShipStation API integration function
async function createShipStationLabel(order) {
  const apiKey = process.env.SS_API_KEY;
  const isSandbox = process.env.SS_SANDBOX === "true";

  const payload = {
    shipment: {
      service_code: "usps_first_class_mail",
      ship_to: {
        name: order.shippingInfo.fullName,
        phone: order.shippingInfo.phoneNumber,
        address_line1: order.shippingInfo.streetAddress,
        city_locality: order.shippingInfo.city,
        state_province: order.shippingInfo.state,
        postal_code: order.shippingInfo.zipCode,
        country_code: "US",
        address_residential_indicator: "yes",
      },
      ship_from: {
        name: "Your Company Name",
        company_name: "Your Company",
        phone: "+1 555-555-5555",
        address_line1: "123 Main St",
        city_locality: "Austin",
        state_province: "TX",
        postal_code: "78701",
        country_code: "US",
        address_residential_indicator: "no",
      },
      packages: [
        {
          weight: {
            value: 1, // Assumes 1 ounce for simplicity; adjust as needed
            unit: "ounce",
          },
          dimensions: {
            height: 1,
            width: 8,
            length: 10,
            unit: "inch",
          },
        },
      ],
    },
  };

  if (isSandbox) {
    payload.testLabel = true;
  }

  const response = await axios.post(
    "https://api.shipengine.com/v1/labels",
    payload,
    {
      headers: {
        "API-Key": apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

// Generate shipping label
app.post("/api/generate-label/:id", async (req, res) => {
  try {
    const orderRef = ordersCollection.doc(req.params.id);
    const doc = await orderRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });

    const order = { id: doc.id, ...doc.data() };
    const labelData = await createShipStationLabel(order);
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

    const existingLabels = order.shipEngineLabels || {};
    const primaryLabel = {
      ...(existingLabels.primary || {}),
      id: labelData.label_id,
      trackingNumber: labelData.tracking_number || null,
      downloadUrl: labelData.label_download?.pdf || null,
      carrierCode: labelData.carrier_id || labelData.carrier_code || null,
      status: "active",
      displayName: (existingLabels.primary && existingLabels.primary.displayName) || "Primary Shipping Label",
      generatedAt: serverTimestamp,
      message: null,
      voidedAt: null,
      lastVoidAttemptAt: null,
      lastVoidResponse: null,
    };

    await orderRef.set(
      {
        status: "label_generated",
        uspsLabelUrl: labelData.label_download?.pdf || null,
        trackingNumber: labelData.tracking_number || order.trackingNumber || null,
        shipEngineLabelId: labelData.label_id,
        labelVoidStatus: "active",
        labelVoidMessage: null,
        labelGeneratedAt: serverTimestamp,
        latestLabelGeneratedAt: serverTimestamp,
        shipEngineLabels: {
          ...existingLabels,
          primary: primaryLabel,
        },
      },
      { merge: true }
    );

    const updatedDoc = await orderRef.get();
    const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

    res.json({
      message: "Label generated successfully",
      uspsLabelUrl: labelData.label_download?.pdf,
      trackingNumber: labelData.tracking_number || null,
      labelId: labelData.label_id,
      order: updatedOrder,
    });
  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).json({ error: "Failed to generate label" });
  }
});

app.post("/api/orders/:id/void-label", async (req, res) => {
  try {
    const orderRef = ordersCollection.doc(req.params.id);
    const doc = await orderRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });

    const order = { id: doc.id, ...doc.data() };
    const body = req.body || {};

    let labels = [];
    if (Array.isArray(body.labels) && body.labels.length) {
      labels = body.labels;
    } else if (Array.isArray(body.labelKeys) && body.labelKeys.length) {
      labels = body.labelKeys.map((key) => ({ key }));
    } else if (body.labelKey) {
      labels = [{ key: body.labelKey }];
    } else if (Array.isArray(body) && body.length) {
      labels = body;
    }

    if (!labels.length) {
      return res.status(400).json({ error: "Please select at least one label to void." });
    }

    const result = await processLabelVoid(order, labels, "manual");
    res.json({
      message: "Void request processed.",
      results: result.results,
      order: result.order,
    });
  } catch (error) {
    console.error("Error voiding label(s):", error);
    res.status(500).json({
      error: error.message || "Failed to void the selected label(s).",
    });
  }
});

// Update order status
app.put("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const orderRef = ordersCollection.doc(req.params.id);
    const doc = await orderRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });

    await orderRef.update({ status });
    res.json({ message: `Order marked as ${status}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

app.post("/api/orders/:id/send-condition-email", async (req, res) => {
  try {
    const { reason, notes, label: labelText } = req.body || {};
    if (!reason || !CONDITION_EMAIL_TEMPLATES[reason]) {
      return res.status(400).json({ error: "A valid email reason is required." });
    }

    const orderRef = ordersCollection.doc(req.params.id);
    const doc = await orderRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = { id: doc.id, ...doc.data() };
    const customerEmail = order?.shippingInfo?.email;
    if (!customerEmail) {
      return res
        .status(400)
        .json({ error: "The order does not have a customer email address." });
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      return res
        .status(500)
        .json({ error: "Email service is not configured." });
    }

    const { subject, html, text } = buildConditionEmail(reason, order, notes);
    const mailOptions = {
      from: emailFromAddress,
      to: customerEmail,
      subject,
      html,
      text,
    };

    if (notificationEmail) {
      mailOptions.bcc = notificationEmail;
    }

    await transporter.sendMail(mailOptions);

    const timestampField = admin.firestore.FieldValue.serverTimestamp();
    const activityEntry = {
      type: "email",
      message: `Sent ${labelText || CONDITION_EMAIL_TEMPLATES[reason]?.subject || "condition"} email to customer.`,
      metadata: {
        reason,
        label: labelText || null,
        notes: notes?.trim() || null,
      },
      at: admin.firestore.FieldValue.serverTimestamp(),
    };

    const updatePayload = {
      lastCustomerEmailSentAt: timestampField,
      lastConditionEmailReason: reason,
      activityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
    };

    if (notes && notes.trim()) {
      updatePayload.lastConditionEmailNotes = notes.trim();
    }

    await orderRef.set(updatePayload, { merge: true });

    if (order.userId) {
      await usersCollection
        .doc(order.userId)
        .collection("orders")
        .doc(order.id)
        .set(updatePayload, { merge: true });
    }

    res.json({ message: "Email sent successfully." });
  } catch (error) {
    console.error("Failed to send condition email:", error);
    res.status(500).json({ error: "Failed to send condition email." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});

