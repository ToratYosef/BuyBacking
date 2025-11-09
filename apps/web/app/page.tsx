import Link from 'next/link';
import { DeviceHighlights } from '../components/marketing/DeviceHighlights';
import { TrustSignals } from '../components/marketing/TrustSignals';
import { FaqAccordion } from '../components/marketing/FaqAccordion';

export default function HomePage() {
  return (
    <div className="bg-white">
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 lg:flex lg:items-center lg:gap-12">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
            Fast, trusted trade-ins
          </p>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Sell devices instantly and manage your logistics in one unified platform.
          </h1>
          <p className="mt-6 text-lg text-slate-600">
            BuyBacking delivers instant pricing, ready-to-ship kits, and an operations-ready admin
            workspace so your team can scale device trade-ins without friction.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="rounded-md bg-brand px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              Get a quote
            </Link>
            <Link
              href="/admin"
              className="rounded-md border border-brand px-6 py-3 text-base font-semibold text-brand transition hover:bg-brand/5"
            >
              Explore admin tools
            </Link>
          </div>
        </div>
        <div className="mt-12 flex-1 lg:mt-0">
          <DeviceHighlights />
        </div>
      </section>
      <TrustSignals />
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Pricing engine</h2>
            <p className="mt-3 text-slate-600">
              Aggregated buyback data from SellCell, wholesalers, and proprietary scrapers keeps your
              offers competitive.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Shipping automation</h2>
            <p className="mt-3 text-slate-600">
              Connect ShipEngine and ShipStation accounts to produce kits, void labels, and track
              returns directly from the dashboard.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Payment flexibility</h2>
            <p className="mt-3 text-slate-600">
              Stripe and PayPal Smart Buttons give consumers instant payouts while wholesale
              partners leverage invoicing workflows.
            </p>
          </div>
        </div>
      </section>
      <FaqAccordion />
    </div>
  );
}
