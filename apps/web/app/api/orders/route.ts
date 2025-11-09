export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createOrder } from '../../../lib/orders';
import type { QuoteResponse } from '../../../lib/pricing';
import type { QuoteFormValues } from '../../../components/forms/QuoteForm';
import { adminAuth, adminDb } from '../../../lib/firebaseAdmin';
import { createPaymentIntent } from '../../../lib/payments';

export async function GET() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ orders: [] });
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const snapshot = await adminDb()
      .collection('users')
      .doc(decoded.uid)
      .collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return NextResponse.json({ orders: snapshot.docs.map((doc) => doc.data()) });
  } catch (error) {
    console.warn('Failed to fetch user orders', error);
    return NextResponse.json({ orders: [] });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    shippingMethod?: 'kit' | 'label';
    paymentProvider?: 'stripe' | 'paypal';
    quote?: QuoteResponse | null;
    selection?: QuoteFormValues | null;
  };

  if (!payload.shippingMethod || !payload.paymentProvider) {
    return NextResponse.json({ error: 'Missing shipping or payment selection' }, { status: 400 });
  }

  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  let userId: string | null = null;

  if (sessionCookie) {
    try {
      const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
      userId = decoded.uid;
    } catch (error) {
      console.warn('Invalid session cookie', error);
    }
  }

  const order = await createOrder({
    userId,
    device: {
      deviceId: payload.selection?.deviceSlug ?? 'custom-device',
      slug: payload.selection?.deviceSlug ?? 'custom-device',
      capacity: payload.selection?.capacity ?? 'Unknown',
      network: payload.selection?.network ?? 'Unknown',
      condition: payload.selection?.condition ?? 'Unknown',
    },
    priceOffered: payload.quote?.bestPrice ?? 0,
    shipping: {
      method: payload.shippingMethod,
    },
    payment: {
      provider: payload.paymentProvider,
    },
    referral: undefined,
  });

  let paymentClientSecret: string | undefined;
  if (payload.paymentProvider === 'stripe' && order.priceOffered > 0) {
    try {
      paymentClientSecret = await createPaymentIntent(order.id, Math.round(order.priceOffered * 100));
    } catch (error) {
      console.error('Failed to create payment intent', error);
    }
  }

  return NextResponse.json({ orderNumber: order.id, paymentClientSecret });
}
