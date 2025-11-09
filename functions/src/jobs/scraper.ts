import axios from 'axios';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

type ScrapeResult = {
  slug: string;
  offer: number;
};

export async function runDeviceScraper(): Promise<ScrapeResult[]> {
  const response = await axios.get('https://example.com/pricing-feed.json', { validateStatus: () => true });
  const results = (response.data?.results ?? []) as ScrapeResult[];
  const db = getFirestore();

  await Promise.all(
    results.map((result) =>
      db.collection('devices').doc(result.slug).set(
        {
          listings: {
            wholesale: result.offer,
          },
          lastScrapedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    )
  );

  return results;
}
