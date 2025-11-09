export interface DeviceDoc {
  slug: string;
  brand: string;
  model: string;
  capacities: string[];
  networks: string[];
  images: string[];
  specs: Record<string, string | number>;
  listings?: Record<string, number>;
  merchantNames?: Record<string, string>;
  basePrice?: number;
  conditionMultipliers?: Record<string, number>;
  capacityAdjustments?: Record<string, number>;
  networkAdjustments?: Record<string, number>;
}

export type OrderStatus =
  | 'created'
  | 'shipped'
  | 'received'
  | 'inspected'
  | 'paid'
  | 'cancelled'
  | 'returned';

export interface OrderDoc {
  id: string;
  createdAt: { seconds: number; nanoseconds: number };
  userId: string | null;
  device: {
    deviceId: string;
    slug: string;
    capacity: string;
    network: string;
    condition: string;
  };
  priceOffered: number;
  shipping: {
    method: 'kit' | 'label';
    status: string;
    carrier?: string | null;
    labelId?: string | null;
    trackingNumber?: string | null;
    labelDownloadUrl?: string | null;
  };
  payment: {
    provider: 'stripe' | 'paypal';
    status: string;
    transactionId?: string;
  };
  status: OrderStatus;
  logs: Array<{ ts: { seconds: number; nanoseconds: number }; entry: string }>;
  referral?: {
    code?: string;
    referrerUserId?: string;
  } | null;
}
