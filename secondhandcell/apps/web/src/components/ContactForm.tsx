'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ContactFormAction, ContactFormState } from '@/types/forms';

const initialState: ContactFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-primary w-full sm:w-auto"
      disabled={pending}
    >
      {pending ? 'Sending…' : 'Send message'}
    </button>
  );
}

export function ContactForm({ action }: { action: ContactFormAction }) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Name
          <input
            name="name"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="Jane Doe"
          />
          {state.errors?.name ? <p className="text-sm text-red-600">{state.errors.name}</p> : null}
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-600">
          Email
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="you@example.com"
          />
          {state.errors?.email ? <p className="text-sm text-red-600">{state.errors.email}</p> : null}
        </label>
      </div>
      <label className="space-y-1 text-sm font-medium text-slate-600">
        How can we help?
        <textarea
          name="message"
          required
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="Tell us about your device or question."
        />
        {state.errors?.message ? <p className="text-sm text-red-600">{state.errors.message}</p> : null}
      </label>
      {state.status === 'success' ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Thank you! We will reply within one business day.</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{state.message ?? 'Something went wrong. Please try again.'}</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
