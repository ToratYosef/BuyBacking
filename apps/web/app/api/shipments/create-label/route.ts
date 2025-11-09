export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createShippingLabel } from '../../../../lib/shipments';
import { assertRole, handleHttpError } from '../../../../lib/assertRole';

export async function POST(request: Request) {
  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  const payload = await request.json();

  try {
    const label = await createShippingLabel(payload);
    return NextResponse.json(label);
  } catch (error) {
    console.error('Failed to create label', error);
    return NextResponse.json({ error: 'Unable to create label' }, { status: 500 });
  }
}
