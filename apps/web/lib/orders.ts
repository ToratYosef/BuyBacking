import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';

export interface OrderInput {
  userId: string | null;
  device: {
    deviceId: string;
    slug: string;
    capacity: string;
    network: string;
    condition: string;
  };
  priceOffered: number;
  shipping: {
    method: 'kit' | 'label';
  };
  payment: {
    provider: 'stripe' | 'paypal';
  };
  referral?: {
    code?: string;
    referrerUserId?: string;
  };
}

export async function getNextOrderNumber(): Promise<string> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const counterRef = db.collection('counters').doc('orders');
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists ? (counterSnap.data()!.value as number) : 0;
    const nextValue = current + 1;
    tx.set(counterRef, { value: FieldValue.increment(1) }, { merge: true });
    return `ORD-${nextValue.toString().padStart(7, '0')}`;
  });
}

export async function createOrder(input: OrderInput) {
  const db = adminDb();
  const orderNumber = await getNextOrderNumber();

  const orderDoc = {
    id: orderNumber,
    createdAt: Timestamp.now(),
    userId: input.userId,
    device: input.device,
    priceOffered: input.priceOffered,
    shipping: {
      ...input.shipping,
      status: 'pending',
    },
    payment: {
      ...input.payment,
      status: 'requires_payment_method',
    },
    status: 'created',
    logs: [
      {
        ts: Timestamp.now(),
        entry: 'Order created',
      },
    ],
    referral: input.referral ?? null,
  };

  await db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc(orderNumber);
    tx.set(orderRef, orderDoc);

    if (input.userId) {
      const userOrderRef = db
        .collection('users')
        .doc(input.userId)
        .collection('orders')
        .doc(orderNumber);
      tx.set(userOrderRef, orderDoc);
    }
  });

  await db.collection('adminAuditLogs').add({
    actor: input.userId,
    action: 'order.created',
    orderId: orderNumber,
    details: {
      device: input.device,
      priceOffered: input.priceOffered,
    },
    timestamp: Timestamp.now(),
  });

  return orderDoc;
}
