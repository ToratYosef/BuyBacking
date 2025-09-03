const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin"); // Firebase Admin SDK
const axios = require("axios");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const ordersCollection = db.collection("orders");
const usersCollection = db.collection("users");
const adminsCollection = db.collection("admins"); // Reference to your admins collection

const app = express();

// Configure CORS for all routes.
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
app.use(express.json()); // Middleware to parse JSON request bodies

// Set up Nodemailer transporter using the Firebase Functions config
// IMPORTANT: Ensure you have configured these environment variables:
// firebase functions:config:set email.user="your_email@gmail.com" email.pass="your_app_password"
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().email.user,
    pass: functions.config().email.pass,
  },
});

// --- Email HTML Templates (unchanged from your version) ---
const SHIPPING_LABEL_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Label is Ready!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Label is Ready!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>You've chosen to receive a shipping label for order <strong class="order-id">#**ORDER_ID**</strong>. Here it is!</p><p>Your Tracking Number is: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><p>Please click the button below to download and print your label. Affix it to your package and drop it off at any USPS location.</p><div class="button-container"><a href="**LABEL_DOWNLOAD_LINK**" class="button">Download Your Shipping Label</a></div><p style="text-align:center;">We're excited to receive your device!</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;

const SHIPPING_KIT_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Kit is on its Way!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Kit is on its Way!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for your order <strong class="order-id">#**ORDER_ID**</strong>! Your shipping kit is on its way to you.</p><p>You can track its progress with the following tracking number: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><p>Once your kit arrives, simply place your device inside and use the included return label to send it back to us.</p><p>We're excited to receive your device!</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;

