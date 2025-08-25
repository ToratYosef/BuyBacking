const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const ordersCollection = db.collection("orders");

const app = express();

// Configure CORS for all routes.
const allowedOrigins = [
    "https://toratyosef.github.io",
    "https://buyback-a0f05.web.app"
];

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"], // Explicitly allow Content-Type header
}));
app.use(express.json()); // Middleware to parse JSON request bodies

// Set up Nodemailer transporter using the Firebase Functions config
// IMPORTANT: Ensure you have configured these environment variables:
// firebase functions:config:set email.user="your_email@gmail.com" email.pass="your_app_password"
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: functions.config().email.user,
        pass: functions.config().email.pass
    }
});

// --- Email HTML Templates ---

const SHIPPING_LABEL_EMAIL_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your SwiftBuyBack Shipping Label is Ready!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        .header {
            background-color: #ffffff;
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #e0e0e0;
        }
        .header h1 {
            font-size: 24px;
            color: #333333;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .header img {
            width: 32px;
            height: 32px;
        }
        .content {
            padding: 24px;
            color: #555555;
            font-size: 16px;
            line-height: 1.6;
        }
        .content p {
            margin: 0 0 16px;
        }
        .content p strong {
            color: #333333;
        }
        .order-id {
            color: #007bff;
            font-weight: bold;
        }
        .tracking-number {
            color: #007bff;
            font-weight: bold;
        }
        .button-container {
            text-align: center;
            margin: 24px 0;
        }
        .button {
            display: inline-block;
            background-color: #4CAF50;
            color: #ffffff;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            font-size: 16px;
            -webkit-transition: background-color 0.3s ease;
            transition: background-color 0.3s ease;
        }
        .button:hover {
            background-color: #45a049;
        }
        .footer {
            padding: 24px;
            text-align: center;
            color: #999999;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>
                <img src="https://i.ibb.co/L519V1L/box-icon.png" alt="Box Icon">
                Your Shipping Label is Ready!
            </h1>
        </div>
        <div class="content">
            <p>Hello **CUSTOMER_NAME**,</p>
            <p>You've chosen to receive a shipping label for order <strong class="order-id">#**ORDER_ID**</strong>. Here it is!</p>
            <p>Your Tracking Number is: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p>
            <p>Please click the button below to download and print your label. Affix it to your package and drop it off at any USPS location.</p>
            <div class="button-container">
                <a href="**LABEL_DOWNLOAD_LINK**" class="button">Download Your Shipping Label</a>
            </div>
            <p style="text-align: center;">We're excited to receive your device!</p>
        </div>
        <div class="footer">
            <p>Thank you for choosing SwiftBuyBack.</p>
        </div>
    </div>
</body>
</html>
`;

const ORDER_RECEIVED_EMAIL_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your SwiftBuyBack Order Has Been Received!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        .header {
            background-color: #ffffff;
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #e0e0e0;
        }
        .header h1 {
            font-size: 24px;
            color: #333333;
            margin: 0;
        }
        .content {
            padding: 24px;
            color: #555555;
            font-size: 16px;
            line-height: 1.6;
        }
        .content p {
            margin: 0 0 16px;
        }
        .content h2 {
            color: #333333;
            font-size: 20px;
            margin-top: 24px;
            margin-bottom: 8px;
        }
        .order-id {
            color: #007bff;
            font-weight: bold;
        }
        ul {
            list-style-type: disc;
            padding-left: 20px;
            margin: 0 0 16px;
        }
        ul li {
            margin-bottom: 8px;
        }
        .important-note {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 16px;
            margin-top: 24px;
            font-size: 14px;
            color: #856404;
        }
        .footer {
            padding: 24px;
            text-align: center;
            color: #999999;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Your SwiftBuyBack Order #**ORDER_ID** Has Been Received!</h1>
        </div>
        <div class="content">
            <p>Hello **CUSTOMER_NAME**,</p>
            <p>Thank you for choosing SwiftBuyBack! We've successfully received your order request for your **DEVICE_NAME**.</p>
            <p>Your Order ID is <strong class="order-id">#**ORDER_ID**</strong>.</p>
            
            <h2>Next Steps: Preparing Your Device for Shipment</h2>
            <p>Before you send us your device, it's crucial to prepare it correctly. Once you receive your shipping label via email, please follow these steps:</p>
            <ul>
                <li><strong>Backup Your Data:</strong> Ensure all important photos, contacts, and files are backed up to a cloud service or another device.</li>
                <li><strong>Factory Reset:</strong> Perform a full factory reset on your device to erase all personal data. This is vital for your privacy and security.</li>
                <li><strong>Remove Accounts:</strong> Sign out of all accounts (e.g., Apple ID/iCloud, Google Account, Samsung Account).
                    <ul>
                        <li>For Apple devices, turn off "Find My iPhone" (FMI).</li>
                        <li>For Android devices, ensure Factory Reset Protection (FRP) is disabled.</li>
                    </ul>
                </li>
                <li><strong>Remove SIM Card:</strong> Take out any physical SIM cards from the device.</li>
                <li><strong>Remove Accessories:</strong> Do not include cases, screen protectors, or chargers unless specifically instructed.</li>
            </ul>

            <div class="important-note">
                <p><strong>Important:</strong> We cannot process devices with <strong>Find My iPhone (FMI)</strong>, <strong>Factory Reset Protection (FRP)</strong>, <strong>stolen/lost status</strong>, <strong>outstanding balance due</strong>, or <strong>blacklisted IMEI</strong>. Please ensure your device meets these conditions to avoid delays or rejection.</p>
            </div>

            <p style="margin-top: 24px;">We will send your shipping label shortly.</p>
            <p>If you have any questions, please reply to this email.</p>
        </div>
        <div class="footer">
            <p>The SwiftBuyBack Team</p>
        </div>
    </div>
</body>
</html>
`;

const DEVICE_RECEIVED_EMAIL_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Device Has Arrived!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        .header {
            background-color: #ffffff;
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #e0e0e0;
        }
        .header h1 {
            font-size: 24px;
            color: #333333;
            margin: 0;
        }
        .content {
            padding: 24px;
            color: #555555;
            font-size: 16px;
            line-height: 1.6;
        }
        .content p {
            margin: 0 0 16px;
        }
        .content p strong {
            color: #333333;
        }
        .footer {
            padding: 24px;
            text-align: center;
            color: #999999;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
        }
        .order-id {
            color: #007bff;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Your Device Has Arrived!</h1>
        </div>
        <div class="content">
            <p>Hello **CUSTOMER_NAME**,</p>
            <p>We've received your device for order <strong class="order-id">#**ORDER_ID**</strong>!</p>
            <p>It's now in the queue for inspection. We'll be in touch soon with a final offer.</p>
            <p>Thank you,</p>
            <p>The SwiftBuyBack Team</p>
        </div>
        <div class="footer">
            <p>Thank you for choosing SwiftBuyBack.</p>
        </div>
    </div>
</body>
</html>
`;


/**
 * Generates a unique five-digit order number in the XX-XXX format.
 * It retries if the generated number already exists as a document ID in the database to ensure uniqueness.
 * @returns {Promise<string>} A unique order number string (e.g., "12-345").
 */
async function generateUniqueFiveDigitOrderNumber() {
    let unique = false;
    let orderNumber;
    while (!unique) {
        // Generate a random 5-digit number between 10000 and 99999
        const num = Math.floor(10000 + Math.random() * 90000);
        // Format it as XX-XXX
        const firstPart = String(num).substring(0, 2);
        const secondPart = String(num).substring(2, 5);
        orderNumber = `${firstPart}-${secondPart}`;

        // Check if an order with this custom ID already exists as a document ID
        const docRef = ordersCollection.doc(orderNumber);
        const doc = await docRef.get();
        if (!doc.exists) {
            unique = true; // Found a unique number
        }
    }
    return orderNumber;
}

/**
 * Sends a Zendesk comment (public or private) for a given order.
 * If the ticket already exists, it adds a comment. If not, it creates a new ticket.
 * @param {object} orderData - The order data object.
 * @param {string} subject - The subject for the Zendesk ticket (used for new tickets).
 * @param {string} html_body - The HTML content of the comment.
 * @param {boolean} isPublic - Whether the comment should be public (visible to the user) or private.
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
                headers: { 'Authorization': `Basic ${zendeskToken}` }
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
                        public: isPublic
                    }
                }
            };
            await axios.put(
                `${zendeskUrl}/tickets/${ticketId}.json`,
                payload,
                {
                    headers: {
                        'Authorization': `Basic ${zendeskToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`Zendesk comment added to existing ticket ${ticketId}.`);
        } else {
            // Create a new ticket
            payload = {
                ticket: {
                    subject: subject,
                    comment: {
                        html_body: html_body,
                        public: isPublic
                    },
                    requester: { name: orderData.shippingInfo.fullName, email: orderData.shippingInfo.email },
                    tags: [`order_${orderData.id}`],
                    priority: 'normal'
                }
            };
            await axios.post(
                `${zendeskUrl}/tickets.json`,
                payload,
                {
                    headers: {
                        'Authorization': `Basic ${zendeskToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log('New Zendesk ticket created.');
        }

    } catch (err) {
        console.error('Failed to send Zendesk notification:', err.response?.data || err.message);
    }
}

// ------------------------------
// ROUTES
// ------------------------------

// Get all orders
// Frontend should call: GET https://<cloud-function-url>/api/orders
app.get("/orders", async (req, res) => {
    try {
        const snapshot = await ordersCollection.get();
        // Map doc.id (which is now the XX-XXX order ID) and data
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(orders);
    } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// Get a single order by its five-digit order ID (XX-XXX format)
// Frontend should call: GET https://<cloud-function-url>/api/orders/:id (where :id is the XX-XXX format)
app.get("/orders/:id", async (req, res) => {
    try {
        const docRef = ordersCollection.doc(req.params.id); // req.params.id is now the XX-XXX order ID
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

// Submit a new order
// Frontend should call: POST https://<cloud-function-url>/api/submit-order
app.post("/submit-order", async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData?.shippingInfo || !orderData?.estimatedQuote) {
            return res.status(400).json({ error: "Invalid order data" });
        }

        // Generate a unique five-digit order number, which will be the document ID
        const orderId = await generateUniqueFiveDigitOrderNumber();

        // Use .set() with the generated orderId to create the document with that specific ID
        // The userId will be stored if present in the request body
        await ordersCollection.doc(orderId).set({
            ...orderData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "pending_shipment",
            // userId will be stored if it exists in orderData (from frontend)
            // If userId is null or undefined, it won't be explicitly added, which is fine.
        });

        // Customer-Facing Email: Order Received
        const customerEmailHtml = ORDER_RECEIVED_EMAIL_HTML
            .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
            .replace(/\*\*ORDER_ID\*\*/g, orderId)
            .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`); // Assuming device and storage are in orderData

        const customerMailOptions = {
            from: functions.config().email.user,
            to: orderData.shippingInfo.email, // Use the email from shippingInfo
            subject: `Your SwiftBuyBack Order #${orderId} Has Been Received!`,
            html: customerEmailHtml
        };

        // Internal Admin Notification: New Order Placed
        const internalSubject = `New Order Placed: #${orderId}`;
        const internalHtmlBody = `
            <p>A new order has been placed by <strong>${orderData.shippingInfo.fullName}</strong> (Email: ${orderData.shippingInfo.email}).</p>
            <p>Order ID: <strong>${orderId}</strong></p>
            <p>Estimated Quote: <strong>$${orderData.estimatedQuote.toFixed(2)}</strong></p>
            ${orderData.userId ? `<p>Associated User ID: <strong>${orderData.userId}</strong></p>` : '<p>Not associated with a logged-in user.</p>'}
            <p>Please generate and send the shipping label from the admin dashboard.</p>
        `;

        await Promise.all([
            transporter.sendMail(customerMailOptions),
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false) // isPublic: false for internal comment
        ]);

        console.log('Order received email and internal notification sent successfully.');

        // Return the new document ID (which is the XX-XXX format)
        res.status(201).json({ message: "Order submitted", orderId: orderId });
    } catch (err) {
        console.error("Error submitting order:", err);
        res.status(500).json({ error: "Failed to submit order" });
    }
});

