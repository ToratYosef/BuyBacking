'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { QuoteFormAction, QuoteFormState } from '@/types/forms';

const initialState: QuoteFormState = { status: 'idle' };

function SubmitQuoteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? 'Submitting…' : 'Get my offer'}
    </button>
  );
}

export function QuoteForm({ action }: { action: QuoteFormAction }) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form id="quote-form" action={formAction} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Your name
          <input
            name="name"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="Jane Doe"
            autoComplete="name"
          />
          {state.errors?.name ? <span className="text-sm text-red-600">{state.errors.name}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Email
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="you@example.com"
            autoComplete="email"
          />
          {state.errors?.email ? <span className="text-sm text-red-600">{state.errors.email}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Phone number
          <input
            name="phone"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="(555) 123-4567"
            autoComplete="tel"
          />
          {state.errors?.phone ? <span className="text-sm text-red-600">{state.errors.phone}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Device
          <input
            name="deviceSlug"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="iPhone 15 Pro Max"
          />
          {state.errors?.deviceSlug ? <span className="text-sm text-red-600">{state.errors.deviceSlug}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Storage
          <select
            name="storage"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            defaultValue=""
          >
            <option value="" disabled>
              Choose storage
            </option>
            <option value="64GB">64GB</option>
            <option value="128GB">128GB</option>
            <option value="256GB">256GB</option>
            <option value="512GB">512GB</option>
            <option value="1TB">1TB</option>
          </select>
          {state.errors?.storage ? <span className="text-sm text-red-600">{state.errors.storage}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Carrier
          <select
            name="carrier"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            defaultValue=""
          >
            <option value="" disabled>
              Select carrier
            </option>
            <option value="unlocked">Unlocked</option>
            <option value="att">AT&amp;T</option>
            <option value="verizon">Verizon</option>
            <option value="tmobile">T-Mobile</option>
            <option value="other">Other</option>
          </select>
          {state.errors?.carrier ? <span className="text-sm text-red-600">{state.errors.carrier}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Condition
          <select
            name="condition"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            defaultValue=""
          >
            <option value="" disabled>
              Select condition
            </option>
            <option value="mint">Mint</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="faulty">Faulty</option>
          </select>
          {state.errors?.condition ? <span className="text-sm text-red-600">{state.errors.condition}</span> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Payout method
          <select
            name="payoutMethod"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            defaultValue=""
          >
            <option value="" disabled>
              Choose payout method
            </option>
            <option value="paypal">PayPal</option>
            <option value="venmo">Venmo</option>
            <option value="ach">Bank transfer</option>
          </select>
          {state.errors?.payoutMethod ? <span className="text-sm text-red-600">{state.errors.payoutMethod}</span> : null}
        </label>
      </div>
      <label className="space-y-1 text-sm font-medium text-slate-600">
        Additional notes
        <textarea
          name="notes"
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="Share IMEI, cosmetic details, or accessories included"
        />
      </label>
      {state.status === 'success' ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Quote submitted! Reference ID: <span className="font-semibold">{state.id}</span>
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{state.message ?? 'There was a problem saving your quote.'}</p>
      ) : null}
      <SubmitQuoteButton />
    </form>
  );
}
