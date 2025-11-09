import { QuoteBuilder } from '../../components/forms/QuoteBuilder';
import devices from '../../samples/devices.sample.json';

export const metadata = {
  title: 'Sell your device | BuyBacking',
};

export default function SellPage() {
  const deviceOptions = devices.map((device) => ({
    slug: device.slug,
    name: `${device.brand} ${device.model}`,
    capacities: device.capacities,
    networks: device.networks,
  }));

  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-6xl space-y-10 px-6">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">Trade in your device</h1>
          <p className="mt-2 text-slate-600">
            Select your device, condition, and carrier to receive instant buyback offers backed by our
            pricing engine.
          </p>
        </header>
        <QuoteBuilder devices={deviceOptions} />
      </div>
    </section>
  );
}