/**
 * Helper function to create a shipping label using ShipEngine API.
 * This function can now be used for both initial labels (buyer to SwiftBuyBack)
 * and return labels (SwiftBuyBack to buyer) by setting the isReturnLabel flag.
 *
 * @param {object} order - The order data. The 'id' property now contains the XX-XXX order ID.
 * @param {boolean} [isReturnLabel=false] - If true, generates a return label (from SwiftBuyBack to buyer).
 * @returns {Promise<object>} The label data from ShipEngine.
 */
async function createShipStationLabel(order, isReturnLabel = false) {
    const isSandbox = true;
    const buyerShippingInfo = order.shippingInfo;

    // Define SwiftBuyBack's fixed address for consistent use
    const swiftBuyBackAddress = {
        name: "SwiftBuyBack Returns",
        company_name: "SwiftBuyBack",
        phone: "555-555-5555", // Placeholder phone number
        address_line1: "1795 West 3rd St",
        city_locality: "Brooklyn",
        state_province: "NY",
        postal_code: "11223",
        country_code: "US"
    };

    // Construct the buyer's address from order data
    const buyerAddress = {
        name: buyerShippingInfo.fullName,
        phone: "555-555-5555", // Placeholder phone number, consider using actual buyer phone if available
        address_line1: buyerShippingInfo.streetAddress,
        city_locality: buyerShippingInfo.city,
        state_province: buyerShippingInfo.state,
        postal_code: buyerShippingInfo.zipCode,
        country_code: "US"
    };

    let shipFromAddress;
    let shipToAddress;

    if (isReturnLabel) {
        // For a return label, the shipment is FROM SwiftBuyBack TO the buyer
        shipFromAddress = swiftBuyBackAddress;
        shipToAddress = buyerAddress;
    } else {
        // For the initial label, the shipment is FROM the buyer TO SwiftBuyBack
        shipFromAddress = buyerAddress;
        shipToAddress = swiftBuyBackAddress;
    }

    // Use the document ID (which is now the XX-XXX order ID) for tracking on the label
    const orderIdForLabel = order.id || 'N/A';

    const payload = {
        shipment: {
            service_code: "usps_priority_mail", // Or adjust as needed for returns
            ship_to: shipToAddress,
            ship_from: shipFromAddress,
            packages: [{
                weight: { value: 1, unit: "ounce" }, // Default weight, adjust if needed
                // Add the order ID to the label messages for easier tracking.
                // This will typically appear as a reference number on the physical label.
                label_messages: {
                    reference1: `OrderRef: ${orderIdForLabel}`
                }
            }]
        }
    };
    if (isSandbox) payload.testLabel = true; // Use test label for sandbox environment

    // IMPORTANT: Ensure you have configured this environment variable:
    // firebase functions:config:set shipengine.key="YOUR_SHIPENGINE_API_KEY"
    const shipEngineApiKey = functions.config().shipengine.key;
    if (!shipEngineApiKey) {
        throw new Error("ShipEngine API key not configured. Please set 'shipengine.key' environment variable.");
    }

    const response = await axios.post(
        "https://api.shipengine.com/v1/labels",
        payload, {
            headers: {
                "API-Key": shipEngineApiKey, // Using config object for ShipEngine API key
                "Content-Type": "application/json"
            }
        }
    );
    return response.data;
}

