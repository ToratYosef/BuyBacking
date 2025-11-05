export type Quote = {
  id: string;
  deviceSlug: string;
  storage: string;
  condition: 'mint' | 'good' | 'fair' | 'poor' | 'faulty';
  price: number;
  createdAt: number;
};

export type UserPublic = {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: number;
};
