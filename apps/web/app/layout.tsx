import type { Metadata } from 'next';
import { ReactNode } from 'react';
import '../styles/globals.css';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { Providers } from '../components/layout/Providers';

export const metadata: Metadata = {
  title: 'BuyBacking – Device Trade-in Platform',
  description:
    'Get instant quotes, shipping kits, and payouts for your used devices. Manage operations with the integrated admin portal.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