// Generate initial shipping label and send email to buyer
// Frontend should call: POST https://<cloud-function-url>/api/generate-label/:id
app.post("/generate-label/:id", async (req, res) => {
    try {
        const doc = await ordersCollection.doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });

        const order = { id: doc.id, ...doc.data() };
        // Generate the initial label (buyer to SwiftBuyBack)
        const labelData = await createShipStationLabel(order, false); // Explicitly false for initial label

        const trackingNumber = labelData.tracking_number;

        await ordersCollection.doc(req.params.id).update({
            status: "label_generated",
            uspsLabelUrl: labelData.label_download?.pdf,
            trackingNumber: trackingNumber
        });

        // Customer-Facing Email: Shipping Label Sent
        const customerEmailHtml = SHIPPING_LABEL_EMAIL_HTML
            .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
            .replace(/\*\*ORDER_ID\*\*/g, order.id)
            .replace(/\*\*TRACKING_NUMBER\*\*/g, trackingNumber || 'N/A')
            .replace(/\*\*LABEL_DOWNLOAD_LINK\*\*/g, labelData.label_download?.pdf);

        const customerMailOptions = {
            from: functions.config().email.user,
            to: order.shippingInfo.email, // Use the email from shippingInfo
            subject: `Your SwiftBuyBack Shipping Label for Order #${order.id}`,
            html: customerEmailHtml
        };

        // Internal Admin Notification: Shipping Label Generated & Emailed
        const internalSubject = `Shipping Label Generated for Order #${order.id}`;
        const internalHtmlBody = `
            <p>The shipping label for Order <strong>#${order.id}</strong> has been successfully generated and sent to the customer.</p>
            <p>Tracking Number: <strong>${trackingNumber || 'N/A'}</strong></p>
        `;

        await Promise.all([
            transporter.sendMail(customerMailOptions),
            sendZendeskComment(order, internalSubject, internalHtmlBody, false) // isPublic: false
        ]);

        console.log('Shipping label email and internal notification sent successfully.');

        res.json({
            message: "Label generated",
            uspsLabelUrl: labelData.label_download?.pdf,
            trackingNumber: trackingNumber,
            orderId: order.id // The orderId is now the XX-XXX custom ID
        });
    } catch (err) {
        console.error("Error generating label:", err.response?.data || err);
        res.status(500).json({ error: "Failed to generate label" });
    }
});

