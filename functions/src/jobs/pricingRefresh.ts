import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { runDeviceScraper } from './scraper';

export async function refreshPricingFromFeeds() {
  const db = getFirestore();
  const results = await runDeviceScraper();

  await db.collection('pricingSnapshots').add({
    createdAt: FieldValue.serverTimestamp(),
    source: 'automated-job',
    results,
  });
}
