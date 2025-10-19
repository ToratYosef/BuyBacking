const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const admin = require("firebase-admin");
const axios = require('axios');
const functions = require('firebase-functions');

// Corrected import from the helpers module
const {
    ordersCollection,
    usersCollection,
    adminsCollection,
    writeOrderBoth,
    updateOrderBoth
} = require('../db/db');
const { sendAdminPushNotification, addAdminFirestoreNotification, sendEmail } = require('../services/notifications');
const { sendZendeskComment } = require('../services/zendesk');
const { generateNextOrderNumber, formatStatusForEmail } = require('../helpers/order');
const { ORDER_RECEIVED_EMAIL_HTML, DEVICE_RECEIVED_EMAIL_HTML } = require('../helpers/templates');
const { DEFAULT_CARRIER_CODE, buildKitTrackingUpdate } = require('../helpers/shipengine');

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
            newOrderStatus = "kit_needs_printing";
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

router.post("/orders/:id/mark-kit-printed", async (req, res) => {
    try {
        const docRef = ordersCollection.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = doc.data();
        if (order.shippingPreference !== "Shipping Kit Requested") {
            return res.status(400).json({ error: "Order does not require a shipping kit" });
        }

        await updateOrderBoth(req.params.id, {
            status: "kit_sent",
            kitPrintedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ message: "Order marked as kit sent after printing." });
    } catch (err) {
        console.error("Error marking kit as printed:", err);
        res.status(500).json({ error: "Failed to update kit status" });
    }
});

router.post("/orders/:id/refresh-kit-tracking", async (req, res) => {
    try {
        const docRef = ordersCollection.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = doc.data();
        if (!order.outboundTrackingNumber) {
            return res.status(400).json({ error: "Outbound tracking number not available for this order" });
        }

        const shipengineKey = functions.config().shipengine?.key || process.env.SHIPENGINE_KEY;
        if (!shipengineKey) {
            return res.status(500).json({ error: "ShipEngine API key not configured" });
        }

        const { updatePayload, delivered } = await buildKitTrackingUpdate(order, {
            axiosClient: axios,
            shipengineKey,
            defaultCarrierCode: DEFAULT_CARRIER_CODE,
            serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
        });

        await updateOrderBoth(req.params.id, updatePayload);

        res.json({
            message: delivered ? "Kit marked as delivered." : "Kit tracking status refreshed.",
            delivered,
            tracking: updatePayload.kitTrackingStatus,
        });
    } catch (err) {
        console.error("Error refreshing kit tracking:", err.response?.data || err);
        const errorMessage = err.response?.data?.error || err.message || "Failed to refresh kit tracking";
        const statusCode =
            errorMessage === 'Outbound tracking number not available for this order'
                ? 400
                : errorMessage === 'ShipEngine API key not configured'
                    ? 500
                    : 500;
        res.status(statusCode).json({ error: errorMessage });
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
module.exports.buildKitTrackingUpdate = buildKitTrackingUpdate;
