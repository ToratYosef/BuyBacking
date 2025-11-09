import { initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export class FirebaseAdminNotConfiguredError extends Error {
  constructor() {
    super('Firebase admin environment variables are not configured.');
    this.name = 'FirebaseAdminNotConfiguredError';
  }
}

let app: App | undefined;
let db: Firestore | undefined;

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function tryGetFirebaseAdminApp(): App | undefined {
  if (app) {
    return app;
  }

  if (!isFirebaseAdminConfigured()) {
    return undefined;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

  app = initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return app;
}

export function getFirebaseAdminApp() {
  const instance = tryGetFirebaseAdminApp();
  if (!instance) {
    throw new FirebaseAdminNotConfiguredError();
  }

  return instance;
}

export const adminDb = () => {
  if (db) {
    return db;
  }

  db = getFirestore(getFirebaseAdminApp());
  return db;
};

export const tryAdminDb = (): Firestore | null => {
  const instance = tryGetFirebaseAdminApp();
  if (!instance) {
    return null;
  }

  if (db) {
    return db;
  }

  db = getFirestore(instance);
  return db;
};

export const adminAuth = () => getAuth(getFirebaseAdminApp());
