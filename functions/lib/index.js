"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditOrders = exports.setAdminClaims = exports.refreshSellCellFeeds = exports.pricingRefresh = exports.shipengineWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const axios_1 = __importDefault(require("axios"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const auth = (0, auth_1.getAuth)();
const shipEngineWebhook = (0, express_1.default)();
shipEngineWebhook.use((0, cors_1.default)({ origin: true }));
shipEngineWebhook.use(express_1.default.json());
shipEngineWebhook.post('/', async (req, res) => {
    const payload = req.body;
    const orderId = payload?.metadata?.orderId ?? payload?.orderId;
    if (!orderId) {
        res.status(400).send('Missing orderId');
        return;
    }
    await db.collection('orders').doc(orderId).set({
        shipping: {
            status: payload.event ?? 'updated',
            trackingNumber: payload.tracking_number ?? null,
        },
        logs: firestore_1.FieldValue.arrayUnion({
            ts: new Date().toISOString(),
            entry: `ShipEngine webhook (${payload.event})`,
        }),
    }, { merge: true });
    res.json({ received: true });
});
exports.shipengineWebhook = functions.https.onRequest(shipEngineWebhook);
exports.pricingRefresh = functions.pubsub.schedule('every 3 hours').onRun(async () => {
    const devicesSnapshot = await db.collection('devices').get();
    const updates = devicesSnapshot.docs.map((doc) => doc.ref.update({
        pricingRefreshedAt: firestore_1.FieldValue.serverTimestamp(),
    }));
    await Promise.all(updates);
    return null;
});
exports.refreshSellCellFeeds = functions.runWith({ timeoutSeconds: 540 }).https.onCall(async (_data, context) => {
    if (!context.auth?.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    const response = await axios_1.default.get('https://api.sellcell.com/v2/devices', {
        headers: { Authorization: `Bearer ${process.env.SELLCELL_API_KEY}` },
        validateStatus: () => true,
    });
    await db.collection('pricingSnapshots').add({
        source: 'sellcell',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        payload: response.data,
    });
    return { status: 'ok' };
});
exports.setAdminClaims = functions.https.onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    if (!data?.email) {
        throw new functions.https.HttpsError('invalid-argument', 'Email is required');
    }
    const user = await auth.getUserByEmail(data.email);
    await auth.setCustomUserClaims(user.uid, { admin: data.admin === true });
    return { uid: user.uid, admin: data.admin === true };
});
exports.auditOrders = functions.firestore.document('orders/{orderId}').onWrite(async (change, context) => {
    const orderId = context.params.orderId;
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    await db.collection('adminAuditLogs').add({
        orderId,
        before,
        after,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    });
});
