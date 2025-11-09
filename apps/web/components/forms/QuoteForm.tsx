'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { QuoteResponse } from '../../lib/pricing';

export interface QuoteFormValues {
  deviceSlug: string;
  capacity: string;
  network: string;
  condition: string;
}

const conditions = ['Flawless', 'Good', 'Fair', 'Broken'];

export function QuoteForm({
  devices,
  onQuote,
}: {
  devices: Array<{ slug: string; name: string; capacities: string[]; networks: string[] }>;
  onQuote: (quote: QuoteResponse) => void;
}) {
  const [values, setValues] = useState<QuoteFormValues>({
    deviceSlug: devices[0]?.slug ?? '',
    capacity: devices[0]?.capacities[0] ?? '',
    network: devices[0]?.networks[0] ?? 'Unlocked',
    condition: conditions[0],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (slug && devices.some((device) => device.slug === slug)) {
      const device = devices.find((item) => item.slug === slug)!;
      setValues({
        deviceSlug: slug,
        capacity: device.capacities[0],
        network: device.networks[0],
        condition: conditions[0],
      });
    }
  }, [devices]);

  const selectedDevice = devices.find((device) => device.slug === values.deviceSlug) ?? devices[0];

  const quoteMutation = useMutation({
    mutationFn: async (formValues: QuoteFormValues) => {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }
      return (await response.json()) as QuoteResponse;
    },
    onSuccess: (quote, variables) => {
      window.localStorage.setItem('buybacking:lastQuote', JSON.stringify({ quote, selection: variables }));
      onQuote(quote);
    },
  });

  const updateField = (field: keyof QuoteFormValues, value: string) => {
    const next = { ...values, [field]: value } as QuoteFormValues;
    if (field === 'deviceSlug') {
      const device = devices.find((item) => item.slug === value);
      if (device) {
        next.capacity = device.capacities[0];
        next.network = device.networks[0];
      }
    }
    setValues(next);
  };

  return (
    <form
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        quoteMutation.mutate(values);
      }}
    >
      <div>
        <label className="text-sm font-medium text-slate-700">Device</label>
        <select
          value={values.deviceSlug}
          onChange={(event) => updateField('deviceSlug', event.target.value)}
          className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
        >
          {devices.map((device) => (
            <option key={device.slug} value={device.slug}>
              {device.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Capacity</label>
          <select
            value={values.capacity}
            onChange={(event) => updateField('capacity', event.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
          >
            {selectedDevice?.capacities.map((capacity) => (
              <option key={capacity} value={capacity}>
                {capacity}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Network</label>
          <select
            value={values.network}
            onChange={(event) => updateField('network', event.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 focus:border-brand focus:ring-brand"
          >
            {selectedDevice?.networks.map((network) => (
              <option key={network} value={network}>
                {network}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">Condition</label>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {conditions.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => updateField('condition', condition)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                values.condition === condition
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-slate-300 text-slate-600 hover:border-brand/50'
              }`}
            >
              {condition}
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        disabled={quoteMutation.isPending}
      >
        {quoteMutation.isPending ? 'Calculating…' : 'Get instant quote'}
      </button>
      {quoteMutation.isError && (
        <p className="text-sm text-red-600">Unable to fetch quote. Please try again.</p>
      )}
    </form>
  );
}
