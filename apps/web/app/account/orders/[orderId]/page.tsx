import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminDb, adminAuth } from '../../../../lib/firebaseAdmin';
import { cookies } from 'next/headers';
import { OrderDoc } from '../../../../lib/types';

interface Params {
  params: { orderId: string };
}

export default async function AccountOrderDetail({ params }: Params) {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  if (!sessionCookie) {
    redirect('/account');
  }

  let decoded;
  try {
    decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
  } catch (error) {
    redirect('/account');
  }

  const doc = await adminDb()
    .collection('users')
    .doc(decoded.uid)
    .collection('orders')
    .doc(params.orderId)
    .get();

  if (!doc.exists) {
    notFound();
  }

  const order = doc.data() as OrderDoc;

  return (
    <div className="space-y-4">
      <Link href="/account" className="text-sm text-brand underline">
        Back to account
      </Link>
      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-2xl font-semibold text-slate-900">Order {order.id}</h2>
        <p className="text-sm text-slate-600">Status: {order.status}</p>
        <p className="text-sm text-slate-600">Price: ${order.priceOffered.toFixed(2)}</p>
      </div>
    </div>
  );
}
