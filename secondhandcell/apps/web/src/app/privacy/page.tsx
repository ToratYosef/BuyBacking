import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Understand how SecondHandCell collects, uses, and protects your information.',
  alternates: {
    canonical: 'https://secondhandcell.com/privacy'
  }
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1>Privacy Policy</h1>
      <p>Last updated: October 1, 2024</p>
      <p>
        We only collect the information necessary to provide quotes, logistics, and payments. This includes your contact details,
        device information, and transaction history. We never sell data to third parties.
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li>Contact details provided when requesting a quote or contacting support.</li>
        <li>Device information for valuation and diagnostic purposes.</li>
        <li>Shipping and payout information to complete each transaction.</li>
      </ul>
      <h2>How we use your information</h2>
      <p>
        Data is used to provide customer service, generate quotes, arrange shipping, pay you quickly, and comply with anti-fraud
        requirements. Access is limited to verified employees and trusted logistics partners.
      </p>
      <h2>Contact</h2>
      <p>
        Email <a href="mailto:privacy@secondhandcell.com">privacy@secondhandcell.com</a> with any questions or requests related to your personal data.
      </p>
    </article>
  );
}
