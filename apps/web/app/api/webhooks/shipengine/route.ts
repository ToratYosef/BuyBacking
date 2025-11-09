export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: Request) {
  const payload = await request.json();
  const orderId = payload?.metadata?.orderId ?? payload?.orderId;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  await adminDb().collection('orders').doc(orderId).set(
    {
      shipping: {
        status: payload.event ?? 'updated',
        trackingNumber: payload.tracking_number ?? null,
      },
      logs: FieldValue.arrayUnion({ entry: `ShipEngine webhook: ${payload.event}`, ts: new Date().toISOString() }),
    },
    { merge: true }
  );

  return NextResponse.json({ received: true });
}
