#!/bin/bash

# Define the base directory for the functions
BASE_DIR="functions"

echo "Creating the new directory structure for your Firebase Functions..."

# Create core directories
mkdir -p "$BASE_DIR"/{routes,services,helpers}

# --- Create the main index.js file ---
echo "Creating functions/index.js"
cat > "$BASE_DIR/index.js" << 'EOF'
const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { info, warn, error } = require('firebase-functions/logger');

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

// Import Express routers
const orderRoutes = require('./routes/orders');
const labelRoutes = require('./routes/labels');
const imeiRoutes = require('./routes/imei');
const webhookRoutes = require('./routes/webhook');
const { verifyFirebaseToken } = require('./helpers/security');

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
app.use(express.json());

// Apply authentication middleware to all routes except public ones
app.use(verifyFirebaseToken);

// Use imported routers for each API endpoint group
app.use('/api', orderRoutes);
app.use('/api', labelRoutes);
app.use('/api', imeiRoutes);
app.use('/api', webhookRoutes);

// Expose the Express app as a single Cloud Function
// UPDATED: Increase memory and timeout for the API function
exports.api = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onRequest(app);

// Scheduled function: auto-accept expired offers
exports.autoAcceptOffers = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    // This is where you would call the function from a separate module
    // if you had a dedicated module for scheduled jobs.
    // For now, this is a placeholder.
    console.log("Running auto-accept offers job...");
    return null;
  });

