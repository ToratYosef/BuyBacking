'use client';

import { useGtag } from '@/lib/analytics';

export function Analytics() {
  useGtag({ measurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '' });
  return null;
}
