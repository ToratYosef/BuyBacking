import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { Footer } from '@/components/Footer';
import { Analytics } from '@/components/Analytics';

const inter = Inter({ subsets: ['latin'] });

const siteUrl = 'https://secondhandcell.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'SecondHandCell — Turn Your Old Phone Into Cash',
    template: '%s | SecondHandCell'
  },
  description:
    'Sell your phone to SecondHandCell for instant quotes, free insured shipping, and payouts within 24 hours.',
  openGraph: {
    title: 'SecondHandCell',
    description:
      'Sell your phone to SecondHandCell for instant quotes, free insured shipping, and payouts within 24 hours.',
    url: siteUrl,
    siteName: 'SecondHandCell',
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SecondHandCell',
    description:
      'Sell your phone to SecondHandCell for instant quotes, free insured shipping, and payouts within 24 hours.'
  },
  alternates: {
    canonical: siteUrl
  },
  icons: {
    icon: '/favicon/favicon.ico'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-slate-950">
      <body className={`${inter.className} flex min-h-screen flex-col bg-slate-50`}>
        <NavBar />
        <main className="flex-1 bg-slate-50">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-16 md:px-6">
            {children}
          </div>
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
