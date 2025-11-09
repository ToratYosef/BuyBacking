import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminAuth } from './firebaseAdmin';

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function assertRole(role: 'admin') {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  if (!sessionCookie) {
    throw new HttpError('Unauthorized', 401);
  }

  const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
  if (role === 'admin') {
    const allowed =
      decoded.admin === true ||
      (process.env.ADMIN_ALLOWED_EMAILS || '')
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean)
        .includes(decoded.email ?? '');

    if (!allowed) {
      throw new HttpError('Forbidden', 403);
    }
  }

  return decoded;
}

export function handleHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