// Update order status
// Frontend should call: PUT https://<cloud-function-url>/api/orders/:id/status
app.put("/orders/:id/status", async (req, res) => {
    try {
        const { status } = req.body;
        const orderId = req.params.id;
        if (!status) return res.status(400).json({ error: "Status is required" });

        const docRef = ordersCollection.doc(orderId);
        await docRef.update({ status });

        // Get updated order data for notifications
        const doc = await docRef.get();
        const order = { id: doc.id, ...doc.data() };

        let customerNotificationPromise;
        let internalNotificationPromise;
        let internalSubject;
        let internalHtmlBody;

        switch (status) {
            case "received":
                // Customer-Facing Email: Device Received
                const deviceReceivedHtml = DEVICE_RECEIVED_EMAIL_HTML
                    .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
                    .replace(/\*\*ORDER_ID\*\*/g, order.id);

                customerNotificationPromise = transporter.sendMail({
                    from: functions.config().email.user,
                    to: order.shippingInfo.email, // Use the email from shippingInfo
                    subject: 'Your SwiftBuyBack Device Has Arrived',
                    html: deviceReceivedHtml
                });
                // Internal Admin Notification: Device Received
                internalSubject = `Device Received for Order #${order.id}`;
                internalHtmlBody = `
                    <p>The device for Order <strong>#${order.id}</strong> has been received.</p>
                    <p>It is now awaiting inspection.</p>
                `;
                internalNotificationPromise = sendZendeskComment(order, internalSubject, internalHtmlBody, false); // isPublic: false
                break;
            case "completed":
                // Customer-Facing Email: Order Completed
                customerNotificationPromise = transporter.sendMail({
                    from: functions.config().email.user,
                    to: order.shippingInfo.email, // Use the email from shippingInfo
                    subject: 'Your SwiftBuyBack Order is Complete',
                    html: `
                        <p>Hello ${order.shippingInfo.fullName},</p>
                        <p>Great news! Your order <strong>#${order.id}</strong> has been completed and payment has been processed.</p>
                        <p>If you have any questions about your payment, please let us know.</p>
                        <p>Thank you for choosing SwiftBuyBack!</p>
                    `
                });
                // Internal Admin Notification: Order Completed
                internalSubject = `Order Completed: #${order.id}`;
                internalHtmlBody = `
                    <p>Order <strong>#${order.id}</strong> has been marked as completed.</p>
                    <p>Payment has been processed for this order.</p>
                `;
                internalNotificationPromise = sendZendeskComment(order, internalSubject, internalHtmlBody, false); // isPublic: false
                break;
            default:
                customerNotificationPromise = Promise.resolve();
                internalNotificationPromise = Promise.resolve();
        }

        await Promise.all([customerNotificationPromise, internalNotificationPromise]);
        console.log(`Status update notifications sent for order ${orderId}.`);

        res.json({ message: `Order marked as ${status}` });
    } catch (err) {
        console.error("Error updating status:", err);
        res.status(500).json({ error: "Failed to update status" });
    }
});