// Create user record on auth create
exports.createUserRecord = functions.auth.user().onCreate(async (user) => {
  const { usersCollection } = require('./helpers/db');
  const admin = require("firebase-admin");
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
EOF

# --- Create the routes files ---
echo "Creating functions/routes/orders.js"
cat > "$BASE_DIR/routes/orders.js" << 'EOF'
const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const admin = require("firebase-admin");

// Corrected import from the helpers module
const {
    ordersCollection,
    usersCollection,
    adminsCollection,
    writeOrderBoth,
    updateOrderBoth
} = require('../helpers/db');
const { sendAdminPushNotification, addAdminFirestoreNotification, sendEmail } = require('../services/notifications');
const { sendZendeskComment } = require('../services/zendesk');
const { generateNextOrderNumber, formatStatusForEmail } = require('../helpers/order');
const { ORDER_RECEIVED_EMAIL_HTML, DEVICE_RECEIVED_EMAIL_HTML } = require('../helpers/templates');

// Get all orders (Admin only)
router.get("/orders", async (req, res) => {
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
router.get("/orders/:id", async (req, res) => {
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

// Find by identifier (SHC-XXXXX or other external ID)
router.get("/orders/find", async (req, res) => {
    try {
        const { identifier } = req.query;
        if (!identifier) {
            return res.status(400).json({ error: "Identifier query parameter is required." });
        }

        let orderDoc;
        if (identifier.match(/^SHC-\d{5}$/)) {
            orderDoc = await ordersCollection.doc(identifier).get();
        } else {
            const snapshot = await ordersCollection
                .where("externalId", "==", identifier)
                .limit(1)
                .get();
            if (!snapshot.empty) {
                orderDoc = snapshot.docs[0];
            }
        }

        if (!orderDoc || !orderDoc.exists) {
            return res.status(404).json({ error: "Order not found with provided identifier." });
        }

        res.json({ id: orderDoc.id, ...orderDoc.data() });
    } catch (err) {
        console.error("Error finding order:", err);
        res.status(500).json({ error: "Failed to find order" });
    }
});

// Get all orders for a specific user ID (from top-level collection)
router.get("/orders/by-user/:userId", async (req, res) => {
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
router.post("/submit-order", async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData?.shippingInfo || !orderData?.estimatedQuote) {
            return res.status(400).json({ error: "Invalid order data" });
        }
        
        // This is a public route, so we can't get the UID from req.user
        // unless the user is logged in.
        const userId = req.headers['x-user-id'] || null;

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
                <p style="margin-top: 24px;">We will send your shipping label in a separate email shortly.</p>
                <p>If you have any questions, please reply to this email.</p>
            `;
        }

        const customerEmailHtml = ORDER_RECEIVED_EMAIL_HTML
            .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
            .replace(/\*\*ORDER_ID\*\*/g, orderId)
            .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
            .replace(/\*\*SHIPPING_INSTRUCTION\*\*/g, shippingInstructions);

        const customerMailOptions = {
            from: "SecondHandCell <" + functions.config().email.user + ">",
            to: orderData.shippingInfo.email,
            subject: `Your SecondHandCell Order #${orderId} Has Been Received!`,
            html: customerEmailHtml,
        };

        const internalSubject = `New Order Placed: #${orderId}`;
        const internalHtmlBody = `
            <p>A new order has been placed by <strong>${orderData.shippingInfo.fullName}</strong> (Email: ${orderData.shippingInfo.email}).</p>
            <p>Order ID: <strong>${orderId}</strong></p>
            <p>Estimated Quote: <strong>$${orderData.estimatedQuote.toFixed(2)}</strong></p>
            ${
                userId
                    ? `<p>Associated User ID: <strong>${userId}</strong></p>`
                    : "<p>Not associated with a logged-in user.</p>"
            }
            <p><strong>Shipping Preference:</strong> ${orderData.shippingPreference}</p>
            <p>The current status is: <strong>${formatStatusForEmail(
                newOrderStatus
            )}</strong></p>
            <p>Please generate and send the shipping label from the admin dashboard.</p>
        `;

        await Promise.all([
            sendEmail(customerMailOptions),
            sendZendeskComment({
                id: orderId,
                shippingInfo: orderData.shippingInfo
            }, internalSubject, internalHtmlBody, false),
            sendAdminPushNotification(
                "⚡ New Order Placed!",
                `Order #${orderId} for ${orderData.device} from ${orderData.shippingInfo.fullName}.`,
                {
                    orderId: orderId,
                    userId: userId || "guest",
                    relatedDocType: "order",
                    relatedDocId: orderId,
                    relatedUserId: userId,
                }
            ).catch((e) => console.error("FCM Send Error (New Order):", e)),
            addAdminFirestoreNotification(
                "New Order",
                `New Order: #${orderId} from ${orderData.shippingInfo.fullName}.`,
                "order",
                orderId,
                userId
            ).catch((e) => console.error("Firestore Notification Error (New Order):", e)),
        ]);
        
        const toSave = {
            ...orderData,
            userId,
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

// Update order status
router.put("/orders/:id/status", async (req, res) => {
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

                customerNotificationPromise = sendEmail({
                    from: "SecondHandCell <" + functions.config().email.user + ">",
                    to: order.shippingInfo.email,
                    subject: "Your SecondHandCell Device Has Arrived",
                    html: deviceReceivedHtml,
                });

                internalSubject = `Device Received for Order #${order.id}`;
                internalHtmlBody = `<p>The device for Order <strong>#${order.id}</strong> has been received.</p><p>It is now awaiting inspection.</p>`;
                internalNotificationPromise = sendZendeskComment(order, internalSubject, internalHtmlBody, false);
                break;
            }
            case "completed": {
                const customerEmailHtml = `<p>Hello ${order.shippingInfo.fullName},</p><p>Great news! Your order <strong>#${order.id}</strong> has been completed and payment has been processed.</p><p>If you have any questions about your payment, please let us know.</p><p>Thank you for choosing SecondHandCell!</p>`;
                customerNotificationPromise = sendEmail({
                    from: "SecondHandCell <" + functions.config().email.user + ">",
                    to: order.shippingInfo.email,
                    subject: "Your SecondHandCell Order is Complete",
                    html: customerEmailHtml,
                });

                internalSubject = `Order Completed: #${order.id}`;
                internalHtmlBody = `<p>Order <strong>#${order.id}</strong> has been marked as completed.</p><p>Payment has been processed for this order.</p>`;
                internalNotificationPromise = sendZendeskComment(order, internalSubject, internalHtmlBody, false);
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
router.post("/orders/:id/re-offer", async (req, res) => {
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

// Accept-offer action
router.post("/accept-offer-action", async (req, res) => {
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
            return res.status(409).json({ error: "This offer has already been accepted or declined." });
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
            <p>The customer has <strong>accepted</strong> the revised offer of <strong>$${orderData.reOffer.newPrice.toFixed(2)}</strong> for Order #${orderData.id}.</p>
            <p>Please proceed with payment processing.</p>
        `;

        await Promise.all([
            sendZendeskComment(orderData, `Offer Accepted for Order #${orderData.id}`, customerHtmlBody, true),
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
        ]);

        res.json({ message: "Offer accepted successfully.", orderId: orderData.id });
    } catch (err) {
        console.error("Error accepting offer:", err);
        res.status(500).json({ error: "Failed to accept offer" });
    }
});

// Return-phone action
router.post("/return-phone-action", async (req, res) => {
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
            return res.status(409).json({ error: "This offer has already been accepted or declined." });
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
            sendZendeskComment(orderData, `Return Request for Order #${orderData.id}`, customerHtmlBody, true),
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false),
        ]);

        res.json({ message: "Return requested successfully. Admin has been notified to generate the label.", orderId: orderData.id });
    } catch (err) {
        console.error("Error processing return request:", err);
        res.status(500).json({ error: "Failed to process return request" });
    }
});

module.exports = router;
EOF

echo "Creating functions/routes/labels.js"
cat > "$BASE_DIR/routes/labels.js" << 'EOF'
const express = require('express');
const router = express.Router();
const { getStorage } = require('firebase-admin/storage');
const { getFirestore } = require('firebase-admin/firestore');
const { createShipStationLabel } = require('../services/shipstation');
const { sendZendeskComment } = require('../services/zendesk');
const { sendEmail } = require('../services/notifications');
const { ordersCollection, usersCollection, updateOrderBoth } = require('../helpers/db');
const { generateCustomLabelPdf } = require('../helpers/pdf');
const { SHIPPING_LABEL_EMAIL_HTML, SHIPPING_KIT_EMAIL_HTML } = require('../helpers/templates');
const functions = require('firebase-functions');
const db = getFirestore();
const storage = getStorage();

// Generate initial shipping label(s) and send email to buyer
router.post("/generate-label/:id", async (req, res) => {
    try {
        const doc = await ordersCollection.doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });

        const order = { id: doc.id, ...doc.data() };
        const buyerShippingInfo = order.shippingInfo;
        const weightInOunces = 1; // Default to 1 ounce

        const swiftBuyBackAddress = {
            name: "SHC Returns",
            company: "SecondHandCell",
            phone: "555-555-5555",
            street1: "1602 McDonald Ave Ste Rear",
            street2: "(24th Ave Entrance)",
            city: "Brooklyn",
            state: "NY",
            postalCode: "11223",
            country: "US",
        };

        const buyerAddress = {
            name: buyerShippingInfo.fullName,
            phone: "555-555-5555",
            street1: buyerShippingInfo.streetAddress,
            street2: "", // Added to match ShipStation API schema
            city: buyerShippingInfo.city,
            state: buyerShippingInfo.state,
            postalCode: buyerShippingInfo.zipCode,
            country: "US",
        };

        let updateData = { status: "label_generated" };
        let internalHtmlBody = "";
        let customerEmailSubject = "";
        let customerMailOptions;
        let mainLabelData, mainTrackingNumber, outboundLabelData, inboundLabelData;
        let customerLabelPdfBuffer;

        if (order.shippingPreference === "Shipping Kit Requested") {
            [outboundLabelData, inboundLabelData] = await Promise.all([
                createShipStationLabel(
                    swiftBuyBackAddress,
                    buyerAddress,
                    "se-1012766", // Carrier Code
                    "usps_ground_advantage", // Service Code
                    "package", // Package Code
                    weightInOunces
                ),
                createShipStationLabel(
                    buyerAddress,
                    swiftBuyBackAddress,
                    "se-1012766",
                    "usps_ground_advantage",
                    "package",
                    weightInOunces
                )
            ]);
            
            mainLabelData = inboundLabelData.labelData;
            mainTrackingNumber = inboundLabelData.trackingNumber;

            updateData = {
                ...updateData,
                outboundTrackingNumber: outboundLabelData.trackingNumber,
                inboundTrackingNumber: inboundLabelData.trackingNumber,
                trackingNumber: inboundLabelData.trackingNumber, // Set primary tracking
            };

            customerEmailSubject = `Your SecondHandCell Shipping Kit for Order #${order.id} is on its Way!`;
            customerEmailHtml = SHIPPING_KIT_EMAIL_HTML
                .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
                .replace(/\*\*ORDER_ID\*\*/g, order.id)
                .replace(/\*\*TRACKING_NUMBER\*\*/g, outboundLabelData.trackingNumber || "N/A"); // FIX: use outbound tracking for shipping kit
                
            customerMailOptions = {
                from: "SecondHandCell <" + functions.config().email.user + ">",
                to: order.shippingInfo.email,
                subject: customerEmailSubject,
                html: customerEmailHtml,
            };

            internalHtmlBody = `
                <p><strong>Shipping Kit Order:</strong> Labels generated for Order <strong>#${order.id}</strong>.</p>
                <p><strong>Outbound Kit Label (SHC -> Customer):</strong></p>
                <ul>
                    <li>Tracking: <strong>${outboundLabelData.trackingNumber || "N/A"}</strong></li>
                </ul>
                <p><strong>Inbound Device Label (Customer -> SHC):</strong></p>
                <ul>
                    <li>Tracking: <strong>${inboundLabelData.trackingNumber || "N/A"}</strong></li>
                </ul>
                <p>The outbound kit tracking has been sent to the customer. Awaiting inbound shipment.</p>
            `;

        } else if (order.shippingPreference === "Email Label Requested") {
            const customerLabelData = await createShipStationLabel(
                buyerAddress,
                swiftBuyBackAddress,
                "se-1012766",
                "usps_ground_advantage",
                "package",
                weightInOunces
            );
            
            mainLabelData = customerLabelData.labelData;
            mainTrackingNumber = customerLabelData.trackingNumber;
            customerLabelPdfBuffer = await generateCustomLabelPdf(order);

            updateData = {
                ...updateData,
                trackingNumber: mainTrackingNumber,
            };

            const labelUrl = await uploadLabelToCloudStorage(order.id, mainLabelData);
            updateData.labelUrl = labelUrl;
            
            customerEmailSubject = `Your SecondHandCell Shipping Label for Order #${order.id}`;
            const customerEmailHtml = SHIPPING_LABEL_EMAIL_HTML
                .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
                .replace(/\*\*ORDER_ID\*\*/g, order.id)
                .replace(/\*\*TRACKING_NUMBER\*\*/g, mainTrackingNumber || "N/A")
                .replace(/\*\*LABEL_DOWNLOAD_LINK\*\*/g, labelUrl);

            customerMailOptions = {
                from: "SecondHandCell <" + functions.config().email.user + ">",
                to: order.shippingInfo.email,
                subject: customerEmailSubject,
                html: customerEmailHtml,
                attachments: [{
                    filename: `SecondHandCell-InternalLabel-${order.id}.pdf`,
                    content: customerLabelPdfBuffer,
                    contentType: 'application/pdf',
                }],
            };

            internalHtmlBody = `
                <p>The shipping label for Order <strong>#${order.id}</strong> (email label option) has been successfully generated and sent to the customer.</p>
                <p>Tracking Number: <strong>${mainTrackingNumber || "N/A"}</strong></p>
                <p>A custom internal label has also been generated and attached to the email for the customer to place on the device bag.</p>
            `;
        } else {
            throw new Error(`Unknown shipping preference: ${order.shippingPreference}`);
        }

        await updateOrderBoth(req.params.id, updateData);

        await Promise.all([
            sendEmail(customerMailOptions),
            sendZendeskComment(order, `Shipping Label Generated for Order #${order.id}`, internalHtmlBody, false),
        ]);

        res.json({ message: "Label(s) generated successfully", orderId: order.id, trackingNumber: mainTrackingNumber });
    } catch (err) {
        console.error("Error generating label:", err.response?.data || err.message || err);
        res.status(500).json({ error: "Failed to generate label" });
    }
});

router.post("/orders/:id/return-label", async (req, res) => {
    try {
        const doc = await ordersCollection.doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });
        const order = { id: doc.id, ...doc.data() };

        const seccondHandCellAddress = {
            name: "SHC Returns",
            company: "SecondHandCell",
            phone: "555-555-5555",
            street1: "1602 McDonald Ave Ste Rear",
            street2: "(24th Ave Entrance)",
            city: "Brooklyn",
            state: "NY",
            postalCode: "11223",
            country: "US",
        };

        const buyerShippingInfo = order.shippingInfo;
        const buyerAddress = {
            name: buyerShippingInfo.fullName,
            phone: "555-555-5555",
            street1: buyerShippingInfo.streetAddress,
            street2: "",
            city: buyerShippingInfo.city,
            state: buyerShippingInfo.state,
            postalCode: buyerShippingInfo.zipCode,
            country: "US",
        };

        const returnLabelData = await createShipStationLabel(
            seccondHandCellAddress,
            buyerAddress,
            "se-1012766",
            "usps_ground_advantage",
            "package",
            1
        );

        const returnTrackingNumber = returnLabelData.trackingNumber;
        const returnLabelUrl = await uploadLabelToCloudStorage(`return-${order.id}`, returnLabelData.labelData);

        await updateOrderBoth(req.params.id, {
            status: "return-label-generated",
            returnLabelUrl: returnLabelUrl,
            returnTrackingNumber: returnTrackingNumber,
        });

        const customerMailOptions = {
            from: "SecondHandCell <" + functions.config().email.user + ">",
            to: order.shippingInfo.email,
            subject: "Your SecondHandCell Return Label",
            html: `
                <p>Hello ${order.shippingInfo.fullName},</p>
                <p>As requested, here is your return shipping label for your device (Order ID: ${order.id}):</p>
                <p>Return Tracking Number: <strong>${returnTrackingNumber || "N/A"}</strong></p>
                <p>Please open the attached PDF to download and print your label.</p>
                <p>Thank you,</p>
                <p>The SecondHandCell Team</p>
            `,
            attachments: [{
                filename: `SecondHandCell-ReturnLabel-${order.id}.pdf`,
                content: Buffer.from(returnLabelData.labelData, 'base64'),
                contentType: 'application/pdf',
            }],
        };

        const internalSubject = `Return Label Sent for Order #${order.id}`;
        const internalHtmlBody = `<p>A return label for Order <strong>#${order.id}</strong> has been generated and sent to the customer.</p><p>Return Tracking Number: <strong>${returnTrackingNumber || "N/A"}</strong></p>`;

        await Promise.all([
            sendEmail(customerMailOptions),
            sendZendeskComment(order, internalSubject, internalHtmlBody, false),
        ]);

        res.json({
            message: "Return label generated successfully.",
            labelUrl: returnLabelUrl,
            trackingNumber: returnTrackingNumber,
            orderId: order.id,
        });
    } catch (err) {
        console.error("Error generating return label:", err.response?.data || err);
        res.status(500).json({ error: "Failed to generate return label" });
    }
});

// Helper function to upload the base64 label data to Cloud Storage
async function uploadLabelToCloudStorage(id, base64Data) {
    const bucket = storage.bucket('your-firebase-project-id.appspot.com');
    const fileName = `shipping-labels/${id}.pdf`;
    const file = bucket.file(fileName);

    await file.save(Buffer.from(base64Data, 'base64'), {
        metadata: { contentType: 'application/pdf' },
    });

    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

module.exports = router;
EOF

echo "Creating functions/routes/imei.js"
cat > "$BASE_DIR/routes/imei.js" << 'EOF'
const express = require('express');
const router = express.Router();
const axios = require("axios");
const { ordersCollection, adminsCollection, updateOrderBoth } = require('../helpers/db');
const { sendEmail } = require('../services/notifications');
const { BLACKLISTED_EMAIL_HTML } = require('../helpers/templates');
const functions = require('firebase-functions');

// NEW ENDPOINT for IMEI/ESN Check
router.post("/check-esn", async (req, res) => {
    const { imei, orderId, customerName, customerEmail } = req.body;

    if (!imei || !orderId) {
        return res.status(400).json({ error: "IMEI and Order ID are required." });
    }

    try {
        // This is a MOCK API call. Replace this with your actual ESN check provider API call.
        console.log(`Simulating ESN check for IMEI: ${imei}`);
        const isClean = Math.random() > 0.1; // 90% chance of being clean for demonstration

        const mockApiResponse = {
            overall: isClean ? 'Clean' : 'Fail',
            blacklistStatus: isClean ? 'Clean' : 'Lost Or Stolen',
            imei: imei,
            make: "Apple",
            model: "iPhone 14 Pro",
            operatingSys: "iOS 16.5",
            deviceType: "phone",
            imeiHistory: isClean ? [] : [{ action: 'BLACKLISTED', reasoncodedesc: 'Reported Lost or Stolen', date: new Date().toISOString() }]
        };

        const updateData = {
            status: 'imei_checked',
            fulfilledOrders: {
                imei: imei,
                rawResponse: mockApiResponse
            }
        };

        if (!isClean) {
            updateData.status = 'blacklisted'; // Update status if blacklisted
        }

        const { order } = await updateOrderBoth(orderId, updateData);

        // If the device is not clean, send a notification email.
        if (!isClean) {
            console.log(`Device for order ${orderId} is blacklisted. Sending notification.`);
            const blacklistEmailHtml = BLACKLISTED_EMAIL_HTML
                .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName || 'Customer')
                .replace(/\*\*ORDER_ID\*\*/g, orderId)
                .replace(/\*\*STATUS_REASON\*\*/g, mockApiResponse.blacklistStatus)
                .replace(/\*\*LEGAL_TEXT\*\*/g, 'As per our policy and legal requirements, we are obligated to report this device.');

            const mailOptions = {
                from: "SecondHandCell <" + functions.config().email.user + ">",
                to: customerEmail,
                subject: `Important Notice Regarding Your Device for Order #${orderId}`,
                html: blacklistEmailHtml,
            };
            await sendEmail(mailOptions);
        }

        res.json(mockApiResponse);
    } catch (error) {
        console.error("Error during IMEI check:", error);
        res.status(500).json({ error: "Failed to perform IMEI check." });
    }
});

module.exports = router;
EOF

echo "Creating functions/routes/webhook.js"
cat > "$BASE_DIR/routes/webhook.js" << 'EOF'
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ordersCollection, updateOrderBoth } = require('../helpers/db');
const functions = require('firebase-functions');
const { info, error } = require('firebase-functions/logger');

