const features = [
  {
    title: 'Instant valuation',
    description:
      'Surface best market prices in seconds with automated competitor comparisons and adjustable margins.',
  },
  {
    title: 'Frictionless logistics',
    description:
      'Trigger prepaid shipping kits, print-on-demand labels, and address validation with a single click.',
  },
  {
    title: 'Audit-ready ops',
    description:
      'Centralized audit logs, SLA tracking, and dispute workflows keep compliance teams confident.',
  },
];

export function DeviceHighlights() {
  return (
    <dl className="grid gap-6 rounded-2xl bg-slate-900 px-6 py-8 text-white shadow-2xl md:grid-cols-3">
      {features.map((feature) => (
        <div key={feature.title}>
          <dt className="text-lg font-semibold">{feature.title}</dt>
          <dd className="mt-2 text-sm text-slate-200">{feature.description}</dd>
        </div>
      ))}
    </dl>
  );
}
