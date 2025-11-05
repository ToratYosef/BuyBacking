import { z } from 'zod';

export const quotePayloadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  deviceSlug: z.string().min(2),
  storage: z.string().min(1),
  condition: z.enum(['mint', 'good', 'fair', 'poor', 'faulty']),
  carrier: z.string().min(2),
  payoutMethod: z.enum(['paypal', 'venmo', 'ach']),
  notes: z.string().max(500).optional()
});

export const contactPayloadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10).max(1000)
});

export type QuotePayload = z.infer<typeof quotePayloadSchema>;
export type ContactPayload = z.infer<typeof contactPayloadSchema>;