// Middleware to verify ShipStation webhook signature
const verifyShipStationSignature = (req, res, next) => {
    const signature = req.headers['x-shipstation-signature'];
    const secret = functions.config().shipstation.webhook_secret;

    if (!signature) {
        error('Webhook received without signature header.');
        return res.status(401).send('Unauthorized: Signature missing.');
    }

    try {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(req.body));
        const calculatedSignature = hmac.digest('base64');

        if (calculatedSignature !== signature) {
            error('Invalid ShipStation webhook signature.');
            return res.status(401).send('Unauthorized: Invalid signature.');
        }
    } catch (err) {
        error('Error verifying ShipStation signature:', err);
        return res.status(500).send('Internal Server Error.');
    }
    next();
};

// ShipStation Webhook Endpoint
router.post('/webhook/shipstation', verifyShipStationSignature, async (req, res) => {
    try {
        const event = req.body;
        info('Received ShipStation webhook event:', event);

        // Find the order using the tracking number
        const trackingNumber = event.resource_url.split('/')[4];
        const snapshot = await ordersCollection.where('trackingNumber', '==', trackingNumber).limit(1).get();

        if (snapshot.empty) {
            info('Order not found for tracking number:', trackingNumber);
            return res.status(404).send('Order not found');
        }

        const orderDoc = snapshot.docs[0];
        const orderId = orderDoc.id;
        let newStatus = '';
        let updateData = {};

        switch (event.event_type) {
            case 'SHIPMENT_SHIPPED':
            case 'SHIPMENT_TRACKING':
                newStatus = 'in_transit';
                break;
            case 'SHIPMENT_DELIVERED':
                newStatus = 'delivered';
                break;
            case 'SHIPMENT_VOIDED':
                newStatus = 'voided';
                break;
            default:
                info('Ignoring unknown event type:', event.event_type);
                return res.status(200).send('Ignored');
        }
        
        // Update Firestore
        if (newStatus) {
            updateData.status = newStatus;
            await updateOrderBoth(orderId, updateData);
        }

        res.status(200).send('Webhook received successfully');
    } catch (err) {
        error('Error processing ShipStation webhook:', err);
        res.status(500).send('Failed to process webhook');
    }
});

