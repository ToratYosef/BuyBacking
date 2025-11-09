'use client';

import { useState } from 'react';
import { QuoteForm } from './QuoteForm';
import { QuoteSummary } from '../pricing/QuoteSummary';
import { QuoteResponse } from '../../lib/pricing';

interface DeviceOption {
  slug: string;
  name: string;
  capacities: string[];
  networks: string[];
}

export function QuoteBuilder({ devices }: { devices: DeviceOption[] }) {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <QuoteForm devices={devices} onQuote={(response) => setQuote(response)} />
      <QuoteSummary quote={quote} />
    </div>
  );
}
