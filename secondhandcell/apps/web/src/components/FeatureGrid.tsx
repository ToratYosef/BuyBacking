const features = [
  {
    title: 'Instant valuations',
    description: 'Get an on-the-spot price for your device with no haggling or hidden fees.',
    icon: '⚡️'
  },
  {
    title: 'Free insured shipping',
    description: 'We send you a pre-paid label or arrange a doorstep pickup that is fully insured.',
    icon: '📦'
  },
  {
    title: '24 hour payouts',
    description: 'Once your phone passes our inspection, payments are issued within one business day.',
    icon: '💳'
  },
  {
    title: 'Expert diagnostics',
    description: 'Certified technicians run a 30-point device check so you earn the highest value.',
    icon: '🔍'
  }
];

export function FeatureGrid() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/80 px-6 py-14 shadow-xl backdrop-blur md:px-12">
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2">
        {features.map((feature) => (
          <div key={feature.title} className="card-surface flex flex-col gap-3 bg-white/90">
            <span className="text-3xl" aria-hidden>
              {feature.icon}
            </span>
            <h3 className="text-xl font-semibold text-slate-900">{feature.title}</h3>
            <p className="text-sm text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