module.exports = router;
EOF

# --- Create the services files ---
echo "Creating functions/services/shipstation.js"
cat > "$BASE_DIR/services/shipstation.js" << 'EOF'
const axios = require("axios");
const functions = require("firebase-functions");

/**
 * Helper function to create a shipping label using the ShipStation API.
 */
async function createShipStationLabel(fromAddress, toAddress, carrierCode, serviceCode, packageCode = "package", weightInOunces = 8, testLabel = false) {
    const shipstationApiKey = functions.config().shipstation.key;
    const shipstationApiSecret = functions.config().shipstation.secret;
    
    if (!shipstationApiKey || !shipstationApiSecret) {
        throw new Error("ShipStation API credentials not configured. Please set 'shipstation.key' and 'shipstation.secret' environment variables.");
    }
    
    const authHeader = `Basic ${Buffer.from(`${shipstationApiKey}:${shipstationApiSecret}`).toString('base64')}`;
    const today = new Date().toISOString().split('T')[0];

    const payload = {
        carrierCode: carrierCode,
        serviceCode: serviceCode,
        packageCode: packageCode,
        shipDate: today,
        weight: {
            value: weightInOunces,
            units: "ounces"
        },
        shipFrom: fromAddress,
        shipTo: toAddress,
        testLabel: testLabel
    };

    try {
        const response = await axios.post("https://ssapi.shipstation.com/shipments/createlabel", payload, {
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error creating ShipStation label:", error.response?.data || error.message);
        throw new Error(`Failed to create ShipStation label: ${error.response?.data?.ExceptionMessage || error.message}`);
    }
}

module.exports = { createShipStationLabel };
EOF

echo "Creating functions/services/zendesk.js"
cat > "$BASE_DIR/services/zendesk.js" << 'EOF'
const axios = require("axios");
const functions = require("firebase-functions");

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

module.exports = { sendZendeskComment };
EOF

echo "Creating functions/services/notifications.js"
cat > "$BASE_DIR/services/notifications.js" << 'EOF'
const nodemailer = require("nodemailer");
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const functions = require("firebase-functions");

const db = getFirestore();
const messaging = getMessaging();
const adminsCollection = db.collection("admins");

// Set up Nodemailer transporter using the Firebase Functions config
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: functions.config().email.user,
        pass: functions.config().email.pass,
    },
});