const ORDER_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Order Has Been Received!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content h2{color:#333333;font-size:20px;margin-top:24px;margin-bottom:8px}.order-id{color:#007bff;font-weight:bold}ul{list-style-type:disc;padding-left:20px;margin:0 0 16px}ul li{margin-bottom:8px}.important-note{background-color:#fff3cd;border-left:4px solid #ffc107;padding:16px;margin-top:24px;font-size:14px;color:#856404}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1>Your SecondHandCell Order #**ORDER_ID** Has Been Received!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for choosing SecondHandCell! We've successfully received your order request for your **DEVICE_NAME**.</p><p>Your Order ID is <strong class="order-id">#**ORDER_ID**</strong>.</p><h2>Next Steps: Preparing Your Device for Shipment</h2><p>Before you send us your device, it's crucial to prepare it correctly. Please follow these steps:</p><ul><li><strong>Backup Your Data:</strong> Ensure all important photos, contacts, and files are backed up to a cloud service or another device.</li><li><strong>Factory Reset:</strong> Perform a full factory reset on your device to erase all personal data. This is vital for your privacy and security.</li><li><strong>Remove Accounts:</strong> Sign out of all accounts (e.g., Apple ID/iCloud, Google Account, Samsung Account).<ul><li>For Apple devices, turn off "Find My iPhone" (FMI).</li><li>For Android devices, ensure Factory Reset Protection (FRP) is disabled.</li></ul></li><li><strong>Remove SIM Card:</strong> Take out any physical SIM cards from the device.</li><li><strong>Remove Accessories:</strong> Do not include cases, screen protectors, or chargers unless specifically instructed.</li></ul><div class="important-note"><p><strong>Important:</strong> We cannot process devices with <strong>Find My iPhone (FMI)</strong>, <strong>Factory Reset Protection (FRP)</strong>, <strong>stolen/lost status</strong>, <strong>outstanding balance due</strong>, or <strong>blacklisted IMEI</strong>. Please ensure your device meets these conditions to avoid delays or rejection.</p></div>**SHIPPING_INSTRUCTION**</div><div class="footer"><p>The SecondHandCell Team</p></div></div></body></html>`;

const DEVICE_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Device Has Arrived!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}.order-id{color:#007bff;font-weight:bold}</style></head><body><div class="email-container"><div class="header"><h1>Your Device Has Arrived!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>We've received your device for order <strong class="order-id">#**ORDER_ID**</strong>!</p><p>It's now in the queue for inspection. We'll be in touch soon with a final offer.</p><p>Thank you,</p><p>The SecondHandCell Team</p></div><div class="footer"><p>Thank thank you for choosing SecondHandCell.</p></div></div></body></html>`;

/**
 * --- NEW ---
 * Generates the next sequential order number in SHC-XXXXX format using a Firestore transaction.
 * Starts at SHC-00000 and increments by 1 per order.
 * @returns {Promise<string>} The next unique, sequential order number (e.g., "SHC-00000", then "SHC-00001").
 */
async function generateNextOrderNumber() {
  const counterRef = db.collection("counters").doc("orders");

  try {
    const newOrderNumber = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      // Assign currentNumber (default 0) to THIS order, then increment for next time
      const currentNumber = counterDoc.exists
        ? counterDoc.data().currentNumber ?? 0
        : 0;

      // Advance counter for the next order
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

/**
 * --- NEW HELPERS ---
 * Write & update in BOTH locations:
 * 1) Top-level /orders/{orderId}
 * 2) If userId present: /users/{userId}/orders/{orderId}
 */
async function writeOrderBoth(orderId, data) {
  // Hard write (no merge) for initial creation
  await ordersCollection.doc(orderId).set(data);
  if (data.userId) {
    await usersCollection
      .doc(data.userId)
      .collection("orders")
      .doc(orderId)
      .set(data);
  }
}

async function updateOrderBoth(orderId, partialData) {
  // Merge update and return updated order snapshot
  const orderRef = ordersCollection.doc(orderId);
  await orderRef.set(partialData, { merge: true });

  const snap = await orderRef.get();
  const base = snap.data() || {};
  const userId = base.userId;

  if (userId) {
    await usersCollection
      .doc(userId)
      .collection("orders")
      .doc(orderId)
      .set(partialData, { merge: true });
  }

  return { order: { id: orderId, ...base, ...partialData }, userId };
}

/**
 * Sends a Zendesk comment (public or private) for a given order.
 */
async function sendZendeskComment(orderData, subject, html_body, isPublic) {
  try {
    const zendeskUrl = functions.config().zendesk.url;
    const zendeskToken = functions.config().zendesk.token;
    if (!zendeskUrl || !zendeskToken) {
      console.warn("Zendesk configuration not complete. Cannot send notification.");
      return;
    }

    // Search for an existing ticket by subject
    const searchResponse = await axios.get(
      `${zendeskUrl}/search.json?query=type:ticket subject:"${subject}"`,
      {
        headers: { Authorization: `Basic ${zendeskToken}` },
      }
    );

    let ticketId = null;
    if (searchResponse.data.results.length > 0) {
      ticketId = searchResponse.data.results[0].id;
    }

    let payload;
    if (ticketId) {
      // Add a comment to an existing ticket
      payload = {
        ticket: {
          comment: {
            html_body: html_body,
            public: isPublic,
          },
        },
      };
      await axios.put(`${zendeskUrl}/tickets/${ticketId}.json`, payload, {
        headers: {
          Authorization: `Basic ${zendeskToken}`,
          "Content-Type": "application/json",
        },
      });
      console.log(`Zendesk comment added to existing ticket ${ticketId}.`);
    } else {
      // Create a new ticket
      payload = {
        ticket: {
          subject: subject,
          comment: {
            html_body: html_body,
            public: isPublic,
          },
          requester: {
            name: orderData.shippingInfo.fullName,
            email: orderData.shippingInfo.email,
          },
          tags: [`order_${orderData.id}`],
          priority: "normal",
        },
      };
      await axios.post(`${zendeskUrl}/tickets.json`, payload, {
        headers: {
          Authorization: `Basic ${zendeskToken}`,
          "Content-Type": "application/json",
        },
      });
      console.log("New Zendesk ticket created.");
    }
  } catch (err) {
    console.error(
      "Failed to send Zendesk notification:",
      err.response?.data || err.message
    );
  }
}

/**
 * Helper function to create a shipping label using ShipEngine API.
 */
async function createShipEngineLabel(fromAddress, toAddress, labelReference) {
  const isSandbox = true; // Set to false for production
  const payload = {
    shipment: {
      service_code: "usps_priority_mail",
      ship_to: toAddress,
      ship_from: fromAddress,
      packages: [
        {
          weight: { value: 1, unit: "ounce" }, // Default weight, adjust if needed
          label_messages: {
            reference1: labelReference,
          },
        },
      ],
    },
  };
  if (isSandbox) payload.testLabel = true;

  const shipEngineApiKey = functions.config().shipengine.key;
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

// --- Notification Helper Functions ---
async function sendAdminPushNotification(title, body, data = {}) {
  try {
    const adminsSnapshot = await adminsCollection.get();
    let allTokens = [];

    for (const adminDoc of adminsSnapshot.docs) {
      const adminUid = adminDoc.id;
      const fcmTokensRef = adminsCollection.doc(adminUid).collection("fcmTokens");
      const tokensSnapshot = await fcmTokensRef.get();
      tokensSnapshot.forEach((doc) => {
        allTokens.push(doc.id); // doc.id is the FCM token itself
      });
    }

    if (allTokens.length === 0) {
      console.log(
        "No FCM tokens found for any admin. Cannot send push notification."
      );
      return;
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data, // Custom data payload
      tokens: allTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      "Successfully sent FCM messages:",
      response.successCount,
      "failures:",
      response.failureCount
    );
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(
            `Failed to send FCM to token ${allTokens[idx]}: ${resp.error}`
          );
          // Optionally, remove invalid tokens from Firestore here
        }
      });
    }
  } catch (error) {
    console.error("Error sending FCM push notification:", error);
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

// ------------------------------
// ROUTES
// ------------------------------

// Get all orders
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

// Get a single order by its SHC-XXXXX order ID
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

// Find by identifier (SHC-XXXXX or 26-digit external)
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

// Get all orders for a specific user ID (from top-level collection)
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

// Submit a new order
app.post("/submit-order", async (req, res) => {
  try {
    const orderData = req.body;
    if (!orderData?.shippingInfo || !orderData?.estimatedQuote) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // Generate sequential SHC-XXXXX order id starting at SHC-00000
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

    // Customer-Facing Email: Order Received
    const customerEmailHtml = ORDER_RECEIVED_EMAIL_HTML
      .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
      .replace(/\*\*ORDER_ID\*\*/g, orderId)
      .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
      .replace(/\*\*SHIPPING_INSTRUCTION\*\*/g, shippingInstructions);

    const customerMailOptions = {
      from: functions.config().email.user,
      to: orderData.shippingInfo.email,
      subject: `Your SecondHandCell Order #${orderId} Has Been Received!`,
      html: customerEmailHtml,
    };

    // Internal Admin Notification: New Order Placed
    const internalSubject = `New Order Placed: #${orderId}`;
    const internalHtmlBody = `
      <p>A new order has been placed by <strong>${orderData.shippingInfo.fullName}</strong> (Email: ${orderData.shippingInfo.email}).</p>
      <p>Order ID: <strong>${orderId}</strong></p>
      <p>Estimated Quote: <strong>$${orderData.estimatedQuote.toFixed(2)}</strong></p>
      ${
        orderData.userId
          ? `<p>Associated User ID: <strong>${orderData.userId}</strong></p>`
          : "<p>Not associated with a logged-in user.</p>"
      }
      <p><strong>Shipping Preference:</strong> ${orderData.shippingPreference}</p>
      <p>The current status is: <strong>${formatStatusForEmail(
        newOrderStatus
      )}</strong></p>
      <p>Please generate and send the shipping label from the admin dashboard.</p>
    `;

    const notificationPromises = [
      transporter.sendMail(customerMailOptions),
      sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
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

    // CREATE in BOTH locations
    const toSave = {
      ...orderData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: newOrderStatus,
      id: orderId, // helpful to store within doc too
    };
    await writeOrderBoth(orderId, toSave);

    res.status(201).json({ message: "Order submitted", orderId: orderId });
  } catch (err) {
    console.error("Error submitting order:", err);
    res.status(500).json({ error: "Failed to submit order" });
  }
});

// Helper to format status
function formatStatusForEmail(status) {
  if (status === "order_pending") return "Order Pending";
  if (status === "shipping_kit_requested") return "Shipping Kit Requested";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Generate initial shipping label(s) and send email to buyer
app.post("/generate-label/:id", async (req, res) => {
  try {
    const doc = await ordersCollection.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });

    const order = { id: doc.id, ...doc.data() };
    const buyerShippingInfo = order.shippingInfo;
    const orderIdForLabel = order.id || "N/A";

    const swiftBuyBackAddress = {
      name: "SHC Returns",
      company_name: "SecondHandCell",
      phone: "555-555-5555",
      address_line1: "1602 McDonald Ave Ste Rear (24th Ave Entrance)",
      city_locality: "Brooklyn",
      state_province: "NY",
      postal_code: "11223",
      country_code: "US",
    };

    const buyerAddress = {
      name: buyerShippingInfo.fullName,
      phone: "555-555-5555",
      address_line1: buyerShippingInfo.streetAddress,
      city_locality: buyerShippingInfo.city,
      state_province: buyerShippingInfo.state,
      postal_code: buyerShippingInfo.zipCode,
      country_code: "US",
    };

    let customerLabelData;
    let updateData = { status: "label_generated" };
    let internalHtmlBody = "";
    let customerEmailSubject = "";
    let customerEmailHtml = "";
    let customerMailOptions;

    if (order.shippingPreference === "Shipping Kit Requested") {
      const outboundLabelData = await createShipEngineLabel(
        swiftBuyBackAddress,
        buyerAddress,
        `${orderIdForLabel}-OUTBOUND-KIT`
      );

      const inboundLabelData = await createShipEngineLabel(
        buyerAddress,
        swiftBuyBackAddress,
        `${orderIdForLabel}-INBOUND-DEVICE`
      );

      customerLabelData = outboundLabelData; // customer sees outbound kit tracking

      updateData = {
        ...updateData,
        outboundLabelUrl: outboundLabelData.label_download?.pdf,
        outboundTrackingNumber: outboundLabelData.tracking_number,
        inboundLabelUrl: inboundLabelData.label_download?.pdf,
        inboundTrackingNumber: inboundLabelData.tracking_number,
        uspsLabelUrl: inboundLabelData.label_download?.pdf,
        trackingNumber: inboundLabelData.tracking_number,
      };

      customerEmailSubject = `Your SecondHandCell Shipping Kit for Order #${order.id} is on its Way!`;
      customerEmailHtml = SHIPPING_KIT_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
        .replace(/\*\*ORDER_ID\*\*/g, order.id)
        .replace(/\*\*TRACKING_NUMBER\*\*/g, customerLabelData.tracking_number || "N/A");

      customerMailOptions = {
        from: functions.config().email.user,
        to: order.shippingInfo.email,
        subject: customerEmailSubject,
        html: customerEmailHtml,
      };

      internalHtmlBody = `
        <p><strong>Shipping Kit Order:</strong> Labels generated for Order <strong>#${order.id}</strong>.</p>
        <p><strong>Outbound Kit Label (SecondHandCell -> Customer):</strong></p>
        <ul>
          <li>Tracking: <strong>${
            outboundLabelData.tracking_number || "N/A"
          }</strong></li>
          <li>Download: <a href="${
            outboundLabelData.label_download?.pdf
          }" target="_blank">PDF</a></li>
        </ul>
        <p><strong>Inbound Device Label (Customer -> SecondHandCell - sent to customer later):</strong></p>
        <ul>
          <li>Tracking: <strong>${
            inboundLabelData.tracking_number || "N/A"
          }</strong></li>
          <li>Download: <a href="${
            inboundLabelData.label_download?.pdf
          }" target="_blank">PDF</a></li>
        </ul>
        <p>The outbound kit tracking has been sent to the customer.</p>
      `;
    } else if (order.shippingPreference === "Email Label Requested") {
      customerLabelData = await createShipEngineLabel(
        buyerAddress,
        swiftBuyBackAddress,
        `${orderIdForLabel}-INBOUND-DEVICE`
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
        from: functions.config().email.user,
        to: order.shippingInfo.email,
        subject: customerEmailSubject,
        html: customerEmailHtml,
      };

      internalHtmlBody = `
        <p>The shipping label for Order <strong>#${order.id}</strong> (email label option) has been successfully generated and sent to the customer.</p>
        <p>Tracking Number: <strong>${
          customerLabelData.tracking_number || "N/A"
        }</strong></p>
      `;
    } else {
      throw new Error(`Unknown shipping preference: ${order.shippingPreference}`);
    }

    await updateOrderBoth(req.params.id, updateData);

    await Promise.all([
      transporter.sendMail(customerMailOptions),
      sendZendeskComment(
        order,
        `Shipping Label Generated for Order #${order.id}`,
        internalHtmlBody,
        false
      ),
    ]);

    res.json({ message: "Label(s) generated successfully", orderId: order.id, ...updateData });
  } catch (err) {
    console.error("Error generating label:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to generate label" });
  }
});

// Update order status
app.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const { order } = await updateOrderBoth(orderId, { status });

    let customerNotificationPromise = Promise.resolve();
    let internalNotificationPromise = Promise.resolve();
    let internalSubject;
    let internalHtmlBody;

    switch (status) {
      case "received": {
        const deviceReceivedHtml = DEVICE_RECEIVED_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, order.id);

        customerNotificationPromise = transporter.sendMail({
          from: functions.config().email.user,
          to: order.shippingInfo.email,
          subject: "Your SecondHandCell Device Has Arrived",
          html: deviceReceivedHtml,
        });

        internalSubject = `Device Received for Order #${order.id}`;
        internalHtmlBody = `
          <p>The device for Order <strong>#${order.id}</strong> has been received.</p>
          <p>It is now awaiting inspection.</p>
        `;
        internalNotificationPromise = sendZendeskComment(
          order,
          internalSubject,
          internalHtmlBody,
          false
        );
        break;
      }
      case "completed": {
        customerNotificationPromise = transporter.sendMail({
          from: functions.config().email.user,
          to: order.shippingInfo.email,
          subject: "Your SecondHandCell Order is Complete",
          html: `
            <p>Hello ${order.shippingInfo.fullName},</p>
            <p>Great news! Your order <strong>#${order.id}</strong> has been completed and payment has been processed.</p>
            <p>If you have any questions about your payment, please let us know.</p>
            <p>Thank you for choosing SecondHandCell!</p>
          `,
        });

        internalSubject = `Order Completed: #${order.id}`;
        internalHtmlBody = `
          <p>Order <strong>#${order.id}</strong> has been marked as completed.</p>
          <p>Payment has been processed for this order.</p>
        `;
        internalNotificationPromise = sendZendeskComment(
          order,
          internalSubject,
          internalHtmlBody,
          false
        );
        break;
      }
      default: {
        // No specific emails
        break;
      }
    }

    await Promise.all([customerNotificationPromise, internalNotificationPromise]);

    res.json({ message: `Order marked as ${status}` });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Submit a re-offer (send to customer via Zendesk public comment)
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

    const zendeskHtmlContent = `
      <div style="font-family: 'system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Oxygen-Sans','Ubuntu','Cantarell','Helvetica Neue','Arial','sans-serif'; font-size: 14px; line-height: 1.5; color: #444444;">
        <h2 style="color: #0056b3; font-weight: bold; text-transform: none; font-size: 20px; line-height: 26px; margin: 5px 0 10px;">Hello ${order.shippingInfo.fullName},</h2>
        <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">We've received your device for Order #${order.id} and after inspection, we have a revised offer for you.</p>
        <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;"><strong>Original Quote:</strong> $${order.estimatedQuote.toFixed(2)}</p>
        <p style="font-size: 1.2em; color: #d9534f; font-weight: bold; line-height: 22px; margin: 15px 0;"><strong>New Offer Price:</strong> $${Number(newPrice).toFixed(2)}</p>
        <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;"><strong>Reason for New Offer:</strong></p>
        <p style="background-color: #f8f8f8; border-left-width: 5px; border-left-color: #d9534f; border-left-style: solid; color: #2b2e2f; line-height: 22px; margin: 15px 0; padding: 10px;"><em>"${reasonString}"</em></p>
        <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">Please review the new offer. You have two options:</p>
        <table width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px; border-collapse: collapse; font-size: 1em; width: 100%;">
          <tbody>
            <tr>
              <td align="center" style="vertical-align: top; padding: 0 10px;" valign="top">
                <table cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; font-size: 1em;">
                  <tbody>
                    <tr>
                      <td style="border-radius: 5px; background-color: #a7f3d0; text-align: center; vertical-align: top; padding: 5px; border: 1px solid #ddd;" align="center" bgcolor="#a7f3d0" valign="top">
                        <a href="${functions.config().app.frontend_url}/reoffer-action.html?orderId=${orderId}&action=accept" style="border-radius: 5px; font-size: 16px; color: #065f46; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #6ee7b7;" rel="noreferrer">
                          Accept Offer ($${Number(newPrice).toFixed(2)})
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td align="center" style="vertical-align: top; padding: 0 10px;" valign="top">
                <table cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; font-size: 1em;">
                  <tbody>
                    <tr>
                      <td style="border-radius: 5px; background-color: #fecaca; text-align: center; vertical-align: top; padding: 5px; border: 1px solid #ddd;" align="center" bgcolor="#fecaca" valign="top">
                        <a href="${functions.config().app.frontend_url}/reoffer-action.html?orderId=${orderId}&action=return" style="border-radius: 5px; font-size: 16px; color: #991b1b; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #fca5a5;" rel="noreferrer">
                          Return Phone Now
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        <p style="color: #2b2e2f; line-height: 22px; margin: 30px 0 15px;">If you have any questions, please reply to this email.</p>
        <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">Thank you,<br>The SecondHandCell Team</p>
      </div>
    `;

    const zendeskSubject = `Re-offer for Order #${order.id}`;
    await sendZendeskComment(order, zendeskSubject, zendeskHtmlContent, true);

    res.json({ message: "Re-offer submitted successfully", newPrice, orderId: order.id });
  } catch (err) {
    console.error("Error submitting re-offer:", err);
    res.status(500).json({ error: "Failed to submit re-offer" });
  }
});

