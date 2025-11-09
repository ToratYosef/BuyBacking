import { notFound } from 'next/navigation';
import devices from '../../../samples/devices.sample.json';
import Link from 'next/link';

interface Params {
  params: { slug: string };
}

export async function generateStaticParams() {
  return devices.map((device) => ({ slug: device.slug }));
}

export default function DeviceDetailPage({ params }: Params) {
  const device = devices.find((item) => item.slug === params.slug);
  if (!device) {
    notFound();
  }

  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-5xl space-y-10 px-6">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">
            {device.brand} {device.model}
          </h1>
          <p className="mt-2 text-slate-600">Compare partner offers and review full specifications.</p>
        </header>
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={device.images[0]} alt={`${device.model} hero`} className="h-full w-full object-cover" />
            </div>
            <Link
              href={`/sell?slug=${device.slug}`}
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Get instant quote
            </Link>
          </div>
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Specifications</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                {Object.entries(device.specs).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-medium text-slate-500">{key}</dt>
                    <dd className="text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Merchant comparisons</h2>
              <table className="mt-4 w-full text-left text-sm text-slate-600">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="pb-2 font-medium">Merchant</th>
                    <th className="pb-2 font-medium">Offer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(device.listings ?? {}).map(([merchant, price]) => (
                    <tr key={merchant}>
                      <td className="py-3 font-medium text-slate-700">{device.merchantNames?.[merchant] ?? merchant}</td>
                      <td className="py-3 text-slate-900">${Number(price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