async function sendEmail(mailOptions) {
    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

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
            console.log("No FCM tokens found for any admin. Cannot send push notification.");
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

        const response = await messaging.sendEachForMulticast(message);
        console.log("Successfully sent FCM messages:", response.successCount, "failures:", response.failureCount);
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.error(`Failed to send FCM to token ${allTokens[idx]}: ${resp.error}`);
                }
            });
        }
    } catch (error) {
        console.error("Error sending FCM push notification:", error);
    }
}

async function addAdminFirestoreNotification(message, relatedDocType = null, relatedDocId = null, relatedUserId = null) {
    try {
        const adminsSnapshot = await adminsCollection.get();
        const promises = adminsSnapshot.docs.map(async (adminDoc) => {
            const notificationsCollectionRef = adminsCollection.doc(adminDoc.id).collection("notifications");
            await notificationsCollectionRef.add({
                message: message,
                isRead: false,
                createdAt: db.FieldValue.serverTimestamp(),
                relatedDocType: relatedDocType,
                relatedDocId: relatedDocId,
                relatedUserId: relatedUserId,
            });
        });
        await Promise.all(promises);
        console.log(`Firestore notifications added for all admins.`);
    } catch (error) {
        console.error("Error adding Firestore notifications:", error);
    }
}

module.exports = {
    sendEmail,
    sendAdminPushNotification,
    addAdminFirestoreNotification,
};
EOF

# --- Create the helpers files ---
echo "Creating functions/helpers/db.js"
cat > "$BASE_DIR/helpers/db.js" << 'EOF'
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

const ordersCollection = db.collection("orders");
const usersCollection = db.collection("users");
const adminsCollection = db.collection("admins");

/**
 * Write & update in BOTH locations:
 * 1) Top-level /orders/{orderId}
 * 2) If userId present: /users/{userId}/orders/{orderId}
 */
