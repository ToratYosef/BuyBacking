import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Reviews & Trust',
  description: 'See what customers say about selling their phones to SecondHandCell.',
  alternates: {
    canonical: 'https://secondhandcell.com/trust'
  }
};

const reviewSources = [
  {
    name: 'Google Reviews',
    description: 'Read public customer experiences on Google.',
    href: 'https://search.google.com/local/reviews?placeid=YOUR_GOOGLE_PLACE_ID',
    image: '/assets/google.webp',
    accent: 'bg-sky-100 text-sky-600'
  },
  {
    name: 'Trustpilot',
    description: 'Thousands of reviews from verified sellers.',
    href: 'https://www.trustpilot.com/review/secondhandcell.com',
    image: '/assets/logo.png',
    accent: 'bg-emerald-100 text-emerald-600'
  },
  {
    name: 'Yelp',
    description: 'Community feedback from local sellers.',
    href: 'https://www.yelp.com/writeareview/biz/KWMxMMypF1yAfwH1rdKgJw',
    image: '/assets/apple.png',
    accent: 'bg-rose-100 text-rose-600'
  }
];

export default function TrustPage() {
  return (
    <div className="space-y-10 rounded-3xl bg-slate-900 p-10 text-white shadow-2xl">
      <section className="space-y-4">
        <h1 className="section-heading text-white">Trusted by thousands of sellers</h1>
        <p className="section-subheading max-w-3xl text-slate-200">
          We pair concierge service with transparent pricing. Explore independent review platforms to see how consistent payouts and
          speedy logistics make sellers recommend us to friends and family.
        </p>
      </section>
      <div className="grid gap-6 md:grid-cols-3">
        {reviewSources.map((source) => (
          <Link
            key={source.name}
            href={source.href}
            target="_blank"
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-6 text-white shadow-xl backdrop-blur transition hover:-translate-y-1 hover:bg-white/20"
          >
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${source.accent}`}>
              <Image src={source.image} alt={source.name} width={32} height={32} className="h-8 w-8 object-contain" />
            </div>
            <h2 className="text-xl font-semibold">{source.name}</h2>
            <p className="mt-2 text-sm text-slate-100/90">{source.description}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white">
              View reviews
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
