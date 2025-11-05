import Link from 'next/link';

export function CTA() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-500 px-6 py-14 text-white shadow-xl sm:px-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_60%)]" aria-hidden />
      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold md:text-4xl">Ship today. Get paid tomorrow.</h2>
          <p className="max-w-xl text-base text-white/80">
            We send you a pre-paid kit, diagnose your device the moment it arrives, and pay out via your preferred method.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sell#quote-form" className="btn-primary bg-white text-slate-900 hover:bg-slate-100">
            Create your quote
          </Link>
          <Link
            href="tel:+18882939319"
            className="inline-flex items-center justify-center rounded-full border border-white/70 px-6 py-3 text-base font-semibold text-white transition hover:border-white"
          >
            Call 888-293-9319
          </Link>
        </div>
      </div>
    </section>
  );
}