// Generate return shipping label and send email to buyer
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
      phone: "555-555-5555",
      address_line1: "1602 McDonald Ave Ste Rear (24th Ave Entrance)",
      city_locality: "Brooklyn",
      state_province: "NY",
      postal_code: "11230",
      country_code: "US",
    };

    const buyerAddress = {
      name: buyerShippingInfo.fullName,
      phone: "555-555-5555",
      address_line1: buyerShippingInfo.streetAddress,
      city_locality: buyerShippingInfo.city,
      state_province: buyerShippingInfo.state,
      postal_code: buyerShippingInfo.zipCode,
      country_code: "US",
    };

    const returnLabelData = await createShipEngineLabel(
      swiftBuyBackAddress,
      buyerAddress,
      `${orderIdForLabel}-RETURN`
    );

    const returnTrackingNumber = returnLabelData.tracking_number;

    await updateOrderBoth(req.params.id, {
      status: "return-label-generated",
      returnLabelUrl: returnLabelData.label_download?.pdf,
      returnTrackingNumber: returnTrackingNumber,
    });

    const customerMailOptions = {
      from: functions.config().email.user,
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
    };

    const internalSubject = `Return Label Sent for Order #${order.id}`;
    const internalHtmlBody = `
      <p>A return label for Order <strong>#${order.id}</strong> has been generated and sent to the customer.</p>
      <p>Return Tracking Number: <strong>${returnTrackingNumber || "N/A"}</strong></p>
    `;

    await Promise.all([
      transporter.sendMail(customerMailOptions),
      sendZendeskComment(order, internalSubject, internalHtmlBody, false),
    ]);

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

