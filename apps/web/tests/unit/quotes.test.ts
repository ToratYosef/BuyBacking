import { jest } from '@jest/globals';
import { calculateQuote } from '../../lib/pricing';

jest.mock('../../lib/firebaseAdmin', () => ({
  adminDb: () => ({
    collection: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty: true }),
  }),
}));

describe('calculateQuote', () => {
  it('returns a zero quote when the device is not found', async () => {
    const quote = await calculateQuote({
      deviceSlug: 'unknown',
      capacity: '128GB',
      network: 'Unlocked',
      condition: 'Good',
    });

    expect(quote.bestPrice).toBe(0);
    expect(quote.merchantOffers).toHaveLength(0);
  });
});