// Submit a re-offer (Updated to send email to customer via Zendesk)
// Frontend should call: POST https://<cloud-function-url>/api/orders/:id/re-offer
app.post("/orders/:id/re-offer", async (req, res) => {
    try {
        const { newPrice, reasons, comments } = req.body;
        const orderId = req.params.id; // This is now the XX-XXX document ID

        if (!newPrice || !reasons || !Array.isArray(reasons) || reasons.length === 0) {
            return res.status(400).json({ error: "New price and at least one reason are required" });
        }
        const orderRef = ordersCollection.doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }
        const order = { id: orderDoc.id, ...orderDoc.data() }; // Include id in order object for consistency
        await orderRef.update({
            reOffer: {
                newPrice,
                reasons,
                comments,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                // Set auto-acceptance date 7 days from now
                autoAcceptDate: admin.firestore.Timestamp.fromMillis(Date.now() + (7 * 24 * 60 * 60 * 1000))
            },
            status: "re-offered-pending"
        });

        // Customer-Facing Notification: Re-offer Sent (via Zendesk Public Comment)
        let reasonString = reasons.join(', ');
        if (comments) {
            reasonString += `; ${comments}`;
        }
        const zendeskHtmlContent = `
         <div style="font-family: 'system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Oxygen-Sans','Ubuntu','Cantarell','Helvetica Neue','Arial','sans-serif'; font-size: 14px; line-height: 1.5; color: #444444;">
           <h2 style="color: #0056b3; font-weight: bold; text-transform: none; font-size: 20px; line-height: 26px; margin: 5px 0 10px;">Hello ${order.shippingInfo.fullName},</h2>
           <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">We've received your device for Order #${order.id} and after inspection, we have a revised offer for you.</p>
           <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;"><strong>Original Quote:</strong> $${order.estimatedQuote.toFixed(2)}</p>
           <p style="font-size: 1.2em; color: #d9534f; font-weight: bold; line-height: 22px; margin: 15px 0;">
             <strong>New Offer Price:</strong> $${newPrice.toFixed(2)}
           </p>
           <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;"><strong>Reason for New Offer:</strong></p>
           <p style="background-color: #f8f8f8; border-left-width: 5px; border-left-color: #d9534f; border-left-style: solid; color: #2b2e2f; line-height: 22px; margin: 15px 0; padding: 10px;">
             <em>"${reasonString}"</em>
           </p>
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
                             Accept Offer ($${newPrice.toFixed(2)})
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
           <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">Thank you,<br>The SwiftBuyBack Team</p>
         </div>
         `;
        const zendeskSubject = `Re-offer for Order #${order.id}`;

        await sendZendeskComment(order, zendeskSubject, zendeskHtmlContent, true); // isPublic: true

        res.json({ message: "Re-offer submitted successfully", newPrice, orderId: order.id });
    } catch (err) {
        console.error("Error submitting re-offer:", err);
        res.status(500).json({ error: "Failed to submit re-offer" });
    }
});

