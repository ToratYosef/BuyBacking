import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length ? getApp() : initializeApp();

export const adminDb = getFirestore(app);
