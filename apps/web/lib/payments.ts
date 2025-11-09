import Stripe from 'stripe';
import { adminDb } from './firebaseAdmin';

type PaymentProvider = 'stripe' | 'paypal';

export async function createPaymentIntent(orderId: string, amount: number, currency = 'usd') {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: {
      orderId,
    },
  });

  await adminDb().collection('orders').doc(orderId).set(
    {
      payment: {
        provider: 'stripe',
        status: 'requires_confirmation',
        transactionId: paymentIntent.id,
      },
    },
    { merge: true }
  );

  return paymentIntent.client_secret;
}

export async function recordPaypalCapture(orderId: string, captureId: string) {
  await adminDb().collection('orders').doc(orderId).set(
    {
      payment: {
        provider: 'paypal',
        status: 'succeeded',
        transactionId: captureId,
      },
      status: 'paid',
    },
    { merge: true }
  );
}
