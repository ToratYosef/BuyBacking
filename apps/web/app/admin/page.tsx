import ordersSample from '../../samples/orders.sample.json';
import { OrdersTable } from '../../components/admin/OrdersTable';
import { adminDb } from '../../lib/firebaseAdmin';
import { OrderDoc } from '../../lib/types';

export const metadata = {
  title: 'Admin | Orders',
};

export default async function AdminOrdersPage() {
  let orders: OrderDoc[] = ordersSample as unknown as OrderDoc[];

  try {
    const snapshot = await adminDb().collection('orders').orderBy('createdAt', 'desc').limit(50).get();
    if (!snapshot.empty) {
      orders = snapshot.docs.map((doc) => doc.data() as OrderDoc);
    }
  } catch (error) {
    console.warn('Falling back to sample orders', error);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Orders</h2>
          <p className="text-sm text-slate-500">Review incoming kits, update payouts, and manage shipping.</p>
        </div>
        <form action="/api/admin/exports/csv" method="get">
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" type="submit">
            Export CSV
          </button>
        </form>
      </header>
      <OrdersTable orders={orders} />
    </div>
  );
}
