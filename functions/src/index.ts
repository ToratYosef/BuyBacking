import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import axios from 'axios';

initializeApp();

const db = getFirestore();
const auth = getAuth();

const shipEngineWebhook = express();
shipEngineWebhook.use(cors({ origin: true }));
shipEngineWebhook.use(express.json());

shipEngineWebhook.post('/', async (req, res) => {
  const payload = req.body;
  const orderId = payload?.metadata?.orderId ?? payload?.orderId;
  if (!orderId) {
    res.status(400).send('Missing orderId');
    return;
  }

  await db.collection('orders').doc(orderId).set(
    {
      shipping: {
        status: payload.event ?? 'updated',
        trackingNumber: payload.tracking_number ?? null,
      },
      logs: FieldValue.arrayUnion({
        ts: new Date().toISOString(),
        entry: `ShipEngine webhook (${payload.event})`,
      }),
    },
    { merge: true }
  );

  res.json({ received: true });
});

export const shipengineWebhook = functions.https.onRequest(shipEngineWebhook);

export const pricingRefresh = functions.pubsub.schedule('every 3 hours').onRun(async () => {
  const devicesSnapshot = await db.collection('devices').get();
  const updates = devicesSnapshot.docs.map((doc) => doc.ref.update({
    pricingRefreshedAt: FieldValue.serverTimestamp(),
  }));
  await Promise.all(updates);
  return null;
});

export const refreshSellCellFeeds = functions.runWith({ timeoutSeconds: 540 }).https.onCall(async (_data, context) => {
  if (!context.auth?.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const response = await axios.get('https://api.sellcell.com/v2/devices', {
    headers: { Authorization: `Bearer ${process.env.SELLCELL_API_KEY}` },
    validateStatus: () => true,
  });

  await db.collection('pricingSnapshots').add({
    source: 'sellcell',
    createdAt: FieldValue.serverTimestamp(),
    payload: response.data,
  });

  return { status: 'ok' };
});

export const setAdminClaims = functions.https.onCall(async (data, context) => {
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

export const auditOrders = functions.firestore.document('orders/{orderId}').onWrite(async (change, context) => {
  const orderId = context.params.orderId as string;
  const after = change.after.exists ? change.after.data() : null;
  const before = change.before.exists ? change.before.data() : null;

  await db.collection('adminAuditLogs').add({
    orderId,
    before,
    after,
    timestamp: FieldValue.serverTimestamp(),
  });
});
