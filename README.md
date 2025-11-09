# BuyBacking Next.js + Firebase Platform

This repository contains the BuyBacking trade-in experience implemented with a modern Next.js 14 application, Firebase Hosting, Firestore, and Cloud Functions. It includes public marketing pages, consumer quote + checkout flows, and an operations-focused admin portal.

## Packages

- `apps/web` – Next.js 14 (TypeScript) application with Tailwind CSS and the App Router. Contains the consumer site, admin console, API routes, and reusable UI components.
- `functions` – Firebase Cloud Functions written in TypeScript for webhook handling, pricing refresh jobs, and admin utilities.
- `scripts` – Node.js utilities for migrating legacy HTML device listings into Firestore and exporting Firestore collections to JSON.

## Getting started

1. Install dependencies (uses npm workspaces):

   ```bash
   npm install
   npm install --prefix functions
   npm install --prefix apps/web
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Populate all Firebase, Stripe, ShipEngine, and PayPal secrets before running the app.

3. Run the Next.js app locally:

   ```bash
   npm run dev --workspace buybacking-web
   ```

4. Build + serve Cloud Functions locally:

   ```bash
   cd functions
   npm run serve
   ```

## Firestore data model

Collections:

- `devices` – catalog of trade-in devices, including pricing adjustments and merchant offers.
- `orders` – canonical order documents with mirrored copies under `users/{uid}/orders/{orderId}`.
- `users` – Firebase Auth users with profile data and order subcollections.
- `adminAuditLogs` – append-only audit history for all privileged actions.
- `shippingKits` – shipping kit lifecycle data (tracking numbers, statuses).
- `pricingSnapshots` – archival snapshots from scheduled pricing crawlers.
- `referrals` – referral code tracking and attribution.
- `settings` – singleton documents for site configuration (e.g., `settings/company`).

See `apps/web/samples` for example documents that can be imported into the emulator.

## Security rules

`firestore.rules` enforces:

- Admin-only write access to sensitive collections (`orders`, `adminAuditLogs`, `shippingKits`).
- Users can read their own mirrored orders under `users/{uid}/orders/*`.
- Public read access to the device catalog and referral creation endpoint.

## Cloud Functions

- `shipengineWebhook` – HTTPS endpoint receiving label + tracking updates and appending audit log entries.
- `pricingRefresh` – Pub/Sub scheduled job refreshing device metadata timestamps.
- `refreshSellCellFeeds` – Callable function to ingest third-party pricing feeds and store snapshots.
- `setAdminClaims` – Callable function to grant or revoke Firebase custom admin claims.
- `auditOrders` – Firestore trigger capturing before/after states for order updates.

Additional helper jobs live under `functions/src/jobs`.

Build functions before deployment:

```bash
cd functions
npm run build
```

## Scripts

- `node scripts/migrate_import_html.js ./old_site_folder` – Scrapes legacy static HTML product pages, normalizes device metadata, and writes documents to Firestore.
- `node scripts/export_firestore_to_json.js ./exports` – Exports key Firestore collections as JSON for backup or analysis.

Both scripts require Firebase admin credentials configured via environment variables.

## Testing

- Unit tests (Jest):

  ```bash
  npm run test:unit
  ```

- Playwright end-to-end tests:

  ```bash
  npm run e2e --workspace buybacking-web
  ```

## Deployment

1. Build the web app:

   ```bash
   npm run build
   ```

2. Build Cloud Functions:

   ```bash
   npm run build --workspace functions
   ```

3. Deploy using Firebase CLI (requires logged-in CLI and configured project):

   ```bash
   firebase deploy --only hosting,functions
   ```

CI/CD recommendation: configure GitHub Actions (see `.github/workflows/ci.yml`) to run lint, tests, and `firebase deploy` on main branch merges.
