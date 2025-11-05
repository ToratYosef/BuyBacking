import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import type { ContactFormState } from '@/types/forms';
import { contactSchema } from '@/lib/schemas';

export const metadata: Metadata = {
  title: 'Contact SecondHandCell',
  description: 'Reach the SecondHandCell support team for quotes, logistics, and payout questions.',
  alternates: {
    canonical: 'https://secondhandcell.com/contact'
  }
};

async function submitContact(_: ContactFormState, formData: FormData): Promise<ContactFormState> {
  'use server';

  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message')
  });

  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0] ?? 'form', issue.message]));
    return { status: 'error', errors: errors as ContactFormState['errors'] };
  }

  const url = process.env.FUNCTIONS_URL;
  if (!url) {
    return {
      status: 'error',
      message: 'Contact form is unavailable right now. Please email hello@secondhandcell.com.'
    };
  }

  const response = await fetch(`${url}/contactMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      status: 'error',
      message: body?.message ?? 'We could not send your message. Please try again later.'
    };
  }

  return { status: 'success', message: 'Message sent' };
}

export default function ContactPage() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <h1 className="section-heading">Talk to our concierge team</h1>
        <p className="section-subheading max-w-2xl">
          Have a collection to sell or questions about a quote? Reach out and a specialist will respond within one business day.
        </p>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Email us at <a href="mailto:hello@secondhandcell.com">hello@secondhandcell.com</a> or call <a href="tel:+18882939319">888-293-9319</a>.
          </p>
          <p className="mt-2 text-sm text-slate-600">Our support hours are Monday–Friday, 9am–6pm ET.</p>
        </div>
      </div>
      <ContactForm action={submitContact} />
    </div>
  );
}
