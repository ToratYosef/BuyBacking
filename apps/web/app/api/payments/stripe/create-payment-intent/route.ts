export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertRole, handleHttpError } from '../../../../../lib/assertRole';
import { createPaymentIntent } from '../../../../../lib/payments';

export async function POST(request: Request) {
  const payload = (await request.json()) as { orderId: string; amount: number };
  if (!payload.orderId || !payload.amount) {
    return NextResponse.json({ error: 'Missing orderId or amount' }, { status: 400 });
  }

  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  try {
    const clientSecret = await createPaymentIntent(payload.orderId, Math.round(payload.amount * 100));
    return NextResponse.json({ clientSecret });
  } catch (error) {
    console.error('Unable to create payment intent', error);
    return NextResponse.json({ error: 'Unable to create payment intent' }, { status: 500 });
  }
}
