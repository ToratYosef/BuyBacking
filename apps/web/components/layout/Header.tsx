import Link from 'next/link';
import { Suspense } from 'react';
import { UserMenu } from './UserMenu';

const navigation = [
  { href: '/sell', label: 'Sell' },
  { href: '/device/iphone-15-pro', label: 'Devices' },
  { href: '/cart', label: 'Cart' },
  { href: '/admin', label: 'Admin' },
];

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-semibold text-slate-900">
          BuyBacking
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-brand">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded bg-slate-100" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
