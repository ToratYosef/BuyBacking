import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About SecondHandCell',
  description:
    'Learn how SecondHandCell delivers transparent phone trade-in experiences with concierge logistics and verified payouts.',
  alternates: {
    canonical: 'https://secondhandcell.com/about'
  }
};

const milestones = [
  {
    year: '2017',
    title: 'SecondHandCell launches',
    description: 'We started with a simple mission: give people a smarter, safer way to sell their phones.'
  },
  {
    year: '2019',
    title: 'Nationwide coverage',
    description: 'Expanded our concierge shipping programme to cover the entire continental United States.'
  },
  {
    year: '2022',
    title: '50k devices processed',
    description: 'Our diagnostics lab certified tens of thousands of devices with industry-leading accuracy.'
  }
];

const values = [
  {
    title: 'Transparent offers',
    description: 'Every quote is itemised, guaranteed for 14 days, and backed by a 30-point inspection.'
  },
  {
    title: 'Sustainable reuse',
    description: 'We extend the life of electronics and responsibly recycle any components beyond repair.'
  },
  {
    title: 'Customer-first support',
    description: 'Concierge specialists provide door-to-door updates through every step of your sale.'
  }
];

export default function AboutPage() {
  return (
    <div className="space-y-16">
      <section className="space-y-6">
        <h1 className="section-heading">Our story</h1>
        <p className="text-base text-slate-600 md:text-lg">
          SecondHandCell was founded by device refurbishing veterans who knew selling your phone should feel as premium as buying a
          new one. We combine expert diagnostics, insured logistics, and fast payouts so you can trade-in with confidence.
        </p>
        <p className="text-base text-slate-600 md:text-lg">
          Our team partners with trusted recyclers and repair specialists to ensure every device gets a second life or is recycled
          responsibly. From cracked screens to pristine flagships, we handle each device with respect for both the customer and the
          planet.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {milestones.map((milestone) => (
          <div key={milestone.year} className="card-surface bg-white/90">
            <span className="text-sm font-semibold uppercase tracking-wide text-brand-500">{milestone.year}</span>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{milestone.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{milestone.description}</p>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="section-heading">What we value</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {values.map((value) => (
            <div key={value.title} className="card-surface bg-white/90">
              <h3 className="text-xl font-semibold text-slate-900">{value.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{value.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
