const functions = require("firebase-functions/v1");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const nodemailer = require("nodemailer");
const { URLSearchParams } = require('url');

// Initialize Firebase Admin SDK
admin.initializeApp();
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

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- EMAIL HTML Templates (unchanged from your version) ---
const SHIPPING_LABEL_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Label is Ready!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Label is Ready!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>You've chosen to receive a shipping label for order <strong class="order-id">#**ORDER_ID**</strong>. Here it is!</p><p>Your Tracking Number is: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><div class="button-container"><a href="**LABEL_DOWNLOAD_LINK**" class="button">Download Your Shipping Label</a></div><p style="text-align:center;">We're excited to receive your device!</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;
const SHIPPING_KIT_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Shipping Kit is on its Way!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0;display:flex;align-items:center;justify-content:center;gap:10px}.header img{width:32px;height:32px}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.order-id{color:#007bff;font-weight:bold}.tracking-number{color:#007bff;font-weight:bold}.button-container{text-align:center;margin:24px 0}.button{display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px;-webkit-transition:background-color .3s ease;transition:background-color .3s ease}.button:hover{background-color:#45a049}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1><img src="https://fonts.gstatic.com/s/e/notoemoji/16.0/1f4e6/72.png" alt="Box Icon">Your Shipping Kit is on its Way!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for your order <strong class="order-id">#**ORDER_ID**</strong>! Your shipping kit is on its way to you.</p><p>You can track its progress with the following tracking number: <strong class="tracking-number">**TRACKING_NUMBER**</strong></p><p>Once your kit arrives, simply place your device inside and use the included return label to send it back to us.</p><p>We're excited to receive your device!</p></div><div class="footer"><p>Thank you for choosing SecondHandCell.</p></div></div></body></html>`;
const ORDER_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SecondHandCell Order Has Been Received!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content h2{color:#333333;font-size:20px;margin-top:24px;margin-bottom:8px}.order-id{color:#007bff;font-weight:bold}ul{list-style-type:disc;padding-left:20px;margin:0 0 16px}ul li{margin-bottom:8px}.important-note{background-color:#fff3cd;border-left:4px solid #ffc107;padding:16px;margin-top:24px;font-size:14px;color:#856404}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}</style></head><body><div class="email-container"><div class="header"><h1>Your SecondHandCell Order #**ORDER_ID** Has Been Received!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>Thank you for choosing SecondHandCell! We've successfully received your order request for your **DEVICE_NAME**.</p><p>Your Order ID is <strong class="order-id">#**ORDER_ID**</strong>.</p><h2>Next Steps: Preparing Your Device for Shipment</h2><p>Before you send us your device, it's crucial to prepare it correctly. Please follow these steps:</p><ul><li><strong>Backup Your Data:</strong> Ensure all important photos, contacts, and files are backed up to a cloud service or another device.</li><li><strong>Factory Reset:</strong> Perform a full factory reset on your device to erase all personal data. This is vital for your privacy and security.</li><li><strong>Remove Accounts:</strong> Sign out of all accounts (e.g., Apple ID/iCloud, Google Account, Samsung Account).<ul><li>For Apple devices, turn off "Find My iPhone" (FMI).</li><li>For Android devices, ensure Factory Reset Protection (FRP) is disabled.</li></ul></li><li><strong>Remove SIM Card:</strong> Take out any physical SIM cards from the device.</li><li><strong>Remove Accessories:</strong> Do not include cases, screen protectors, or chargers unless specifically instructed.</li></ul><div class="important-note"><p><strong>Important:</strong> We cannot process devices with <strong>Find My iPhone (FMI)</strong>, <strong>Factory Reset Protection (FRP)</strong>, <strong>stolen/lost status</strong>, <strong>outstanding balance due</strong>, or <strong>blacklisted IMEI</strong>. Please ensure your device meets these conditions to avoid delays or rejection.</p></div>**SHIPPING_INSTRUCTION**</div><div class="footer"><p>The SecondHandCell Team</p></div></div></body></html>`;
const DEVICE_RECEIVED_EMAIL_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Device Has Arrived!</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background-color:#f4f4f4;margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}.email-container{max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);overflow:hidden;border:1px solid #e0e0e0}.header{background-color:#ffffff;padding:24px;text-align:center;border-bottom:1px solid #e0e0e0}.header h1{font-size:24px;color:#333333;margin:0}.content{padding:24px;color:#555555;font-size:16px;line-height:1.6}.content p{margin:0 0 16px}.content p strong{color:#333333}.footer{padding:24px;text-align:center;color:#999999;font-size:14px;border-top:1px solid #e0e0e0}.order-id{color:#007bff;font-weight:bold}</style></head><body><div class="email-container"><div class="header"><h1>Your Device Has Arrived!</h1></div><div class="content"><p>Hello **CUSTOMER_NAME**,</p><p>We've received your device for order <strong class="order-id">#**ORDER_ID**</strong>!</p><p>It's now in the queue for inspection. We'll be in touch soon with a final offer.</p></div><div class="footer"><p>Thank thank you for choosing SecondHandCell.</p></div></div></body></html>`;
const ORDER_PLACED_ADMIN_EMAIL_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
      }
      .email-container {
        max-width: 600px;
        margin: 20px auto;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,.1);
        overflow: hidden;
      }
      .header {
        background-color: #4CAF50;
        color: #ffffff;
        padding: 24px;
        text-align: center;
      }
      .header h1 {
        font-size: 28px;
        margin: 0;
      }
      .content {
        padding: 24px;
        color: #555555;
        font-size: 16px;
        line-height: 1.6;
      }
      .content h2 {
        color: #333333;
        font-size: 20px;
        margin-top: 24px;
        margin-bottom: 8px;
      }
      .order-details p {
        margin: 8px 0;
      }
      .button-container {
        text-align: center;
        margin: 24px 0;
      }
      .button {
        display: inline-block;
        background-color: #007bff;
        color: #ffffff;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 5px;
        font-weight: bold;
        font-size: 16px;
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
        <h1>New Order Received! 🥳</h1>
      </div>
      <div class="content">
        <h2>Order Details </h2>
        <div class="order-details">
          <p><strong>Customer:</strong> **CUSTOMER_NAME**</p>
          <p><strong>Order ID:</strong> **ORDER_ID**</p>
          <p><strong>Device:</strong> **DEVICE_NAME**</p>
          <p><strong>Estimated Quote:</strong> $**ESTIMATED_QUOTE**</p>
          <p><strong>Shipping Preference:</strong> **SHIPPING_PREFERENCE**</p>
        </div>
        <div class="button-container">
          <a href="https://secondhandcell.com/admin" class="button">Fulfill Order Now</a>
        </div>
        <p>This is an automated notification from SecondHandCell.</p>
      </div>
      <div class="footer">
        <p>The SecondHandCell Team</p>
      </div>
    </div>
  </body>
  </html>
`;
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
        <br>
        
      </div>
      <div class="content">
        <p>Hello **CUSTOMER_NAME**, </p>
        <p>This email is in reference to your device for order <strong class="order-id">#**ORDER_ID**</strong>.</p>
        <p>Upon verification, your device's IMEI has been flagged in the national database as **STATUS_REASON**.</p>
        <h2>Policy on Lost/Stolen Devices & Legal Compliance</h2>
        <p>SecondHandCell is committed to operating in full compliance with all applicable laws and regulations regarding the purchase and sale of secondhand goods, particularly those concerning lost or stolen property. This is a matter of legal and ethical compliance.</p>
        <p>Because the device is flagged, we cannot proceed with this transaction. Under New York law, we are required to report and hold any device suspected of being lost or stolen. The device cannot be returned to you. We must cooperate with law enforcement to ensure the device is handled in accordance with legal requirements.</p>
        <p>We advise you to contact your cellular carrier or the original owner of the device to resolve the status issue directly with them.</p>
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
      .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8-8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update on Your Order - Order #**ORDER_ID**</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
      .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
      .header { background-color: #f0ad4e; color: #ffffff; padding: 24px; text-align: center; }
      .header h1 { font-size: 24px; margin: 0; }
      .content { padding: 24px; color: #555555; font-size: 16px; line-height: 1.6; }
      .content p { margin: 0 0 16px; }
      .order-id { color: #f0ad4e; font-weight: bold; }
      .footer { padding: 24px; text-align: center; color: #999999; font-size: 14px; border-top: 1px solid #e0e0e0; }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Update on Your Order</h1>
        </div>
      <div class="content">
        <p>Hello **CUSTOMER_NAME**, </p>
        <p>This is an automated notification regarding your order <strong class="order-id">#**ORDER_ID**</strong>. The 72-hour period to resolve the issue with your device has expired. As a result, your offer has been automatically reduced to the lowest possible price (as if the device were damaged).</p>
        <p>If you have any questions, please reply to this email.</p>
      </div>
      <div class="footer">
        <p>The SecondHandCell Team</p>
      </div>
    </div>
  </body>
  </html>
`;

// NEW COMPLETED ORDER EMAIL TEMPLATE WITH TRUSTBOX PLACEHOLDER
const ORDER_COMPLETED_EMAIL_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your SecondHandCell Order is Complete!</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0; }
    .header { background-color: #4CAF50; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { font-size: 24px; margin: 0; }
    .content { padding: 24px; color: #555555; font-size: 16px; line-height: 1.6; }
    .content p { margin: 0 0 16px; }
    .order-id { color: #4CAF50; font-weight: bold; }
    .footer { padding: 24px; text-align: center; color: #999999; font-size: 14px; border-top: 1px solid #e0e0e0; }
    .trustpilot-widget { margin-top: 24px; margin-bottom: 24px; text-align: center; }
  </style>
  <!-- TrustBox script -->
  <script type="text/javascript" src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js" async></script>
  <!-- End TrustBox script -->
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🥳 Your Order is Complete!</h1>
    </div>
    <div class="content">
      <p>Hello **CUSTOMER_NAME**,</p>
      <p>Great news! Your order <strong>#**ORDER_ID**</strong> has been completed and your payment has been processed.</p>
      <p>If you have any questions, please feel free to reply to this email.</p>
      <p>Thank you for choosing SecondHandCell!</p>
      **TRUSTBOX_WIDGET**
    </div>
    <div class="footer">
      <p>The SecondHandCell Team</p>
    </div>
  </div>
</body>
</html>
`;


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

async function writeOrderBoth(orderId, data) {
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

// NEW HELPER: Sanitizes data to ensure all values are strings for FCM payload compliance.
function stringifyData(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[String(k)] = typeof v === 'string' ? v : String(v);
  }
  return out;
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

  const shipEngineApiKey = process.env.SHIPENGINE_KEY;
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
  if (status === "shipping_kit_requested") return "Shipping Kit Requested";
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
        htmlBody = `
          <div style="font-family: 'system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Oxygen-Sans','Ubuntu','Cantarell','Helvetica Neue','Arial','sans-serif'; font-size: 14px; line-height: 1.5; color: #444444;">
            <h2 style="color: #0056b3; font-weight: bold; text-transform: none; font-size: 20px; line-height: 26px; margin: 5px 0 10px;">Hello ${orderToUse.shippingInfo.fullName},</h2>
            <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;">We've received your device for Order #${orderToUse.id} and after inspection, we have a revised offer for you.</p>
            <p style="color: #2b2e2f; line-height: 22px; margin: 15px 0;"><strong>Original Quote:</strong> $${orderToUse.estimatedQuote.toFixed(2)}</p>
            <p style="font-size: 1.2em; color: #d9534f; font-weight: bold; line-height: 22px; margin: 15px 0;"><strong>New Offer Price:</strong> $${orderToUse.reOffer.newPrice.toFixed(2)}</p>
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
                            <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderToUse.id}&action=accept" style="border-radius: 5px; font-size: 16px; color: #065f46; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #6ee7b7;" rel="noreferrer">
                              Accept Offer ($${orderToUse.reOffer.newPrice.toFixed(2)})
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table >
                  </td>
                  <td align="center" style="vertical-align: top; padding: 0 10px;" valign="top">
                    <table cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; font-size: 1em;">
                      <tbody>
                        <tr>
                          <td style="border-radius: 5px; background-color: #fecaca; text-align: center; vertical-align: top; padding: 5px; border: 1px solid #ddd;" align="center" bgcolor="#fecaca" valign="top">
                            <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderToUse.id}&action=return" style="border-radius: 5px; font-size: 16px; color: #991b1b; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #fca5a5;" rel="noreferrer">
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
        const TRUSTBOX_WIDGET = `
          <!-- TrustBox widget - Review Collector -->
          <div class="trustpilot-widget" data-locale="en-US" data-template-id="56278e9abfbbba0bdcd568bc" data-businessunit-id="68c8cb56da935f8a761f99a9" data-style-height="52px" data-style-width="100%" data-token="5271f986-aa8e-4797-b776-ad18270086fd">
            <a href="https://www.trustpilot.com/review/secondhandcell.com" target="_blank" rel="noopener">Trustpilot</a>
          </div>
          <!-- End TrustBox widget -->
        `;
        
        let trustboxHtml = "";
        // Check if there was no re-offer and no return
        if (!orderToUse.reOffer && !orderToUse.returnLabelUrl) {
          trustboxHtml = TRUSTBOX_WIDGET;
        }

        htmlBody = ORDER_COMPLETED_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, orderToUse.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, orderToUse.id)
          .replace(/\*\*TRUSTBOX_WIDGET\*\*/g, trustboxHtml);
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
      bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
    let updateData = { status: "label_generated" };
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
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      };
    } else {
      throw new Error(`Unknown shipping preference: ${order.shippingPreference}`);
    }

    await updateOrderBoth(req.params.id, updateData);

    await transporter.sendMail(customerMailOptions);

    res.json({ message: "Label(s) generated successfully", orderId: order.id, ...updateData });
  } catch (err) {
    console.error("Error generating label:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to generate label" });
  }
});

