'use client';

import Link from 'next/link';
import { useAuthState, emailPasswordSignIn, signOutUser } from '../../lib/auth';
import { useEffect, useState } from 'react';
import { OrderDoc } from '../../lib/types';

export default function AccountHomePage() {
  const { user, loading } = useAuthState();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    fetch('/api/orders?mine=1')
      .then((res) => res.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch((err) => setError(err.message));
  }, [user]);

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <p className="text-slate-600">Sign in to view your trade-in history.</p>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const email = (form.elements.namedItem('email') as HTMLInputElement).value;
            const password = (form.elements.namedItem('password') as HTMLInputElement).value;
            try {
              await emailPasswordSignIn(email, password);
            } catch (err) {
              setError('Sign-in failed');
            }
          }}
        >
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            className="block w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="block w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-slate-600">Signed in as {user.email}</p>
        <button className="text-sm text-brand underline" onClick={() => signOutUser()}>
          Sign out
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-3">
        {orders.length === 0 && <p className="text-slate-500">No orders found yet.</p>}
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">Order {order.id}</p>
                <p className="text-sm text-slate-500">Status: {order.status}</p>
              </div>
              <Link href={`/account/orders/${order.id}`} className="text-sm text-brand underline">
                View details
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