// Generate return shipping label and send email to buyer
// Frontend should call: POST https://<cloud-function-url>/api/orders/:id/return-label
app.post("/orders/:id/return-label", async (req, res) => {
    try {
        const doc = await ordersCollection.doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });
        const order = { id: doc.id, ...doc.data() };

        // Generate the return label (SwiftBuyBack to buyer)
        const returnLabelData = await createShipStationLabel(order, true); // Pass true for a return label

        const returnTrackingNumber = returnLabelData.tracking_number;

        await ordersCollection.doc(req.params.id).update({
            status: "return-label-generated",
            returnLabelUrl: returnLabelData.label_download?.pdf,
            returnTrackingNumber: returnTrackingNumber
        });

        // Customer-Facing Email: Return Label Sent
        const customerMailOptions = {
            from: functions.config().email.user,
            to: order.shippingInfo.email, // Use the email from shippingInfo
            subject: 'Your SwiftBuyBack Return Label',
            html: `
                <p>Hello ${order.shippingInfo.fullName},</p>
                <p>As requested, here is your return shipping label for your device (Order ID: ${order.id}):</p>
                <p>Return Tracking Number: <strong>${returnTrackingNumber || 'N/A'}</strong></p>
                <a href="${returnLabelData.label_download?.pdf}">Download Return Label</a>
                <p>Thank you,</p>
                <p>The SwiftBuyBack Team</p>
            `
        };

        // Internal Admin Notification: Return Label Sent
        const internalSubject = `Return Label Sent for Order #${order.id}`;
        const internalHtmlBody = `
            <p>A return label for Order <strong>#${order.id}</strong> has been generated and sent to the customer.</p>
            <p>Return Tracking Number: <strong>${returnTrackingNumber || 'N/A'}</strong></p>
        `;

        await Promise.all([
            transporter.sendMail(customerMailOptions),
            sendZendeskComment(order, internalSubject, internalHtmlBody, false) // isPublic: false
        ]);

        res.json({
            message: "Return label generated successfully.",
            returnLabelUrl: returnLabelData.label_download?.pdf,
            returnTrackingNumber: returnTrackingNumber,
            orderId: order.id // The orderId is now the XX-XXX custom ID
        });
    } catch (err) {
        console.error("Error generating return label:", err.response?.data || err);
        res.status(500).json({ error: "Failed to generate return label" });
    }
});