app.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const { order } = await updateOrderBoth(orderId, { status });

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
          bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
        });
        break;
      }
      case "completed": {
        const TRUSTBOX_WIDGET = `
          <!-- TrustBox widget - Review Collector -->
          <div class="trustpilot-widget" data-locale="en-US" data-template-id="56278e9abfbbba0bdcd568bc" data-businessunit-id="68c8cb56da935f8a761f99a9" data-style-height="52px" data-style-width="100%" data-token="5271f986-aa8e-4797-b776-ad18270086fd">
            <a href="https://www.trustpilot.com/review/secondhandcell.com" target="_blank" rel="noopener">Trustpilot</a>
          </div>
          <!-- End TrustBox widget -->
        `;
        
        let trustboxHtml = "";
        // Check if there was no re-offer and no return
        if (!order.reOffer && !order.returnLabelUrl) {
          trustboxHtml = TRUSTBOX_WIDGET;
        }

        customerEmailHtml = ORDER_COMPLETED_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
          .replace(/\*\*ORDER_ID\*\*/g, order.id)
          .replace(/\*\*TRUSTBOX_WIDGET\*\*/g, trustboxHtml);

        customerNotificationPromise = transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: order.shippingInfo.email,
          subject: "Your SecondHandCell Order is Complete",
          html: customerEmailHtml,
          bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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

    const customerEmailHtml = `
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
                        <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderId}&action=accept" style="border-radius: 5px; font-size: 16px; color: #065f46; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #6ee7b7;" rel="noreferrer">
                          Accept Offer ($${Number(newPrice).toFixed(2)})
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table >
              </td>
              <td align="center" style="vertical-align: top; padding: 0 10px;" valign="top">
                <table cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; font-size: 1em;">
                  <tbody>
                    <tr>
                      <td style="border-radius: 5px; background-color: #fecaca; text-align: center; vertical-align: top; padding: 5px; border: 1px solid #ddd;" align="center" bgcolor="#fecaca" valign="top">
                        <a href="${process.env.APP_FRONTEND_URL}/reoffer-action.html?orderId=${orderId}&action=return" style="border-radius: 5px; font-size: 16px; color: #991b1b; text-decoration: none; font-weight: bold; display: block; padding: 15px 25px; border: 1px solid #fca5a5;" rel="noreferrer">
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

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: order.shippingInfo.email,
      subject: `Re-offer for Order #${order.id}`,
      html: customerEmailHtml,
      bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
      bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
      bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
      bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
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

exports.onChatTransferUpdate = functions.firestore
  .document("chats/{chatId}")
  .onUpdate(async (change, context) => {
    // Removed all chat transfer notification logic
    return null;
  });

// RENAME and UPDATE: Trigger for the FIRST message in a new, unassigned chat.
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Quick exit if it's not a user message (e.g., bot, system, or agent)
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();

    // 2. Check if the chat is already active or assigned
    if (chatData.agentHasJoined) {
      return null;
    }
    
    // 3. Check if this is the FIRST user message in the chat.
    const userMessagesSnapshot = await db.collection(`chats/${chatId}/messages`)
      .where('senderType', '==', 'user')
      .get();

    if (userMessagesSnapshot.docs.length === 1) {
      
      const userIdentifier = chatData.ownerUid || chatData.guestId;
      const relatedUserId = chatData.ownerUid;
      
      // CRITICAL FIX: Mark that the user has sent a message and who sent the last message.
      await chatDocRef.set({
          lastMessageSender: newMessage.sender, // The user's ID/guest ID
          lastMessageSeenByAdmin: false,
      }, { merge: true });

      // Send notifications to ALL admins for a new UNASSIGNED chat.
      const fcmPromise = sendAdminPushNotification(
        "💬 New Customer Chat!",
        `Chat started by ${userIdentifier}.`,
        {
          chatId: chatId,
          userId: relatedUserId || "guest", // Use safe string fallback
          relatedDocType: "chat",
          relatedDocId: chatId,
          relatedUserId: relatedUserId,
        }
      ).catch((e) => console.error("FCM Send Error (New Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Chat: ID: ${chatId} from ${userIdentifier}.`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error (New Chat):", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New chat started by ${userIdentifier}. Notifications sent to all admins.`);
    }

    return null;
  });


// NEW FUNCTION: Trigger for subsequent customer messages in an ASSIGNED chat.
exports.onNewCustomerResponse = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const assignedAdminUid = chatData.assignedAdminUid;
    const userIdentifier = chatData.ownerUid || chatData.guestId;

    // We only proceed if an admin is assigned to this chat.
    if (!assignedAdminUid) {
        return null;
    }
    
    // We explicitly check if chatData.ownerUid is available for the payload.
    const relatedUserId = chatData.ownerUid;


    // 2. CRITICAL FIX: Get the last message sender BEFORE this new message was recorded.
    // We look at the sender of the second-to-last message (0 is the current one).
    const messageSnapshots = await db.collection(`chats/${chatId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(2)
        .get();
        
    // The message that triggered this function is index 0. We want the one before it (index 1).
    const lastMessageBeforeThisOne = messageSnapshots.docs.length === 2 
        ? messageSnapshots.docs[1].data()
        : null;

    // Update chat metadata, marking the latest sender as the user and setting unread flag.
    // This MUST happen regardless of notification sending.
    await chatDocRef.set({
        lastMessageSender: newMessage.sender, // The user's ID/guest ID
        lastMessageSeenByAdmin: false,
    }, { merge: true });

    // 3. Only notify the assigned admin if the LAST message *before* this new one
    // was sent by the assigned admin. This prevents notification spam from a user sending
    // multiple messages in a row.
    if (lastMessageBeforeThisOne?.sender === assignedAdminUid) {
        
        // Send push notification to the specific assigned admin
        const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
        const adminTokens = adminTokenSnapshot.docs.map(doc => doc.id);
        
        if (adminTokens.length > 0) {
            await sendPushNotification(
                adminTokens,
                "💬 New Message in Your Chat!",
                `${userIdentifier}: ${newMessage.text.substring(0, 50)}...`,
                {
                    chatId: chatId,
                    userId: relatedUserId || "guest",
                    relatedDocType: "chat",
                    relatedDocId: chatId,
                    relatedUserId: relatedUserId,
                }
            ).catch((e) => console.error("FCM Send Error (Customer Response):", e));
        }
        
        // Add Firestore Notification for the assigned admin
        await addAdminFirestoreNotification(
            assignedAdminUid,
            `New Message in Chat ${userIdentifier}: "${newMessage.text.substring(0, 30)}..."`,
            "chat",
            chatId,
            relatedUserId
        ).catch((e) => console.error("Firestore Notification Error (Customer Response):", e));
        
        console.log(`New customer response in assigned chat ${chatId}. Notifications sent to ${assignedAdminUid}.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send an auto-response.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    // Removed all auto-response logic as chat notifications are removed.
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

app.post("/check-esn", async (req, res) => {
  try {
    const { imei, carrier, devicetype, orderId, customerName, customerEmail } = req.body;
    
    console.log("Received request to /check-esn with payload:", req.body);

    if (!imei || !carrier || !devicetype || !orderId || !customerName || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields: imei, carrier, devicetype, orderId, customerName, and customerEmail are all required." });
    }

    const apiUrl = "https://cloudportal.phonecheck.com/cloud/cloudDB/CheckEsn/";
    const requestPayload = new URLSearchParams();
    requestPayload.append("ApiKey", "308b6790-b767-4b43-9065-2c00e13cdbf7");
    requestPayload.append("Username", "aecells1");
    requestPayload.append("IMEI", imei);
    requestPayload.append("carrier", carrier);
    requestPayload.append("devicetype", devicetype);

    console.log("Sending payload to PhoneChecks API:", requestPayload.toString());

    const response = await axios.post(apiUrl, requestPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    phoneCheckData = response.data;

    let isBlacklisted = phoneCheckData.isBlacklisted || false;
    let fmiStatus = phoneCheckData.findMyIphoneStatus || "On";
    let financialStatus = phoneCheckData.financialStatus || "Clear";
    
    if (isBlacklisted) {
      const legalText = `
        New York Penal Law § 155.05(2)(b) – Larceny by acquiring lost property: If someone acquires lost property and does not take reasonable measures to return it, it counts as larceny.
        ... (rest of your legal text)
      `;
      
      const customerEmailHtml = BLACKLISTED_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*STATUS_REASON\*\*/g, "stolen or blacklisted")
        .replace(/\*\*LEGAL_TEXT\*\*/g, legalText);
        
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Important Notice Regarding Your Device - Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      await updateOrderBoth(orderId, {
        status: "blacklisted",
        phoneCheckData: phoneCheckData,
      });

    } else if (fmiStatus === "On") {
      const confirmUrl = `${process.env.APP_FRONTEND_URL}/fmi-cleared.html?orderId=${orderId}`;
      const customerEmailHtml = FMI_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*CONFIRM_URL\*\*/g, confirmUrl);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "fmi_on_pending",
        fmiAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });

    } else if (financialStatus === "BalanceDue" || financialStatus === "PastDue") {
      const customerEmailHtml = BAL_DUE_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*FINANCIAL_STATUS\*\*/g, financialStatus === "BalanceDue" ? "an outstanding balance" : "a past due balance");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "balance_due_pending",
        balanceAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });
      
    } else {
      await updateOrderBoth(orderId, {
        status: "imei_checked",
        phoneCheckData: phoneCheckData,
      });
    }

    res.status(200).json(response.data);

  } catch (error) {
    console.error("Error calling PhoneChecks API or processing data:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check ESN", details: error.response?.data || error.message });
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


exports.api = functions.https.onRequest(app);

// RENAME and UPDATE: Trigger for the FIRST message in a new, unassigned chat.
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Quick exit if it's not a user message (e.g., bot, system, or agent)
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();

    // 2. Check if the chat is already active or assigned
    if (chatData.agentHasJoined) {
      return null;
    }
    
    // 3. Check if this is the FIRST user message in the chat.
    const userMessagesSnapshot = await db.collection(`chats/${chatId}/messages`)
      .where('senderType', '==', 'user')
      .get();

    if (userMessagesSnapshot.docs.length === 1) {
      
      const userIdentifier = chatData.ownerUid || chatData.guestId;
      const relatedUserId = chatData.ownerUid;
      
      // CRITICAL FIX: Mark that the user has sent a message and who sent the last message.
      await chatDocRef.set({
          lastMessageSender: newMessage.sender, // The user's ID/guest ID
          lastMessageSeenByAdmin: false,
      }, { merge: true });

      // Send notifications to ALL admins for a new UNASSIGNED chat.
      const fcmPromise = sendAdminPushNotification(
        "💬 New Customer Chat!",
        `Chat started by ${userIdentifier}.`,
        {
          chatId: chatId,
          userId: relatedUserId || "guest", // Use safe string fallback
          relatedDocType: "chat",
          relatedDocId: chatId,
          relatedUserId: relatedUserId,
        }
      ).catch((e) => console.error("FCM Send Error (New Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Chat: ID: ${chatId} from ${userIdentifier}.`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error (New Chat):", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New chat started by ${userIdentifier}. Notifications sent to all admins.`);
    }

    return null;
  });


// NEW FUNCTION: Trigger for subsequent customer messages in an ASSIGNED chat.
exports.onNewCustomerResponse = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const assignedAdminUid = chatData.assignedAdminUid;
    const userIdentifier = chatData.ownerUid || chatData.guestId;

    // We only proceed if an admin is assigned to this chat.
    if (!assignedAdminUid) {
        return null;
    }
    
    // We explicitly check if chatData.ownerUid is available for the payload.
    const relatedUserId = chatData.ownerUid;


    // 2. CRITICAL FIX: Get the last message sender BEFORE this new message was recorded.
    // We look at the sender of the second-to-last message (0 is the current one).
    const messageSnapshots = await db.collection(`chats/${chatId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(2)
        .get();
        
    // The message that triggered this function is index 0. We want the one before it (index 1).
    const lastMessageBeforeThisOne = messageSnapshots.docs.length === 2 
        ? messageSnapshots.docs[1].data()
        : null;

    // Update chat metadata, marking the latest sender as the user and setting unread flag.
    // This MUST happen regardless of notification sending.
    await chatDocRef.set({
        lastMessageSender: newMessage.sender, // The user's ID/guest ID
        lastMessageSeenByAdmin: false,
    }, { merge: true });

    // 3. Only notify the assigned admin if the LAST message *before* this new one
    // was sent by the assigned admin. This prevents notification spam from a user sending
    // multiple messages in a row.
    if (lastMessageBeforeThisOne?.sender === assignedAdminUid) {
        
        // Send push notification to the specific assigned admin
        const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
        const adminTokens = adminTokenSnapshot.docs.map(doc => doc.id);
        
        if (adminTokens.length > 0) {
            await sendPushNotification(
                adminTokens,
                "💬 New Message in Your Chat!",
                `${userIdentifier}: ${newMessage.text.substring(0, 50)}...`,
                {
                    chatId: chatId,
                    userId: relatedUserId || "guest",
                    relatedDocType: "chat",
                    relatedDocId: chatId,
                    relatedUserId: relatedUserId,
                }
            ).catch((e) => console.error("FCM Send Error (Customer Response):", e));
        }
        
        // Add Firestore Notification for the assigned admin
        await addAdminFirestoreNotification(
            assignedAdminUid,
            `New Message in Chat ${userIdentifier}: "${newMessage.text.substring(0, 30)}..."`,
            "chat",
            chatId,
            relatedUserId
        ).catch((e) => console.error("Firestore Notification Error (Customer Response):", e));
        
        console.log(`New customer response in assigned chat ${chatId}. Notifications sent to ${assignedAdminUid}.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send an auto-response.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    // Removed all auto-response logic as chat notifications are removed.
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

app.post("/check-esn", async (req, res) => {
  try {
    const { imei, carrier, devicetype, orderId, customerName, customerEmail } = req.body;
    
    console.log("Received request to /check-esn with payload:", req.body);

    if (!imei || !carrier || !devicetype || !orderId || !customerName || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields: imei, carrier, devicetype, orderId, customerName, and customerEmail are all required." });
    }

    const apiUrl = "https://cloudportal.phonecheck.com/cloud/cloudDB/CheckEsn/";
    const requestPayload = new URLSearchParams();
    requestPayload.append("ApiKey", "308b6790-b767-4b43-9065-2c00e13cdbf7");
    requestPayload.append("Username", "aecells1");
    requestPayload.append("IMEI", imei);
    requestPayload.append("carrier", carrier);
    requestPayload.append("devicetype", devicetype);

    console.log("Sending payload to PhoneChecks API:", requestPayload.toString());

    const response = await axios.post(apiUrl, requestPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    phoneCheckData = response.data;

    let isBlacklisted = phoneCheckData.isBlacklisted || false;
    let fmiStatus = phoneCheckData.findMyIphoneStatus || "On";
    let financialStatus = phoneCheckData.financialStatus || "Clear";
    
    if (isBlacklisted) {
      const legalText = `
        New York Penal Law § 155.05(2)(b) – Larceny by acquiring lost property: If someone acquires lost property and does not take reasonable measures to return it, it counts as larceny.
        ... (rest of your legal text)
      `;
      
      const customerEmailHtml = BLACKLISTED_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*STATUS_REASON\*\*/g, "stolen or blacklisted")
        .replace(/\*\*LEGAL_TEXT\*\*/g, legalText);
        
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Important Notice Regarding Your Device - Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      await updateOrderBoth(orderId, {
        status: "blacklisted",
        phoneCheckData: phoneCheckData,
      });

    } else if (fmiStatus === "On") {
      const confirmUrl = `${process.env.APP_FRONTEND_URL}/fmi-cleared.html?orderId=${orderId}`;
      const customerEmailHtml = FMI_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*CONFIRM_URL\*\*/g, confirmUrl);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "fmi_on_pending",
        fmiAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });

    } else if (financialStatus === "BalanceDue" || financialStatus === "PastDue") {
      const customerEmailHtml = BAL_DUE_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*FINANCIAL_STATUS\*\*/g, financialStatus === "BalanceDue" ? "an outstanding balance" : "a past due balance");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "balance_due_pending",
        balanceAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });
      
    } else {
      await updateOrderBoth(orderId, {
        status: "imei_checked",
        phoneCheckData: phoneCheckData,
      });
    }

    res.status(200).json(response.data);

  } catch (error) {
    console.error("Error calling PhoneChecks API or processing data:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check ESN", details: error.response?.data || error.message });
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


exports.api = functions.https.onRequest(app);

// RENAME and UPDATE: Trigger for the FIRST message in a new, unassigned chat.
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Quick exit if it's not a user message (e.g., bot, system, or agent)
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();

    // 2. Check if the chat is already active or assigned
    if (chatData.agentHasJoined) {
      return null;
    }
    
    // 3. Check if this is the FIRST user message in the chat.
    const userMessagesSnapshot = await db.collection(`chats/${chatId}/messages`)
      .where('senderType', '==', 'user')
      .get();

    if (userMessagesSnapshot.docs.length === 1) {
      
      const userIdentifier = chatData.ownerUid || chatData.guestId;
      const relatedUserId = chatData.ownerUid;
      
      // CRITICAL FIX: Mark that the user has sent a message and who sent the last message.
      await chatDocRef.set({
          lastMessageSender: newMessage.sender, // The user's ID/guest ID
          lastMessageSeenByAdmin: false,
      }, { merge: true });

      // Send notifications to ALL admins for a new UNASSIGNED chat.
      const fcmPromise = sendAdminPushNotification(
        "💬 New Customer Chat!",
        `Chat started by ${userIdentifier}.`,
        {
          chatId: chatId,
          userId: relatedUserId || "guest", // Use safe string fallback
          relatedDocType: "chat",
          relatedDocId: chatId,
          relatedUserId: relatedUserId,
        }
      ).catch((e) => console.error("FCM Send Error (New Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Chat: ID: ${chatId} from ${userIdentifier}.`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error (New Chat):", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New chat started by ${userIdentifier}. Notifications sent to all admins.`);
    }

    return null;
  });


// NEW FUNCTION: Trigger for subsequent customer messages in an ASSIGNED chat.
exports.onNewCustomerResponse = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const assignedAdminUid = chatData.assignedAdminUid;
    const userIdentifier = chatData.ownerUid || chatData.guestId;

    // We only proceed if an admin is assigned to this chat.
    if (!assignedAdminUid) {
        return null;
    }
    
    // We explicitly check if chatData.ownerUid is available for the payload.
    const relatedUserId = chatData.ownerUid;


    // 2. CRITICAL FIX: Get the last message sender BEFORE this new message was recorded.
    // We look at the sender of the second-to-last message (0 is the current one).
    const messageSnapshots = await db.collection(`chats/${chatId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(2)
        .get();
        
    // The message that triggered this function is index 0. We want the one before it (index 1).
    const lastMessageBeforeThisOne = messageSnapshots.docs.length === 2 
        ? messageSnapshots.docs[1].data()
        : null;

    // Update chat metadata, marking the latest sender as the user and setting unread flag.
    // This MUST happen regardless of notification sending.
    await chatDocRef.set({
        lastMessageSender: newMessage.sender, // The user's ID/guest ID
        lastMessageSeenByAdmin: false,
    }, { merge: true });

    // 3. Only notify the assigned admin if the LAST message *before* this new one
    // was sent by the assigned admin. This prevents notification spam from a user sending
    // multiple messages in a row.
    if (lastMessageBeforeThisOne?.sender === assignedAdminUid) {
        
        // Send push notification to the specific assigned admin
        const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
        const adminTokens = adminTokenSnapshot.docs.map(doc => doc.id);
        
        if (adminTokens.length > 0) {
            await sendPushNotification(
                adminTokens,
                "💬 New Message in Your Chat!",
                `${userIdentifier}: ${newMessage.text.substring(0, 50)}...`,
                {
                    chatId: chatId,
                    userId: relatedUserId || "guest",
                    relatedDocType: "chat",
                    relatedDocId: chatId,
                    relatedUserId: relatedUserId,
                }
            ).catch((e) => console.error("FCM Send Error (Customer Response):", e));
        }
        
        // Add Firestore Notification for the assigned admin
        await addAdminFirestoreNotification(
            assignedAdminUid,
            `New Message in Chat ${userIdentifier}: "${newMessage.text.substring(0, 30)}..."`,
            "chat",
            chatId,
            relatedUserId
        ).catch((e) => console.error("Firestore Notification Error (Customer Response):", e));
        
        console.log(`New customer response in assigned chat ${chatId}. Notifications sent to ${assignedAdminUid}.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send an auto-response.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    // Removed all auto-response logic as chat notifications are removed.
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

app.post("/check-esn", async (req, res) => {
  try {
    const { imei, carrier, devicetype, orderId, customerName, customerEmail } = req.body;
    
    console.log("Received request to /check-esn with payload:", req.body);

    if (!imei || !carrier || !devicetype || !orderId || !customerName || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields: imei, carrier, devicetype, orderId, customerName, and customerEmail are all required." });
    }

    const apiUrl = "https://cloudportal.phonecheck.com/cloud/cloudDB/CheckEsn/";
    const requestPayload = new URLSearchParams();
    requestPayload.append("ApiKey", "308b6790-b767-4b43-9065-2c00e13cdbf7");
    requestPayload.append("Username", "aecells1");
    requestPayload.append("IMEI", imei);
    requestPayload.append("carrier", carrier);
    requestPayload.append("devicetype", devicetype);

    console.log("Sending payload to PhoneChecks API:", requestPayload.toString());

    const response = await axios.post(apiUrl, requestPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    phoneCheckData = response.data;

    let isBlacklisted = phoneCheckData.isBlacklisted || false;
    let fmiStatus = phoneCheckData.findMyIphoneStatus || "On";
    let financialStatus = phoneCheckData.financialStatus || "Clear";
    
    if (isBlacklisted) {
      const legalText = `
        New York Penal Law § 155.05(2)(b) – Larceny by acquiring lost property: If someone acquires lost property and does not take reasonable measures to return it, it counts as larceny.
        ... (rest of your legal text)
      `;
      
      const customerEmailHtml = BLACKLISTED_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*STATUS_REASON\*\*/g, "stolen or blacklisted")
        .replace(/\*\*LEGAL_TEXT\*\*/g, legalText);
        
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Important Notice Regarding Your Device - Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      await updateOrderBoth(orderId, {
        status: "blacklisted",
        phoneCheckData: phoneCheckData,
      });

    } else if (fmiStatus === "On") {
      const confirmUrl = `${process.env.APP_FRONTEND_URL}/fmi-cleared.html?orderId=${orderId}`;
      const customerEmailHtml = FMI_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*CONFIRM_URL\*\*/g, confirmUrl);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "fmi_on_pending",
        fmiAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });

    } else if (financialStatus === "BalanceDue" || financialStatus === "PastDue") {
      const customerEmailHtml = BAL_DUE_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*FINANCIAL_STATUS\*\*/g, financialStatus === "BalanceDue" ? "an outstanding balance" : "a past due balance");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "balance_due_pending",
        balanceAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });
      
    } else {
      await updateOrderBoth(orderId, {
        status: "imei_checked",
        phoneCheckData: phoneCheckData,
      });
    }

    res.status(200).json(response.data);

  } catch (error) {
    console.error("Error calling PhoneChecks API or processing data:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check ESN", details: error.response?.data || error.message });
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


exports.api = functions.https.onRequest(app);

// RENAME and UPDATE: Trigger for the FIRST message in a new, unassigned chat.
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Quick exit if it's not a user message (e.g., bot, system, or agent)
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();

    // 2. Check if the chat is already active or assigned
    if (chatData.agentHasJoined) {
      return null;
    }
    
    // 3. Check if this is the FIRST user message in the chat.
    const userMessagesSnapshot = await db.collection(`chats/${chatId}/messages`)
      .where('senderType', '==', 'user')
      .get();

    if (userMessagesSnapshot.docs.length === 1) {
      
      const userIdentifier = chatData.ownerUid || chatData.guestId;
      const relatedUserId = chatData.ownerUid;
      
      // CRITICAL FIX: Mark that the user has sent a message and who sent the last message.
      await chatDocRef.set({
          lastMessageSender: newMessage.sender, // The user's ID/guest ID
          lastMessageSeenByAdmin: false,
      }, { merge: true });

      // Send notifications to ALL admins for a new UNASSIGNED chat.
      const fcmPromise = sendAdminPushNotification(
        "💬 New Customer Chat!",
        `Chat started by ${userIdentifier}.`,
        {
          chatId: chatId,
          userId: relatedUserId || "guest", // Use safe string fallback
          relatedDocType: "chat",
          relatedDocId: chatId,
          relatedUserId: relatedUserId,
        }
      ).catch((e) => console.error("FCM Send Error (New Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Chat: ID: ${chatId} from ${userIdentifier}.`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error (New Chat):", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New chat started by ${userIdentifier}. Notifications sent to all admins.`);
    }

    return null;
  });


// NEW FUNCTION: Trigger for subsequent customer messages in an ASSIGNED chat.
exports.onNewCustomerResponse = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const assignedAdminUid = chatData.assignedAdminUid;
    const userIdentifier = chatData.ownerUid || chatData.guestId;

    // We only proceed if an admin is assigned to this chat.
    if (!assignedAdminUid) {
        return null;
    }
    
    // We explicitly check if chatData.ownerUid is available for the payload.
    const relatedUserId = chatData.ownerUid;


    // 2. CRITICAL FIX: Get the last message sender BEFORE this new message was recorded.
    // We look at the sender of the second-to-last message (0 is the current one).
    const messageSnapshots = await db.collection(`chats/${chatId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(2)
        .get();
        
    // The message that triggered this function is index 0. We want the one before it (index 1).
    const lastMessageBeforeThisOne = messageSnapshots.docs.length === 2 
        ? messageSnapshots.docs[1].data()
        : null;

    // Update chat metadata, marking the latest sender as the user and setting unread flag.
    // This MUST happen regardless of notification sending.
    await chatDocRef.set({
        lastMessageSender: newMessage.sender, // The user's ID/guest ID
        lastMessageSeenByAdmin: false,
    }, { merge: true });

    // 3. Only notify the assigned admin if the LAST message *before* this new one
    // was sent by the assigned admin. This prevents notification spam from a user sending
    // multiple messages in a row.
    if (lastMessageBeforeThisOne?.sender === assignedAdminUid) {
        
        // Send push notification to the specific assigned admin
        const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
        const adminTokens = adminTokenSnapshot.docs.map(doc => doc.id);
        
        if (adminTokens.length > 0) {
            await sendPushNotification(
                adminTokens,
                "💬 New Message in Your Chat!",
                `${userIdentifier}: ${newMessage.text.substring(0, 50)}...`,
                {
                    chatId: chatId,
                    userId: relatedUserId || "guest",
                    relatedDocType: "chat",
                    relatedDocId: chatId,
                    relatedUserId: relatedUserId,
                }
            ).catch((e) => console.error("FCM Send Error (Customer Response):", e));
        }
        
        // Add Firestore Notification for the assigned admin
        await addAdminFirestoreNotification(
            assignedAdminUid,
            `New Message in Chat ${userIdentifier}: "${newMessage.text.substring(0, 30)}..."`,
            "chat",
            chatId,
            relatedUserId
        ).catch((e) => console.error("Firestore Notification Error (Customer Response):", e));
        
        console.log(`New customer response in assigned chat ${chatId}. Notifications sent to ${assignedAdminUid}.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send an auto-response.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    // Removed all auto-response logic as chat notifications are removed.
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

app.post("/check-esn", async (req, res) => {
  try {
    const { imei, carrier, devicetype, orderId, customerName, customerEmail } = req.body;
    
    console.log("Received request to /check-esn with payload:", req.body);

    if (!imei || !carrier || !devicetype || !orderId || !customerName || !customerEmail) {
      return res.status(400).json({ error: "Missing required fields: imei, carrier, devicetype, orderId, customerName, and customerEmail are all required." });
    }

    const apiUrl = "https://cloudportal.phonecheck.com/cloud/cloudDB/CheckEsn/";
    const requestPayload = new URLSearchParams();
    requestPayload.append("ApiKey", "308b6790-b767-4b43-9065-2c00e13cdbf7");
    requestPayload.append("Username", "aecells1");
    requestPayload.append("IMEI", imei);
    requestPayload.append("carrier", carrier);
    requestPayload.append("devicetype", devicetype);

    console.log("Sending payload to PhoneChecks API:", requestPayload.toString());

    const response = await axios.post(apiUrl, requestPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    phoneCheckData = response.data;

    let isBlacklisted = phoneCheckData.isBlacklisted || false;
    let fmiStatus = phoneCheckData.findMyIphoneStatus || "On";
    let financialStatus = phoneCheckData.financialStatus || "Clear";
    
    if (isBlacklisted) {
      const legalText = `
        New York Penal Law § 155.05(2)(b) – Larceny by acquiring lost property: If someone acquires lost property and does not take reasonable measures to return it, it counts as larceny.
        ... (rest of your legal text)
      `;
      
      const customerEmailHtml = BLACKLISTED_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*STATUS_REASON\*\*/g, "stolen or blacklisted")
        .replace(/\*\*LEGAL_TEXT\*\*/g, legalText);
        
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Important Notice Regarding Your Device - Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      await updateOrderBoth(orderId, {
        status: "blacklisted",
        phoneCheckData: phoneCheckData,
      });

    } else if (fmiStatus === "On") {
      const confirmUrl = `${process.env.APP_FRONTEND_URL}/fmi-cleared.html?orderId=${orderId}`;
      const customerEmailHtml = FMI_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*CONFIRM_URL\*\*/g, confirmUrl);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "fmi_on_pending",
        fmiAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });

    } else if (financialStatus === "BalanceDue" || financialStatus === "PastDue") {
      const customerEmailHtml = BAL_DUE_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, customerName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*FINANCIAL_STATUS\*\*/g, financialStatus === "BalanceDue" ? "an outstanding balance" : "a past due balance");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Action Required for Order #${orderId}`,
        html: customerEmailHtml,
        bcc: ["sales@secondhandcell.com", "saulsetton16@gmail.com"]
      });

      const downgradeDate = admin.firestore.Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000);
      await updateOrderBoth(orderId, {
        status: "balance_due_pending",
        balanceAutoDowngradeDate: downgradeDate,
        phoneCheckData: phoneCheckData,
      });
      
    } else {
      await updateOrderBoth(orderId, {
        status: "imei_checked",
        phoneCheckData: phoneCheckData,
      });
    }

    res.status(200).json(response.data);

  } catch (error) {
    console.error("Error calling PhoneChecks API or processing data:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check ESN", details: error.response?.data || error.message });
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


