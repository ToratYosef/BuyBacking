import { adminDb } from './firebaseAdmin';

export interface QuoteRequest {
  deviceSlug: string;
  capacity: string;
  network: string;
  condition: string;
}

export interface QuoteResponse {
  bestPrice: number;
  breakdown: {
    basePrice: number;
    adjustments: Array<{ label: string; amount: number }>;
  };
  merchantOffers: Array<{
    merchantId: string;
    merchantName: string;
    price: number;
  }>;
  currency: string;
}

export async function calculateQuote(input: QuoteRequest): Promise<QuoteResponse> {
  const db = adminDb();
  const deviceSnapshot = await db.collection('devices').where('slug', '==', input.deviceSlug).limit(1).get();

  if (deviceSnapshot.empty) {
    return {
      bestPrice: 0,
      breakdown: { basePrice: 0, adjustments: [] },
      merchantOffers: [],
      currency: 'USD',
    };
  }

  const device = deviceSnapshot.docs[0].data() as any;
  const basePrice = device.basePrice ?? 50;
  const conditionMultiplier = device.conditionMultipliers?.[input.condition] ?? 1;
  const capacityAdjustment = device.capacityAdjustments?.[input.capacity] ?? 0;
  const networkAdjustment = device.networkAdjustments?.[input.network] ?? 0;

  const bestPrice = Math.max(0, Math.round((basePrice + capacityAdjustment + networkAdjustment) * conditionMultiplier));
  const merchantOffers = Object.entries(device.listings ?? {}).map(([merchantId, price]) => ({
    merchantId,
    merchantName: device.merchantNames?.[merchantId] ?? merchantId,
    price: Number(price) * conditionMultiplier,
  }));

  return {
    bestPrice,
    breakdown: {
      basePrice,
      adjustments: [
        { label: `Condition ×${conditionMultiplier}`, amount: basePrice * (conditionMultiplier - 1) },
        { label: `Capacity adjustment`, amount: capacityAdjustment },
        { label: `Network adjustment`, amount: networkAdjustment },
      ],
    },
    merchantOffers,
    currency: 'USD',
  };
}
