import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Request, Response } from 'express';
import axios from 'axios';

initializeApp();

const db = getFirestore();
const auth = getAuth();

function handleCors(req: Request, res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

export const shipengineWebhook = onRequest(async (req, res) => {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const payload = (req.body ?? {}) as Record<string, any>;
  const orderId = payload?.metadata?.orderId ?? payload?.orderId;
  if (!orderId) {
    res.status(400).json({ error: 'Missing orderId' });
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
        entry: `ShipEngine webhook (${payload.event ?? 'unknown'})`,
      }),
    },
    { merge: true }
  );

  res.json({ received: true });
});

export const pricingRefresh = onSchedule('every 3 hours', async () => {
  const devicesSnapshot = await db.collection('devices').get();
  const updates = devicesSnapshot.docs.map((doc) =>
    doc.ref.update({
      pricingRefreshedAt: FieldValue.serverTimestamp(),
    })
  );
  await Promise.all(updates);
});

type RefreshFeedsRequest = { email?: string; admin?: boolean };

export const refreshSellCellFeeds = onCall({ timeoutSeconds: 540 }, async (request) => {
  if (!request.auth?.token?.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
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

export const setAdminClaims = onCall(async (request) => {
  if (!request.auth?.token?.admin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const data = request.data as RefreshFeedsRequest;
  if (!data?.email) {
    throw new HttpsError('invalid-argument', 'Email is required');
  }

  const user = await auth.getUserByEmail(data.email);
  await auth.setCustomUserClaims(user.uid, { admin: data.admin === true });
  return { uid: user.uid, admin: data.admin === true };
});

export const auditOrders = onDocumentWritten('orders/{orderId}', async (event) => {
  const orderId = event.params.orderId as string;
  const before = event.data?.before?.data() ?? null;
  const after = event.data?.after?.data() ?? null;

  await db.collection('adminAuditLogs').add({
    orderId,
    before,
    after,
    timestamp: FieldValue.serverTimestamp(),
  });
});
