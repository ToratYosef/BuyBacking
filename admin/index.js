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

let autoVoidRunning = false;

async function autoVoidExpiredLabels() {
  if (autoVoidRunning) return;
  if (!process.env.SS_API_KEY) {
    console.warn("Skipping automatic label void sweep because SS_API_KEY is not configured.");
    return;
  }

  autoVoidRunning = true;
  try {
    const thresholdMillis = Date.now() - AUTO_VOID_DELAY_MS;
    const thresholdTimestamp = admin.firestore.Timestamp.fromMillis(thresholdMillis);

    const snapshot = await ordersCollection
      .where("latestLabelGeneratedAt", "<=", thresholdTimestamp)
      .get();

    if (snapshot.empty) {
      return;
    }

    for (const doc of snapshot.docs) {
      const order = { id: doc.id, ...doc.data() };
      const { definitions, mutated } = buildLabelDefinitions(order);
      if (!definitions.size) continue;

      if (mutated) {
        await ordersCollection
          .doc(order.id)
          .set({ shipEngineLabels: order.shipEngineLabels }, { merge: true });
      }

      const labelsToVoid = [];
      const nowMs = Date.now();

      definitions.forEach((definition, key) => {
        if (!definition.labelId) return;
        const generatedAt = definition.generatedAt;
        const generatedAtMs = generatedAt ? generatedAt.toMillis() : null;
        if (!generatedAtMs) return;
        if (nowMs - generatedAtMs < AUTO_VOID_DELAY_MS) return;
        const status = (definition.status || "").toLowerCase();
        if (status === "voided" || status === "void_denied") return;
        labelsToVoid.push({ key, id: definition.labelId });
      });

      if (!labelsToVoid.length) continue;

      try {
        await processLabelVoid(order, labelsToVoid, "automatic");
      } catch (error) {
        console.error(`Automatic void failed for order ${order.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Automatic label void sweep failed:", error);
  } finally {
    autoVoidRunning = false;
  }
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

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});

if (AUTO_VOID_INTERVAL_MS > 0) {
  setInterval(() => {
    autoVoidExpiredLabels().catch((error) =>
      console.error("Error during scheduled automatic void sweep:", error)
    );
  }, AUTO_VOID_INTERVAL_MS);
}

autoVoidExpiredLabels().catch((error) =>
  console.error("Initial automatic void sweep failed:", error)
);