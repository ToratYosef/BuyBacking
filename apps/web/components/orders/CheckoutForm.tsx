'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { QuoteResponse } from '../../lib/pricing';
import { QuoteFormValues } from '../forms/QuoteForm';

interface CheckoutPayload {
  email: string;
  shippingMethod: 'kit' | 'label';
  paymentProvider: 'stripe' | 'paypal';
}

export default function CheckoutForm() {
  const [payload, setPayload] = useState<CheckoutPayload>({
    email: '',
    shippingMethod: 'kit',
    paymentProvider: 'stripe',
  });
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [selection, setSelection] = useState<QuoteFormValues | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('buybacking:lastQuote');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { quote: QuoteResponse; selection: QuoteFormValues };
        setQuote(parsed.quote);
        setSelection(parsed.selection);
      } catch (error) {
        console.warn('Failed to parse stored quote', error);
      }
    }
  }, []);

  const orderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: payload.email,
          shippingMethod: payload.shippingMethod,
          paymentProvider: payload.paymentProvider,
          quote,
          selection,
        }),
      });
      if (!response.ok) {
        throw new Error('Order creation failed');
      }
      return response.json() as Promise<{ orderNumber: string; paymentClientSecret?: string }>;
    },
    onSuccess: (data) => {
      setOrderId(data.orderNumber);
    },
  });

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className="text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
          value={payload.email}
          onChange={(event) => setPayload((prev) => ({ ...prev, email: event.target.value }))}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Shipping</label>
          <select
            className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
            value={payload.shippingMethod}
            onChange={(event) =>
              setPayload((prev) => ({ ...prev, shippingMethod: event.target.value as CheckoutPayload['shippingMethod'] }))
            }
          >
            <option value="kit">Send me a shipping kit</option>
            <option value="label">I will print my own label</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Payment</label>
          <select
            className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
            value={payload.paymentProvider}
            onChange={(event) =>
              setPayload((prev) => ({ ...prev, paymentProvider: event.target.value as CheckoutPayload['paymentProvider'] }))
            }
          >
            <option value="stripe">Stripe (ACH / Cards)</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>
      </div>
      {quote ? (
        <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Preparing to submit <span className="font-semibold">{selection?.deviceSlug}</span> for ${quote.bestPrice}.
        </div>
      ) : (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Add a quote from the sell flow to prefill checkout information.
        </div>
      )}
      <button
        type="button"
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => orderMutation.mutate()}
        disabled={orderMutation.isPending}
      >
        {orderMutation.isPending ? 'Submitting…' : 'Submit trade-in order'}
      </button>
      {orderId && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Order <span className="font-semibold">{orderId}</span> created! Check your email for the shipping instructions.
        </p>
      )}
      {orderMutation.isError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">Unable to create order. Please try again.</p>
      )}
    </div>
  );
}
