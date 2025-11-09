export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '../../../../lib/firebaseAdmin';
import { assertRole, handleHttpError, HttpError } from '../../../../lib/assertRole';
import { cookies } from 'next/headers';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('__session')?.value;
    let isAdmin = false;
    let uid: string | null = null;

    if (sessionCookie) {
      try {
        const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
        uid = decoded.uid;
        isAdmin =
          decoded.admin === true ||
          (process.env.ADMIN_ALLOWED_EMAILS || '')
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            .includes(decoded.email ?? '');
      } catch (error) {
        // ignore invalid cookies, fall through to unauthorized response
      }
    }

    if (!isAdmin && !uid) {
      throw new HttpError('Unauthorized', 401);
    }

    const db = adminDb();
    const doc = await db.collection('orders').doc(params.id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = doc.data();
    if (!isAdmin && data?.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return handleHttpError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await assertRole('admin');
  } catch (error) {
    return handleHttpError(error);
  }

  const payload = await request.json();
  const db = adminDb();
  await db.collection('orders').doc(params.id).set(payload, { merge: true });
  return NextResponse.json({ status: 'ok' });
}
