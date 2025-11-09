const partners = ['TechCrunch', 'GadgetFlow', 'MacRumors', 'Android Central', 'Bloomberg Tech'];

export function TrustSignals() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-12">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-6 px-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
        {partners.map((partner) => (
          <span key={partner}>{partner}</span>
        ))}
      </div>
    </section>
  );
}
