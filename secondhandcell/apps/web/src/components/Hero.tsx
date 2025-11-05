import Image from 'next/image';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-16 text-white shadow-2xl sm:px-12">
      <div className="absolute inset-0 gradient-bg opacity-60" aria-hidden />
      <div className="relative z-10 grid gap-12 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
            Trusted by thousands of sellers
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Turn your old phone into cash in as little as 24 hours
          </h1>
          <p className="max-w-xl text-lg text-slate-200">
            Get an instant quote, free insured shipping, and fast payment. We specialise in premium devices and make selling your
            tech effortless.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sell#quote-form" className="btn-primary bg-brand-500 text-white hover:bg-brand-600">
              Start your quote
            </Link>
            <Link
              href="/trust"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:border-white/50"
            >
              Read reviews
            </Link>
          </div>
        </div>
        <div className="relative isolate flex items-center justify-center">
          <div className="absolute -left-16 h-56 w-56 rounded-full bg-brand-500/40 blur-3xl" aria-hidden />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/40 blur-3xl" aria-hidden />
          <div className="relative rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur">
            <Image
              src="/assets/bg.png"
              alt="Phones"
              width={360}
              height={360}
              priority
              className="h-auto w-[220px] sm:w-[280px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