exports.api = functions.https.onRequest(app);

// RENAME and UPDATE: Trigger for the FIRST message in a new, unassigned chat.
exports.onNewChatOpened = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Quick exit if it's not a user message (e.g., bot, system, or agent)
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();

    // 2. Check if the chat is already active or assigned
    if (chatData.agentHasJoined) {
      return null;
    }
    
    // 3. Check if this is the FIRST user message in the chat.
    const userMessagesSnapshot = await db.collection(`chats/${chatId}/messages`)
      .where('senderType', '==', 'user')
      .get();

    if (userMessagesSnapshot.docs.length === 1) {
      
      const userIdentifier = chatData.ownerUid || chatData.guestId;
      const relatedUserId = chatData.ownerUid;
      
      // CRITICAL FIX: Mark that the user has sent a message and who sent the last message.
      await chatDocRef.set({
          lastMessageSender: newMessage.sender, // The user's ID/guest ID
          lastMessageSeenByAdmin: false,
      }, { merge: true });

      // Send notifications to ALL admins for a new UNASSIGNED chat.
      const fcmPromise = sendAdminPushNotification(
        "💬 New Customer Chat!",
        `Chat started by ${userIdentifier}.`,
        {
          chatId: chatId,
          userId: relatedUserId || "guest", // Use safe string fallback
          relatedDocType: "chat",
          relatedDocId: chatId,
          relatedUserId: relatedUserId,
        }
      ).catch((e) => console.error("FCM Send Error (New Chat):", e));

      // Add Firestore Notifications for each admin
      const firestoreNotificationPromises = [];
      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        firestoreNotificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Chat: ID: ${chatId} from ${userIdentifier}.`,
            "chat",
            chatId,
            relatedUserId
          ).catch((e) => console.error("Firestore Notification Error (New Chat):", e))
        );
      });

      await Promise.all([fcmPromise, ...firestoreNotificationPromises]);
      
      console.log(`New chat started by ${userIdentifier}. Notifications sent to all admins.`);
    }

    return null;
  });


// NEW FUNCTION: Trigger for subsequent customer messages in an ASSIGNED chat.
exports.onNewCustomerResponse = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const chatId = context.params.chatId;

    // 1. Only process user messages
    if (newMessage.senderType !== "user") {
      return null;
    }

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    const chatData = chatDoc.data();
    
    const assignedAdminUid = chatData.assignedAdminUid;
    const userIdentifier = chatData.ownerUid || chatData.guestId;

    // We only proceed if an admin is assigned to this chat.
    if (!assignedAdminUid) {
        return null;
    }
    
    // We explicitly check if chatData.ownerUid is available for the payload.
    const relatedUserId = chatData.ownerUid;


    // 2. CRITICAL FIX: Get the last message sender BEFORE this new message was recorded.
    // We look at the sender of the second-to-last message (0 is the current one).
    const messageSnapshots = await db.collection(`chats/${chatId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(2)
        .get();
        
    // The message that triggered this function is index 0. We want the one before it (index 1).
    const lastMessageBeforeThisOne = messageSnapshots.docs.length === 2 
        ? messageSnapshots.docs[1].data()
        : null;

    // Update chat metadata, marking the latest sender as the user and setting unread flag.
    // This MUST happen regardless of notification sending.
    await chatDocRef.set({
        lastMessageSender: newMessage.sender, // The user's ID/guest ID
        lastMessageSeenByAdmin: false,
    }, { merge: true });

    // 3. Only notify the assigned admin if the LAST message *before* this new one
    // was sent by the assigned admin. This prevents notification spam from a user sending
    // multiple messages in a row.
    if (lastMessageBeforeThisOne?.sender === assignedAdminUid) {
        
        // Send push notification to the specific assigned admin
        const adminTokenSnapshot = await db.collection(`admins/${assignedAdminUid}/fcmTokens`).get();
        const adminTokens = adminTokenSnapshot.docs.map(doc => doc.id);
        
        if (adminTokens.length > 0) {
            await sendPushNotification(
                adminTokens,
                "💬 New Message in Your Chat!",
                `${userIdentifier}: ${newMessage.text.substring(0, 50)}...`,
                {
                    chatId: chatId,
                    userId: relatedUserId || "guest",
                    relatedDocType: "chat",
                    relatedDocId: chatId,
                    relatedUserId: relatedUserId,
                }
            ).catch((e) => console.error("FCM Send Error (Customer Response):", e));
        }
        
        // Add Firestore Notification for the assigned admin
        await addAdminFirestoreNotification(
            assignedAdminUid,
            `New Message in Chat ${userIdentifier}: "${newMessage.text.substring(0, 30)}..."`,
            "chat",
            chatId,
            relatedUserId
        ).catch((e) => console.error("Firestore Notification Error (Customer Response):", e));
        
        console.log(`New customer response in assigned chat ${chatId}. Notifications sent to ${assignedAdminUid}.`);
    }

    return null;
  });

// NEW FUNCTION: Triggers on new chat document creation to send an auto-response.
exports.onNewChatCreated = functions.firestore
  .document("chats/{chatId}")
  .onCreate(async (snap, context) => {
    // Removed all auto-response logic as chat notifications are removed.
    return null;
  });
