import * as functions from 'firebase-functions/v2/https';
import cors from 'cors';
import express from 'express';
import { adminDb } from './admin';
import { contactPayloadSchema, quotePayloadSchema } from './schema';
import type { QuotePayload, ContactPayload } from './schema';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/createQuote', async (req, res) => {
  const parse = quotePayloadSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parse.error.flatten().fieldErrors });
  }

  const payload: QuotePayload = parse.data;
  const doc = await adminDb.collection('quotes').add({
    ...payload,
    price: 0,
    createdAt: Date.now()
  });

  return res.status(201).json({ id: doc.id });
});

app.post('/contactMessage', async (req, res) => {
  const parse = contactPayloadSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parse.error.flatten().fieldErrors });
  }

  const payload: ContactPayload = parse.data;
  const doc = await adminDb.collection('contactMessages').add({
    ...payload,
    createdAt: Date.now()
  });

  return res.status(201).json({ id: doc.id });
});

export const api = functions.onRequest({ region: 'us-central1', cors: true }, app);
