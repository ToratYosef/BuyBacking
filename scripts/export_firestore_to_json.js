#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const outputDir = process.argv[2] ?? path.join(__dirname, '../exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    console.error('Missing Firebase credentials.');
    process.exit(1);
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore();
  const collections = ['devices', 'orders', 'users', 'adminAuditLogs', 'shippingKits'];

  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const filePath = path.join(outputDir, `${collection}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Exported ${data.length} docs from ${collection} → ${filePath}`);
  }
}

if (import.meta.url === `file://${__filename}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
