import { test, expect } from '@playwright/test';

test.describe('Sell flow', () => {
  test('landing page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Sell devices instantly/i })).toBeVisible();
  });
});
