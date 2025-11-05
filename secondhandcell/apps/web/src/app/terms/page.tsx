import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Terms governing SecondHandCell services, logistics, and payouts.',
  alternates: {
    canonical: 'https://secondhandcell.com/terms'
  }
};

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1>Terms &amp; Conditions</h1>
      <p>Last updated: October 1, 2024</p>
      <h2>Quotes &amp; inspections</h2>
      <p>
        Quotes are valid for 14 days. Devices are inspected upon arrival. If condition differs materially we will send an updated
        offer before proceeding.
      </p>
      <h2>Shipping</h2>
      <p>
        SecondHandCell provides insured labels or pickup through our logistics partners. You agree to package devices securely and
        remove any activation locks prior to shipping.
      </p>
      <h2>Payouts</h2>
      <p>
        Payments are issued within one business day after inspection via PayPal, Venmo, or ACH using the details provided in your
        quote request.
      </p>
      <h2>Contact</h2>
      <p>
        For questions email <a href="mailto:support@secondhandcell.com">support@secondhandcell.com</a>.
      </p>
    </article>
  );
}