// Accept-offer action
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

    const internalSubject = `Re-offer Accepted for Order #${orderData.id}`;
    const internalHtmlBody = `
      <p>The customer has <strong>accepted</strong> the revised offer of <strong>$${orderData.reOffer.newPrice.toFixed(
        2
      )}</strong> for Order #${orderData.id}.</p>
      <p>Please proceed with payment processing.</p>
    `;

    await Promise.all([
      sendZendeskComment(
        orderData,
        `Offer Accepted for Order #${orderData.id}`,
        customerHtmlBody,
        true
      ),
      sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
    ]);

    res.json({ message: "Offer accepted successfully.", orderId: orderData.id });
  } catch (err) {
    console.error("Error accepting offer:", err);
    res.status(500).json({ error: "Failed to accept offer" });
  }
});

// Return-phone action
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

    const internalSubject = `Return Requested for Order #${orderData.id}`;
    const internalHtmlBody = `
      <p>The customer has <strong>declined</strong> the revised offer for Order #${orderData.id} and has requested that their phone be returned.</p>
      <p>Please initiate the return process and send a return shipping label.</p>
    `;

    await Promise.all([
      sendZendeskComment(
        orderData,
        `Return Requested for Order #${orderData.id}`,
        customerHtmlBody,
        true
      ),
      sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
    ]);

    res.json({ message: "Return requested successfully.", orderId: orderData.id });
  } catch (err) {
    console.error("Error requesting return:", err);
    res.status(500).json({ error: "Failed to request return" });
  }
});

