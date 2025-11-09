export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { calculateQuote } from '../../../lib/pricing';
import type { QuoteRequest } from '../../../lib/pricing';

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<QuoteRequest>;
  if (!payload.deviceSlug || !payload.capacity || !payload.network || !payload.condition) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const quote = await calculateQuote(payload as QuoteRequest);
    return NextResponse.json(quote);
  } catch (error) {
    console.error('Quote calculation failed', error);
    return NextResponse.json({ error: 'Unable to calculate quote' }, { status: 500 });
  }
}
