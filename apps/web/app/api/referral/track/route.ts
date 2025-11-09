export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebaseAdmin';

export async function POST(request: Request) {
  const payload = await request.json();
  if (!payload.code) {
    return NextResponse.json({ error: 'Missing referral code' }, { status: 400 });
  }

  const doc = await adminDb().collection('referrals').add({
    code: payload.code,
    email: payload.email ?? null,
    userId: payload.userId ?? null,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ id: doc.id });
}
