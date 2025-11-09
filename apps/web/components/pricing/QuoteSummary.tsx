import { QuoteResponse } from '../../lib/pricing';

export function QuoteSummary({ quote }: { quote: QuoteResponse | null }) {
  if (!quote) {
    return (
      <div className="rounded-2xl border border-dashed border-brand bg-brand/5 p-6 text-center text-slate-600">
        Run a quote to preview instant offers and shipping options.
      </div>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Top offer</h3>
        <p className="mt-2 text-4xl font-bold text-brand">${quote.bestPrice}</p>
        <p className="mt-1 text-sm text-slate-500">{quote.currency} payout estimate</p>
      </div>
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Breakdown</h4>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li className="flex justify-between">
            <span>Base price</span>
            <span>${quote.breakdown.basePrice.toFixed(2)}</span>
          </li>
          {quote.breakdown.adjustments.map((adjustment) => (
            <li key={adjustment.label} className="flex justify-between">
              <span>{adjustment.label}</span>
              <span>${adjustment.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Merchant offers</h4>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {quote.merchantOffers.length === 0 && <li>No partner offers available yet.</li>}
          {quote.merchantOffers.map((offer) => (
            <li key={offer.merchantId} className="flex items-center justify-between">
              <span>{offer.merchantName}</span>
              <span className="font-medium text-slate-900">${offer.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
