'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/sell', label: 'Sell Your Device' },
  { href: '/contact', label: 'Contact' }
];

export function NavBar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/40 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/assets/logo.png" alt="SecondHandCell" width={120} height={48} className="h-12 w-auto" />
          <div className="hidden flex-col leading-tight md:flex">
            <span className="text-lg font-semibold text-slate-900">SecondHandCell</span>
            <span className="text-sm font-medium text-brand-500">Turn your old phone into cash</span>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                pathname === link.href ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/sell#quote-form"
            className="ml-2 inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-700"
          >
            Get a Quote
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-700 md:hidden"
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
        >
          <span className="sr-only">Toggle menu</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>
      {isOpen ? (
        <div className="md:hidden">
          <nav className="mx-4 mb-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'block rounded-xl px-4 py-3 text-base font-medium',
                  pathname === link.href ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/sell#quote-form"
              className="block rounded-xl bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white"
              onClick={() => setIsOpen(false)}
            >
              Get a Quote
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
