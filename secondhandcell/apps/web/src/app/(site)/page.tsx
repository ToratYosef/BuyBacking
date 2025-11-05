import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { FeatureGrid } from '@/components/FeatureGrid';
import { CTA } from '@/components/CTA';
import { DeviceCard } from '@/components/DeviceCard';

const devices = [
  {
    title: 'Sell your iPhone',
    description: 'From iPhone 11 to iPhone 15 Pro Max, get a transparent offer backed by diagnostics.',
    image: '/assets/i15pm.webp',
    href: '/sell?device=iphone'
  },
  {
    title: 'Sell your Samsung',
    description: 'Galaxy S and Z Series payouts with lightning fast processing.',
    image: '/assets/google.webp',
    href: '/sell?device=samsung'
  },
  {
    title: 'Sell your iPad',
    description: 'iPad Pro, Air, and Mini models welcome with optional accessories.',
    image: '/assets/ipad.svg',
    href: '/sell?device=ipad'
  }
];

export const metadata: Metadata = {
  title: 'Turn Your Old Phone Into Cash',
  description:
    'SecondHandCell offers instant quotes, free insured shipping, and 24 hour payouts for iPhone, Samsung, and more.',
  alternates: {
    canonical: 'https://secondhandcell.com/'
  }
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <section className="space-y-6">
        <div className="space-y-3 text-center">
          <h2 className="section-heading">Why sellers love SecondHandCell</h2>
          <p className="section-subheading mx-auto max-w-2xl">
            We blend concierge-style service with transparent pricing so you can upgrade without the headaches.
          </p>
        </div>
        <FeatureGrid />
      </section>
      <section className="space-y-6">
        <div className="space-y-3 text-center">
          <h2 className="section-heading">Popular devices we buy</h2>
          <p className="section-subheading mx-auto max-w-2xl">
            Start with one of our most requested categories or search for your exact model on the sell page.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.title} {...device} />
          ))}
        </div>
      </section>
      <CTA />
    </>
  );
}