async function writeOrderBoth(orderId, data) {
    // Hard write (no merge) for initial creation
    await ordersCollection.doc(orderId).set(data);
    if (data.userId) {
        await usersCollection.doc(data.userId).collection("orders").doc(orderId).set(data);
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
        await usersCollection.doc(userId).collection("orders").doc(orderId).set(partialData, { merge: true });
    }

    return { order: { id: orderId, ...base, ...partialData }, userId };
}

module.exports = { writeOrderBoth, updateOrderBoth, ordersCollection, usersCollection, adminsCollection };
EOF

echo "Creating functions/helpers/order.js"
cat > "$BASE_DIR/helpers/order.js" << 'EOF'
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();
const { ordersCollection } = require('../helpers/db');

/**
 * Generates the next sequential order number in SHC-XXXXX format using a Firestore transaction.
 * Starts at SHC-00000 and increments by 1 per order.
 * @returns {Promise<string>} The next unique, sequential order number (e.g., "SHC-00000", then "SHC-00001").
 */
async function generateNextOrderNumber() {
    const counterRef = db.collection("counters").doc("orders");

    try {
        const newOrderNumber = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);

            const currentNumber = counterDoc.exists ? counterDoc.data().currentNumber ?? 0 : 0;

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

function formatStatusForEmail(status) {
    if (status === "order_pending") return "Order Pending";
    if (status === "shipping_kit_requested") return "Shipping Kit Requested";
    return status
        .replace(/_/g, " ")
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

module.exports = { generateNextOrderNumber, formatStatusForEmail };
EOF

echo "Creating functions/helpers/pdf.js"
cat > "$BASE_DIR/helpers/pdf.js" << 'EOF'
const { PDFDocument, rgb } = require('pdf-lib');
const bwipjs = require('bwip-js');

/**
 * NEW: Helper function to generate a custom 4x6 PDF label with device details and a barcode.
 * @param {Object} order - The order document from Firestore.
 * @returns {Promise<Buffer>} The PDF document as a Buffer.
 */
async function generateCustomLabelPdf(order) {
    // Create a new PDF document (4x6 inches)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([432, 288]); // 4x6 inches in points (72 points per inch)
    const { width, height } = page.getSize();
    const fontSize = 12;

    // Title
    page.drawText('SecondHandCell', {
        x: 30,
        y: height - 40,
        size: 24,
        color: rgb(0, 0, 0),
    });

    // Customer and Order Info
    page.drawText(`Order ID: ${order.id}`, {
        x: 30,
        y: height - 70,
        size: 16,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Customer: ${order.shippingInfo.fullName}`, {
        x: 30,
        y: height - 90,
        size: fontSize,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Email: ${order.shippingInfo.email}`, {
        x: 30,
        y: height - 110,
        size: fontSize,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Device: ${order.device} - ${order.storage}`, {
        x: 30,
        y: height - 130,
        size: fontSize,
        color: rgb(0, 0, 0),
    });

    // Device Details (Answers)
    const deviceDetails = order.answers || {};
    let yOffset = height - 150;
    for (const [question, answer] of Object.entries(deviceDetails)) {
        // Format question nicely
        const formattedQuestion = question.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
        page.drawText(`${formattedQuestion}: ${answer}`, {
            x: 30,
            y: yOffset,
            size: fontSize,
            color: rgb(0, 0, 0),
        });
        yOffset -= 15;
        if (yOffset < 80) { // Add a new page if content overflows
            page = pdfDoc.addPage([432, 288]);
            yOffset = height - 40;
        }
    }

    // Barcode
    const barcodeData = order.id;
    const barcodeSvg = await new Promise((resolve, reject) => {
        bwipjs.toSVG({
            bcid: 'code128', // Barcode type
            text: barcodeData, // The text to encode
            scale: 3,
            height: 10,
            includetext: false,
            textxalign: 'center',
        }, (err, svg) => {
            if (err) {
                reject(err);
            } else {
                resolve(svg);
            }
        });
    });

    const barcodeImage = await pdfDoc.embedSvg(barcodeSvg);
    const barcodeDims = barcodeImage.scale(0.5);

    page.drawImage(barcodeImage, {
        x: (width - barcodeDims.width) / 2,
        y: 30,
        width: barcodeDims.width,
        height: barcodeDims.height,
    });

    return await pdfDoc.save();
}

module.exports = { generateCustomLabelPdf };
EOF

echo "Creating functions/helpers/security.js"
cat > "$BASE_DIR/helpers/security.js" << 'EOF'
const { getAuth } = require('firebase-admin/auth');
const auth = getAuth();
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();
const { adminsCollection } = require('../helpers/db');

// Authentication Middleware
const verifyFirebaseToken = async (req, res, next) => {
    // The /submit-order route is public, so we bypass the check for it.
    if (req.path === '/api/submit-order') {
        return next();
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
        return res.status(403).send('Unauthorized');
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        req.user = decodedToken;
        // Optional: Check if the user is an admin
        const adminDoc = await adminsCollection.doc(req.user.uid).get();
        if (!adminDoc.exists) {
            return res.status(403).send('Forbidden: User is not an admin.');
        }
        next();
    } catch (error) {
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).send('Unauthorized');
    }
};

module.exports = { verifyFirebaseToken };
EOF

echo "Creating functions/helpers/templates.js"
cat > "$BASE_DIR/helpers/templates.js" << 'EOF'
// --- Email HTML Templates ---
const SHIPPING_LABEL_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Label is Ready!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Label is Ready!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>You've chosen to receive a shipping label for order <strong class="order-id">#**ORDER_ID**</strong>. Here it is!</p><p>Your Tracking Number is: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><p>Please click the button below to download and print your label. Affix it to your package and drop it off at any USPS location.</p><div class="button-container"><a href="**LABEL_DOWNLOAD_LINK**" class="button">Download Your Shipping Label</a></div><p>We've also attached a custom label for your device. **Please print this label and place the sticker inside your package, on the bag that holds your device.** This helps us quickly identify your order when it arrives. It's very important to do this step correctly to avoid any delays.</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;

const SHIPPING_KIT_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Kit is on its Way!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Kit is on its Way!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for your order <strong class="order-id">#**ORDER_ID**</strong>! Your shipping kit is on its way to you.</p><p>You can track its progress with the following tracking number: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><p>Once your kit arrives, simply place your device inside and use the included return label to send it back to us.</p><p>We're excited to receive your device!</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;

const ORDER_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Order Has Been Received!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.content h2{color:#333333;font-size:20px;margin-top:24px;margin-bottom:8px}.order-id{color:#007bff;font-weight:bold}ul{list-style-type:disc;padding-left:20px;margin:0 0 16px}ul li{margin-bottom:8px}.important-note{background-color:#fff3cd;border-left:4px solid #ffc107;padding:16px;margin-top:24px;font-size:14px;color:#856404}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1>Your SecondHandCell Order #**ORDER_ID** Has Been Received!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for choosing SecondHandCell! We've successfully received your order request for your **DEVICE_NAME**.</p><p>Your Order ID is <strong class="order-id">#**ORDER_ID**</strong>.</p><h2>Next Steps: Preparing Your Device for Shipment</h2><p>Before you send us your device, it's crucial to prepare it correctly. Please follow these steps:</p><ul><li><strong>Backup Your Data:</strong> Ensure all important photos, contacts, and files are backed up to a cloud service or another device.</li><li><strong>Factory Reset:</strong> Perform a full factory reset on your device to erase all personal data. This is vital for your privacy and security.</li><li><strong>Remove Accounts:</strong> Sign out of all accounts (e.g., Apple ID/iCloud, Google Account, Samsung Account).<ul><li>For Apple devices, turn off "Find My iPhone" (FMI).</li><li>For Android devices, ensure Factory Reset Protection (FRP) is disabled.</li></ul></li><li><strong>Remove SIM Card:</strong> Take out any physical SIM cards from the device.</li><li><strong>Remove Accessories:</strong> Do not include cases, screen protectors, or chargers unless specifically instructed.</li></ul><div class="important-note"><p><strong>Important:</strong> We cannot process devices with <strong>Find My iPhone (FMI)</strong>, <strong>Factory Reset Protection (FRP)</strong>, <strong>stolen/lost status</strong>, <strong>outstanding balance due</strong>, or <strong>blacklisted IMEI</strong>. Please ensure your device meets these conditions to avoid delays or rejection.</p></div>**SHIPPING_INSTRUCTION**</div><div class="footer"><p>The SecondHandCell Team</p></div></div></body></html>`;

const DEVICE_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Device Has Arrived!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}.order-id{color:#007bff;font-weight:bold}</style></head><body><div class="email-container"><div class="header"><h1>Your Device Has Arrived!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>We've received your device for order <strong class="order-id">#**ORDER_ID**</strong>!</p><p>It's now in the queue for inspection. We'll be in touch soon with a final offer.</p></div><div class="footer"><p>Thank thank you for choosing SecondHandCell.</p></div></div></body></html>`;

const BLACKLISTED_EMAIL_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Important Notice Regarding Your Device - Order #**ORDER_ID**</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
      .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
      .header { background-color: #d9534f; color: #ffffff; padding: 24px; text-align: center; }
      .header h1 { font-size: 24px; margin: 0; }
      .content { padding: 24px; color: #555555; font-size: 16px; line-height: 1.6; }
      .content h2 { color: #d9534f; font-size: 20px; margin-top: 24px; margin-bottom: 8px; }
      .content p { margin: 0 0 16px; }
      .order-id { color: #d9534f; font-weight: bold; }
      .footer { padding: 24px; text-align: center; color: #999999; font-size: 14px; border-top: 1px solid #e0e0e0; }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Important Notice Regarding Your Device</h1>
      </div>
      <div class="content">
        <p>Hello **CUSTOMER_NAME**, </p>
        <p>This email is in reference to your device for order <strong class="order-id">#**ORDER_ID**</strong>.</p>
        <p>Upon verification, your device's IMEI has been flagged in the national database as **STATUS_REASON**.</p>
        <h2>Policy on Lost/Stolen Devices & Legal Compliance</h2>
        <p>SecondHandCell is committed to operating in full compliance with all applicable laws and regulations regarding the purchase and sale of secondhand goods, particularly those concerning lost or stolen property. This is a matter of legal and ethical compliance.</p>
        <p>Because the device is flagged, we cannot proceed with this transaction. Under New York law, we are required to report and hold any device suspected of being lost or stolen. The device cannot be returned to you. We must cooperate with law enforcement to ensure the device is handled in accordance with legal requirements.</p>
        <p>We advise you to contact your cellular carrier or the original owner of the device to resolve the status issue directly with them.</p>
        <p>For more details on the laws and our policy, please review the information below:</p>
        <p>**LEGAL_TEXT**</p>
      </div>
      <div class="footer">
        <p>The SecondHandCell Team</p>
      </div>
    </div>
  </body>
  </html>
`;

const FMI_EMAIL_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required for Order #**ORDER_ID**</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
      .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
      .header { background-color: #f0ad4e; color: #ffffff; padding: 24px; text-align: center; }
      .header h1 { font-size: 24px; margin: 0; }
      .content { padding: 24px; color: #555555; font-size: 16px; line-height: 1.6; }
      .content h2 { color: #f0ad4e; font-size: 20px; margin-top: 24px; margin-bottom: 8px; }
      .content p { margin: 0 0 16px; }
      .order-id { color: #f0ad4e; font-weight: bold; }
      .button-container { text-align: center; margin: 24px 0; }
      .button { display: inline-block; background-color: #f0ad4e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; }
      .footer { padding: 24px; text-align: center; color: #999999; font-size: 14px; border-top: 1px solid #e0e0e0; }
      .countdown-text { text-align: center; margin-top: 20px; font-size: 18px; font-weight: bold; color: #333333; }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Action Required for Your Order</h1>
      </div>
      <div class="content">
        <p>Hello **CUSTOMER_NAME**, </p>
        <p>This is a notification about your device for order <strong class="order-id">#**ORDER_ID**</strong>. We've detected that "Find My iPhone" (FMI) is still active on the device. **FMI must be turned off for us to complete your buyback transaction.**</p>
        <p>Please follow these steps to turn off FMI:</p>
        <ol>
          <li>Go to <a href="https://icloud.com/find" target="_blank">icloud.com/find</a> and sign in with your Apple ID.</li>
          <li>Click on "All Devices" at the top of the screen.</li>
          <li>Select the device you are sending to us.</li>
          <li>Click "Remove from Account".</li>
        </ol>
        <p>Once you have completed this step, please click the button below to let us know. You have **72 hours** to turn off FMI. If we don't receive confirmation within this period, your offer will be automatically reduced to the lowest possible price (as if the device were damaged).</p>
        <div class="button-container">
          <a href="**CONFIRM_URL**" class="button">Did it already? Click here.</a>
        </div>
        <div class="countdown-text">72-hour countdown has begun.</div>
        <p>If you have any questions, please reply to this email.</p>
      </div>
      <div class="footer">
        <p>The SecondHandCell Team</p>
      </div>
    </div>
  </body>
  </html>
`;

const BAL_DUE_EMAIL_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required for Order #**ORDER_ID**</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
      .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
      .header { background-color: #f0ad4e; color: #ffffff; padding: 24px; text-align: center; }
      .header h1 { font-size: 24px; margin: 0; }
      .content { padding: 24px; color: #555555; font-size: 16px; line-height: 1.6; }
      .content h2 { color: #f0ad4e; font-size: 20px; margin-top: 24px; margin-bottom: 8px; }
      .content p { margin: 0 0 16px; }
      .order-id { color: #f0ad4e; font-weight: bold; }
      .footer { padding: 24px; text-align: center; color: #999999; font-size: 14px; border-top: 1px solid #e0e0e0; }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Action Required for Your Order</h1>
      </div>
      <div class="content">
        <p>Hello **CUSTOMER_NAME**, </p>
        <p>This is a notification about your device for order <strong class="order-id">#**ORDER_ID**</strong>. We've detected that a **FINANCIAL_STATUS** is on the device with your carrier.</p>
        <p>To continue with your buyback, you must resolve this with your carrier. Please contact them directly to clear the outstanding balance.</p>
        <p>You have **72 hours** to clear the balance. If we don't receive an updated status from our system within this period, your offer will be automatically reduced to the lowest possible price (as if the device were damaged).</p>
        <p>If you have any questions, please reply to this email.</p>
      </div>
      <div class="footer">
        <p>The SecondHandCell Team</p>
      </div>
    </div>
  </body>
  </html>
`;

const DOWNGRADE_EMAIL_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Update on Your Order - Order #**ORDER_ID**</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#f0ad4e;color:#ffffff;padding:24px;text-align:center}.header h1{font-size:24px;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.order-id{color:#f0ad4e;font-weight:bold}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1>Update on Your Order</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>This is an automated notification regarding your order <strong class="order-id">#**ORDER_ID**</strong>. The 72-hour period to resolve the issue with your device has expired. As a result, your offer has been automatically adjusted to the damaged device price, which is <strong>$**NEW_PRICE**</strong>.</p><p>If you have any questions, please reply to this email.</p></div><div class="footer"><p>The SecondHandCell Team</p></div></div></body></html>`;

module.exports = {
    SHIPPING_LABEL_EMAIL_HTML,
    SHIPPING_KIT_EMAIL_HTML,
    ORDER_RECEIVED_EMAIL_HTML,
    DEVICE_RECEIVED_EMAIL_HTML,
    BLACKLISTED_EMAIL_HTML,
    FMI_EMAIL_HTML,
    BAL_DUE_EMAIL_HTML,
    DOWNGRADE_EMAIL_HTML
};
EOF

# --- Create package.json for dependencies ---
echo "Creating package.json..."
cat > "$BASE_DIR/package.json" << 'EOF'
{
  "name": "functions",
  "description": "Cloud Functions for your project",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "22"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "bwip-js": "^4.2.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "firebase-admin": "^12.1.0",
    "firebase-functions": "^5.0.1",
    "nodemailer": "^6.9.13",
    "pdf-lib": "^1.17.1",
    "streamifier": "^0.1.1",
    "@google-cloud/storage": "^7.11.0"
  },
  "devDependencies": {
    "firebase-functions-test": "^3.1.0"
  },
  "private": true
}
EOF

# --- Final message to the user ---
echo "All files have been created successfully in the 'functions' directory."
echo "Please navigate into the directory and install the dependencies:"
echo "cd functions"
echo "npm install"
echo ""
echo "Before deploying, ensure you have set your Firebase Functions environment variables:"
echo "firebase functions:config:set email.user=\"your-email@gmail.com\" email.pass=\"your-app-password\""
echo "firebase functions:config:set shipstation.key=\"YOUR_KEY\" shipstation.secret=\"YOUR_SECRET\" shipstation.webhook_secret=\"YOUR_WEBHOOK_SECRET\""
echo "firebase functions:config:set zendesk.url=\"https://your-domain.zendesk.com/api/v2\" zendesk.token=\"YOUR_BASE64_ZENDESK_TOKEN\""
echo "firebase functions:config:set app.frontend_url=\"https://your-frontend-app.web.app\""
echo ""
echo "Finally, you can deploy your functions with:"
echo "firebase deploy --only functions"
EOF
