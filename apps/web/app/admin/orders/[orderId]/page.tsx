import Link from 'next/link';
import ordersSample from '../../../../samples/orders.sample.json';
import { adminDb } from '../../../../lib/firebaseAdmin';
import { OrderDoc } from '../../../../lib/types';

interface Params {
  params: { orderId: string };
}

export default async function AdminOrderDetailPage({ params }: Params) {
  const sample = (ordersSample as unknown as OrderDoc[]).find((order) => order.id === params.orderId);
  let order: OrderDoc | undefined = sample;

  try {
    const doc = await adminDb().collection('orders').doc(params.orderId).get();
    if (doc.exists) {
      order = doc.data() as OrderDoc;
    }
  } catch (error) {
    console.warn('Falling back to sample order', error);
  }

  if (!order) {
    return (
      <div>
        <p className="text-slate-600">Order not found.</p>
        <Link href="/admin" className="text-brand underline">
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Order {order.id}</h2>
          <p className="text-sm text-slate-500">Status: {order.status}</p>
        </div>
        <Link href="/admin" className="text-sm text-brand underline">
          Back to orders
        </Link>
      </div>
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Device</h3>
          <dl className="mt-3 space-y-2 text-sm text-slate-600">
            <div>
              <dt className="font-medium text-slate-500">Model</dt>
              <dd className="text-slate-800">{order.device.slug}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Capacity</dt>
              <dd className="text-slate-800">{order.device.capacity}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Network</dt>
              <dd className="text-slate-800">{order.device.network}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment</h3>
          <p className="mt-2 text-sm text-slate-600">
            {order.payment.provider} · {order.payment.status}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">${order.priceOffered.toFixed(2)}</p>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Shipping</h3>
        <p className="mt-2 text-sm text-slate-600">Method: {order.shipping.method}</p>
        <p className="text-sm text-slate-600">Status: {order.shipping.status}</p>
        {order.shipping.trackingNumber && (
          <p className="text-sm text-slate-600">Tracking: {order.shipping.trackingNumber}</p>
        )}
        {order.shipping.labelDownloadUrl && (
          <a href={order.shipping.labelDownloadUrl} className="mt-2 inline-block text-sm text-brand underline">
            Download label
          </a>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit log</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {order.logs.map((log) => (
            <li key={log.ts.seconds ?? log.entry}>
              <span className="font-mono text-xs text-slate-400">
                {new Date((log.ts.seconds ?? Date.now() / 1000) * 1000).toLocaleString()}
              </span>
              <span className="ml-2">{log.entry}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
