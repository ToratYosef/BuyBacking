import Link from 'next/link';

export const metadata = {
  title: 'Admin | Pricing engine',
};

export default function PricingAdminPage() {
  const controls = [
    { label: 'Refresh competitor data', action: '/api/pricing/refresh', method: 'POST' },
    { label: 'View latest scrape logs', action: '#', method: 'GET' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Pricing engine</h2>
        <p className="text-sm text-slate-500">Adjust weights, rerun scrapers, and audit ingest history.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {controls.map((control) => (
          <form key={control.label} action={control.action} method={control.method} className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-semibold text-slate-900">{control.label}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {control.method === 'POST'
                ? 'Triggers a Firebase Function to scrape new price feeds and update devices.'
                : 'Coming soon: connect to BigQuery logs for scraper output review.'}
            </p>
            <button type="submit" className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
              {control.method === 'POST' ? 'Trigger' : 'Open logs'}
            </button>
          </form>
        ))}
      </div>
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Merchant weighting</h3>
        <p className="mt-2 text-sm text-slate-600">
          Manage the blend of SellCell feeds, direct merchant offers, and manual overrides. Configure JSON in Firestore under
          <code className="mx-1 rounded bg-slate-100 px-1">settings/pricing</code> and expose sliders here.
        </p>
        <Link href="https://firebase.google.com/docs/firestore" className="mt-3 inline-block text-sm text-brand underline">
          Read Firestore docs
        </Link>
      </section>
    </div>
  );
}
