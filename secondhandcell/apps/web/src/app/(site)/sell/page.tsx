import type { Metadata } from 'next';
import { QuoteForm } from '@/components/QuoteForm';
import type { QuoteFormState } from '@/types/forms';
import { quoteSchema } from '@/lib/schemas';

export const metadata: Metadata = {
  title: 'Sell Your Phone',
  description:
    'Lock in a guaranteed quote for your iPhone, Samsung, or tablet. Free insured shipping and 24 hour payouts.',
  alternates: {
    canonical: 'https://secondhandcell.com/sell'
  }
};

async function submitQuote(_: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  'use server';

  const parsed = quoteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    deviceSlug: formData.get('deviceSlug'),
    storage: formData.get('storage'),
    condition: formData.get('condition'),
    carrier: formData.get('carrier'),
    payoutMethod: formData.get('payoutMethod'),
    notes: formData.get('notes') || undefined
  });

  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0] ?? 'form', issue.message]));
    return {
      status: 'error',
      errors: errors as QuoteFormState['errors'],
      message: 'Please correct the highlighted fields.'
    };
  }

  const url = process.env.FUNCTIONS_URL;
  if (!url) {
    return {
      status: 'error',
      message: 'Quote service unavailable. Email hello@secondhandcell.com and we will help manually.'
    };
  }

  const response = await fetch(`${url}/createQuote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      status: 'error',
      message: body?.message ?? 'We could not save your quote. Please try again.'
    };
  }

  const result = (await response.json().catch(() => null)) as { id?: string } | null;
  return {
    status: 'success',
    id: result?.id ?? 'pending',
    message: 'Quote submitted successfully.'
  };
}

const steps = [
  {
    title: 'Tell us about your device',
    body: 'Share the model, storage, carrier, and condition so we can lock in accurate pricing.'
  },
  {
    title: 'Ship with our insured kit',
    body: 'We email a prepaid label or send a secure kit with insurance for the full value.'
  },
  {
    title: 'Get paid in 24 hours',
    body: 'After diagnostics are complete, payouts are issued via your chosen method.'
  }
];

export default function SellPage() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="section-heading">Sell your device in three easy steps</h1>
        <p className="section-subheading max-w-2xl">
          Fill out the form to receive a guaranteed quote. We&apos;ll send a prepaid kit and pay you within one business day of verification.
        </p>
      </section>
      <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <QuoteForm action={submitQuote} />
        </div>
        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-xl font-semibold text-slate-900">How it works</h2>
            <ol className="mt-4 space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                    <p className="text-sm text-slate-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-lg" id="faq">
            <h2 className="text-xl font-semibold">Questions?</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              <li>Free, insured shipping is included for every device.</li>
              <li>Diagnostics are recorded on video for transparency.</li>
              <li>Need bulk pricing? Email <a className="underline" href="mailto:wholesale@secondhandcell.com">wholesale@secondhandcell.com</a>.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