// Scheduled function: auto-accept expired offers
exports.autoAcceptOffers = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredOffers = await ordersCollection
      .where("status", "==", "re-offered-pending")
      .where("reOffer.autoAcceptDate", "<=", now)
      .get();

    const updates = expiredOffers.docs.map(async (doc) => {
      const orderRef = ordersCollection.doc(doc.id);
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

      const internalSubject = `Order #${orderData.id} Auto-Accepted`;
      const internalHtmlBody = `
        <p>The revised offer of <strong>$${orderData.reOffer.newPrice.toFixed(
          2
        )}</strong> for Order #${orderData.id} has been <strong>auto-accepted</strong> due to no response from the customer within the 7-day period.</p>
        <p>Please proceed with payment processing.</p>
      `;

      await Promise.all([
        sendZendeskComment(
          orderData,
          `Revised Offer Auto-Accepted for Order #${orderData.id}`,
          customerHtmlBody,
          true
        ),
        sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
      ]);

      await updateOrderBoth(doc.id, {
        status: "re-offered-auto-accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await Promise.all(updates);
    console.log(`Auto-accepted ${updates.length} expired offers.`);
    return null;
  });

// Create user record on auth create
exports.createUserRecord = functions.auth.user().onCreate(async (user) => {
  try {
    console.log(`New user created: ${user.uid}`);
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null,
      phoneNumber: user.phoneNumber || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await usersCollection.doc(user.uid).set(userData);
    console.log(`User data for ${user.uid} saved to Firestore.`);
  } catch (error) {
    console.error("Error saving user data to Firestore:", error);
  }
});

// Chat transfer notifier
exports.onChatTransferUpdate = functions.firestore
  .document("chats/{chatId}")
  .onUpdate(async (change, context) => {
    const newChatData = change.after.data();
    const oldChatData = change.before.data();

    const newTransferRequest = newChatData.transferRequest;
    const oldTransferRequest = oldChatData.transferRequest;

    if (
      newTransferRequest &&
      newTransferRequest.status === "pending" &&
      (!oldTransferRequest || oldTransferRequest.status !== "pending")
    ) {
      const targetAdminUid = newTransferRequest.toUid;
      const fromAdminName = newTransferRequest.fromName;
      const chatUser =
        newTransferRequest.userDisplayName ||
        newChatData.ownerUid ||
        newChatData.guestId;

      const notificationMessage = `Chat transfer from ${fromAdminName} for ${chatUser}.`;

      await sendAdminPushNotification("Incoming Chat Transfer!", notificationMessage, {
        chatId: context.params.chatId,
        userId: newChatData.ownerUid,
        action: "open_chat",
        relatedDocType: "chat",
        relatedDocId: context.params.chatId,
      }).catch((e) => console.error("FCM Send Error (Chat Transfer):", e));

      await addAdminFirestoreNotification(
        targetAdminUid,
        notificationMessage,
        "chat",
        context.params.chatId,
        newChatData.ownerUid
      ).catch((e) =>
        console.error("Firestore Notification Error (Chat Transfer):", e)
      );

      console.log(
        `Notification sent for chat transfer to admin ${targetAdminUid} for chat ${context.params.chatId}.`
      );
    }

    return null;
  });

// Expose the Express app as a single Cloud Function
exports.api = functions.https.onRequest(app);

// New endpoint for PhoneChecks ESN API
app.post("/check-esn", async (req, res) => {
  try {
    const { imei, carrier, devicetype } = req.body;
    
    // Log the incoming request body for debugging
    console.log("Received request to /check-esn with payload:", req.body);

    if (!imei || !carrier || !devicetype) {
      return res.status(400).json({ error: "Missing required fields: imei, carrier, and devicetype are all required." });
    }

    const apiUrl = "https://clientapiv2.phonecheck.com/cloud/cloudDB/CheckEsn/";
    const requestPayload = {
      ApiKey: "5fed1416-159a-4c37-b9e4-49053fc9a399",
      Username: "aecells1",
      IMEI: imei,
      carrier: carrier,
      devicetype: devicetype
    };

    // Log the payload sent to the external API
    console.log("Sending payload to PhoneChecks API:", requestPayload);

    const response = await axios.post(apiUrl, requestPayload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    res.status(200).json(response.data);

  } catch (error) {
    console.error("Error calling PhoneChecks API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check ESN", details: error.response?.data || error.message });
  }
});