// New endpoint to handle offer acceptance
// Frontend should call: POST https://<cloud-function-url>/api/accept-offer-action
app.post("/accept-offer-action", async (req, res) => {
    try {
        const { orderId } = req.body; // This is the XX-XXX document ID
        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        const docRef = ordersCollection.doc(orderId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }

        const orderData = { id: doc.id, ...doc.data() }; // Include id in orderData for consistency
        if (orderData.status !== "re-offered-pending") {
            return res.status(409).json({ error: "This offer has already been accepted or declined." });
        }

        await docRef.update({
            status: "re-offered-accepted",
            acceptedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Customer-Facing Notification: Offer Accepted (via Zendesk Public Comment)
        const customerHtmlBody = `
             <p>Thank you for accepting the revised offer for Order <strong>#${orderData.id}</strong>.</p>
             <p>We've received your confirmation, and payment processing will now begin.</p>
         `;

        // Internal Admin Notification: Offer Accepted (via Zendesk Private Comment)
        const internalSubject = `Re-offer Accepted for Order #${orderData.id}`;
        const internalHtmlBody = `
            <p>The customer has <strong>accepted</strong> the revised offer of <strong>$${orderData.reOffer.newPrice.toFixed(2)}</strong> for Order #${orderData.id}.</p>
            <p>Please proceed with payment processing.</p>
        `;

        await Promise.all([
            sendZendeskComment(orderData, `Offer Accepted for Order #${orderData.id}`, customerHtmlBody, true), // isPublic: true
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false) // isPublic: false
        ]);

        res.json({ message: "Offer accepted successfully.", orderId: orderData.id });
    } catch (err) {
        console.error("Error accepting offer:", err);
        res.status(500).json({ error: "Failed to accept offer" });
    }
});

// New endpoint to handle return requests
// Frontend should call: POST https://<cloud-function-url>/api/return-phone-action
app.post("/return-phone-action", async (req, res) => {
    try {
        const { orderId } = req.body; // This is the XX-XXX document ID
        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        const docRef = ordersCollection.doc(orderId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }

        const orderData = { id: doc.id, ...doc.data() }; // Include id in orderData for consistency
        if (orderData.status !== "re-offered-pending") {
            return res.status(409).json({ error: "This offer has already been accepted or declined." });
        }

        // Renamed status to 're-offered-declined'
        await docRef.update({
            status: "re-offered-declined",
            declinedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Customer-Facing Notification: Return Requested (via Zendesk Public Comment)
        const customerHtmlBody = `
            <p>We have received your request to decline the revised offer and have your device returned. We are now processing your request and will send a return shipping label to your email shortly.</p>
        `;

        // Internal Admin Notification: Return Requested (via Zendesk Private Comment)
        const internalSubject = `Return Requested for Order #${orderData.id}`;
        const internalHtmlBody = `
            <p>The customer has <strong>declined</strong> the revised offer for Order #${orderData.id} and has requested that their phone be returned.</p>
            <p>Please initiate the return process and send a return shipping label.</p>
        `;

        await Promise.all([
            sendZendeskComment(orderData, `Return Requested for Order #${orderData.id}`, customerHtmlBody, true), // isPublic: true
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false) // isPublic: false
        ]);

        res.json({ message: "Return requested successfully.", orderId: orderData.id });
    } catch (err) {
        console.error("Error requesting return:", err);
        res.status(500).json({ error: "Failed to request return" });
    }
});

// New Cloud Function to run every 24 hours to check for expired offers
exports.autoAcceptOffers = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredOffers = await ordersCollection
        .where('status', '==', 're-offered-pending')
        .where('reOffer.autoAcceptDate', '<=', now)
        .get();

    const updates = expiredOffers.docs.map(async doc => { // Added async here
        const orderRef = ordersCollection.doc(doc.id);
        const orderData = { id: doc.id, ...doc.data() }; // Include id in orderData for consistency

        // Customer-Facing Notification: Offer Auto-Accepted (via Zendesk Public Comment)
        const customerHtmlBody = `
            <p>Hello ${orderData.shippingInfo.fullName},</p>
            <p>As we have not heard back from you regarding your revised offer, it has been automatically accepted as per our terms and conditions.</p>
            <p>Payment processing for the revised amount of <strong>$${orderData.reOffer.newPrice.toFixed(2)}</strong> will now begin.</p>
            <p>Thank you,</p>
            <p>The SwiftBuyBack Team</p>
        `;

        // Internal Admin Notification: Offer Auto-Accepted (via Zendesk Private Comment)
        const internalSubject = `Order #${orderData.id} Auto-Accepted`;
        const internalHtmlBody = `
            <p>The revised offer of <strong>$${orderData.reOffer.newPrice.toFixed(2)}</strong> for Order #${orderData.id} has been <strong>auto-accepted</strong> due to no response from the customer within the 7-day period.</p>
            <p>Please proceed with payment processing.</p>
        `;

        await Promise.all([
            sendZendeskComment(orderData, `Revised Offer Auto-Accepted for Order #${orderData.id}`, customerHtmlBody, true), // isPublic: true
            sendZendeskComment(orderData, internalSubject, internalHtmlBody, false) // isPublic: false
        ]);

        console.log(`Auto-accepting expired offer for order ID: ${orderData.id}`);
        return orderRef.update({
            status: 're-offered-auto-accepted',
            acceptedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    await Promise.all(updates);
    console.log(`Auto-accepted ${updates.length} expired offers.`);
    return null;
});

// Expose the Express app as a single Cloud Function
exports.api = functions.https.onRequest(app);
