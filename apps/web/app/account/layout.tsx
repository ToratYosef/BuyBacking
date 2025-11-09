import { ReactNode } from 'react';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-5xl space-y-10 px-6">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">Your account</h1>
          <p className="mt-2 text-slate-600">Track trade-ins, download labels, and manage payout preferences.</p>
        </header>
        {children}
      </div>
    </section>
  );
}
