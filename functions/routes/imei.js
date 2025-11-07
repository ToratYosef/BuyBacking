const express = require('express');
const router = express.Router();
const axios = require("axios");
const { ordersCollection, adminsCollection, updateOrderBoth } = require('../db/db');
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
                .replace(/\*\*STATUS_REASON\*\*/g, mockApiResponse.blacklistStatus);

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
