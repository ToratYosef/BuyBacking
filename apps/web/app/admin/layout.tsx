import { ReactNode } from 'react';
import Link from 'next/link';
import { assertRole, HttpError } from '../../lib/assertRole';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await assertRole('admin');
  } catch (error) {
    if (error instanceof HttpError) {
      redirect('/account');
    }
    throw error;
  }

  const links = [
    { href: '/admin', label: 'Orders' },
    { href: '/admin/pricing', label: 'Pricing engine' },
    { href: '/admin/settings', label: 'Settings' },
  ];

  return (
    <div className="bg-slate-900/95">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 text-white">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-300">Admin console</p>
            <h1 className="text-3xl font-semibold">BuyBacking operations</h1>
          </div>
          <Link href="/" className="text-sm text-slate-300 underline">
            Return to site
          </Link>
        </header>
        <nav className="flex flex-wrap gap-4 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full bg-white/10 px-4 py-2 font-medium">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-xl">{children}</div>
      </div>
    </div>
  );
}
