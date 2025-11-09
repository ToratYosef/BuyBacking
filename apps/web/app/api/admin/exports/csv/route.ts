export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/firebaseAdmin';
import { assertRole, handleHttpError } from '../../../../../lib/assertRole';

export async function GET(request: Request) {
  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const query = status
    ? adminDb().collection('orders').where('status', '==', status)
    : adminDb().collection('orders');

  const snapshot = await query.limit(1000).get();
  const rows = snapshot.docs.map((doc) => doc.data());

  const header = ['id', 'priceOffered', 'status', 'createdAt'];
  const csv = [header.join(','), ...rows.map((row) => header.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="orders.csv"',
    },
  });
}
