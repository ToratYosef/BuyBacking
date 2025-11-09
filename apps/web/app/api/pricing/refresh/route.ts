export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { assertRole, handleHttpError } from '../../../../lib/assertRole';

export async function POST() {
  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  console.info('Pricing refresh triggered');
  return NextResponse.json({ status: 'enqueued' });
}
