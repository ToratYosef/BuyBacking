import Link from 'next/link';
import { OrderDoc } from '../../lib/types';

export function OrdersTable({ orders }: { orders: OrderDoc[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Order</th>
            <th className="px-4 py-3 text-left">Device</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Payment</th>
            <th className="px-4 py-3 text-right">Offered</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="px-4 py-3 font-medium text-slate-900">{order.id}</td>
              <td className="px-4 py-3 text-slate-600">
                {order.device.slug}
                <div className="text-xs text-slate-400">
                  {order.device.capacity} · {order.device.network}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                  {order.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{order.payment.status}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">${order.priceOffered.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/orders/${order.id}`} className="text-brand underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
