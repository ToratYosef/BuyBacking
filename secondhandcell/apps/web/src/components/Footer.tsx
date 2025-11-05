import Link from 'next/link';
import Image from 'next/image';

const footerLinks = [
  {
    title: 'Company',
    items: [
      { href: '/about', label: 'About' },
      { href: '/sell', label: 'Sell Your Device' },
      { href: '/contact', label: 'Contact' }
    ]
  },
  {
    title: 'Support',
    items: [
      { href: '/sell#faq', label: 'FAQ' },
      { href: 'https://www.trustpilot.com/review/secondhandcell.com', label: 'Trustpilot', external: true },
      { href: 'mailto:hello@secondhandcell.com', label: 'Email Us', external: true }
    ]
  }
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white/80">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4 md:max-w-sm">
            <Image src="/assets/logo.png" alt="SecondHandCell" width={140} height={56} className="h-14 w-auto" />
            <p className="text-sm text-slate-500">
              SecondHandCell provides transparent, instant quotes for your gently used phones and tablets. We handle secure pickup,
              fast testing, and lightning-quick payouts.
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>© {new Date().getFullYear()} SecondHandCell</span>
              <span>•</span>
              <Link href="/privacy" className="hover:text-brand-500">
                Privacy
              </Link>
              <span>•</span>
              <Link href="/terms" className="hover:text-brand-500">
                Terms
              </Link>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-8 sm:grid-cols-2">
            {footerLinks.map((section) => (
              <div key={section.title} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      {item.external ? (
                        <a
                          href={item.href}
                          className="text-sm text-slate-600 transition hover:text-brand-500"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link href={item.href} className="text-sm text-slate-600 transition hover:text-brand-500">
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
