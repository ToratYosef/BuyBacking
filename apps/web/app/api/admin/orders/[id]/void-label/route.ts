export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertRole, handleHttpError } from '../../../../../../lib/assertRole';
import ShipEngine from 'shipengine';
import { adminDb } from '../../../../../../lib/firebaseAdmin';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  const { labelId } = await request.json();
  if (!labelId) {
    return NextResponse.json({ error: 'Missing labelId' }, { status: 400 });
  }

  if (!process.env.SHIPENGINE_API_KEY) {
    return NextResponse.json({ error: 'ShipEngine not configured' }, { status: 500 });
  }

  const shipengine = new ShipEngine({ apiKey: process.env.SHIPENGINE_API_KEY });
  await shipengine.voidLabel({ labelId });

  await adminDb().collection('orders').doc(params.id).set(
    {
      shipping: {
        status: 'voided',
        labelId: null,
      },
    },
    { merge: true }
  );

  return NextResponse.json({ status: 'voided' });
}
