# BuyBacking Monorepo

BuyBacking combines a static marketing site, an admin operations console, and a Firebase-backed API for device buyback workflows. The repository is organised so you can run everything locally for development or deploy individual pieces to production.

## Repository layout

- `/` – Static marketing and customer flows that are served directly (or via Firebase Hosting) alongside utility scripts such as the lightweight static server in `server.js` and Tailwind build tooling.【F:server.js†L1-L124】【F:package.json†L1-L26】
- `/admin` – Node/Express admin console that talks to Firestore, ShipEngine, and email providers. It expects a Firebase service account JSON at `admin/serviceAccountKey.json` and reads configuration from environment variables.【F:admin/index.js†L1-L114】
- `/functions` – Firebase Cloud Functions API (deployed under `/api/**`) plus background jobs, email pipelines, PDF generation, and wholesale tooling. Functions run on Node 20 and rely on extensive configuration via environment variables or `firebase functions:config:set` values.【F:functions/package.json†L4-L31】【F:firebase.json†L15-L31】【F:functions/index.js†L71-L165】【F:functions/routes/wholesale.js†L44-L151】
- `/assets/js/pages/*` – Front-end logic for the public site and admin pages. Admin pages default to calling the hosted Cloud Functions URL and honour `window.API_BASE`/`window.BACKEND_BASE_URL` overrides when you need to point at a local emulator.【F:assets/js/pages/admin-print-queue.js†L1-L59】【F:assets/js/pages/admin-index.js†L5414-L5417】

## Prerequisites

- Node.js 20.x (aligns with the Cloud Functions runtime).【F:functions/package.json†L12-L31】
- npm 9+ (ships with Node 20).
- Firebase CLI (`npm install -g firebase-tools`) for running emulators and deploying functions.【F:functions/package.json†L4-L10】
- Access to a Firebase project with Firestore enabled, plus a service account JSON that has permission to read/write Firestore (used by the admin console).【F:admin/index.js†L44-L54】
- Credentials for ShipEngine, optional ShipStation sandbox access, Stripe (wholesale), and email sending (Gmail/SMTP) as described below.【F:admin/index.js†L75-L107】【F:functions/index.js†L71-L165】【F:functions/routes/wholesale.js†L57-L151】

## Installation

Install dependencies in each workspace:

```bash
# Root (static site + shared tooling)
npm install

# Admin console
npm --prefix admin install

# Firebase Functions
npm --prefix functions install
```

The root build script compiles admin Tailwind CSS into the `assets/css` bundle. Run it whenever you change `admin/tailwind.css`:

```bash
npm run build
```

To rebuild the standalone admin CSS bundle, use:

```bash
npm --prefix admin run build:css
```

【F:package.json†L6-L26】【F:admin/package.json†L6-L33】

## Environment configuration

### Firebase project & service accounts

1. Create or select a Firebase project with Firestore enabled (the repo contains `firestore.rules` and `firestore.indexes.json`).【F:firebase.json†L9-L14】
2. Generate a service account JSON with Firestore Admin permissions and save it to `admin/serviceAccountKey.json`. The admin Express server loads this file at startup.【F:admin/index.js†L44-L51】
3. Log in with the Firebase CLI (`firebase login`) and set the active project (`firebase use <project-id>`).

### Admin console `.env`

Create `admin/.env` (or export variables before running) with at least:

```ini
PORT=4000                     # Optional – defaults to 3000
NOTIFICATION_EMAIL_TO=ops@example.com
EMAIL_SERVICE=gmail           # or EMAIL_HOST/EMAIL_PORT/EMAIL_SECURE
EMAIL_USER=you@example.com
EMAIL_PASS=app-specific-password
SS_API_KEY=shipengine-api-key
SS_SANDBOX=true               # optional, controls ShipEngine sandbox mode
AUTO_VOID_INTERVAL_MS=3600000 # optional override of auto-void check cadence
```

The admin server reads these values to configure its HTTP port, email transporter, ShipEngine credentials, and auto-void scheduler.【F:admin/index.js†L17-L114】【F:admin/index.js†L500-L575】

If you use a custom SMTP host instead of a named `EMAIL_SERVICE`, set `EMAIL_HOST`, `EMAIL_PORT`, and `EMAIL_SECURE` ("true"/"false").【F:admin/index.js†L75-L107】

### Cloud Functions configuration

Firebase Functions read configuration from both environment variables and `functions.config()` values. You can supply them through a `.env` file in `functions/` (supported with the Node 20 runtime) or via `firebase functions:config:set`.

Key variables:

```ini
EMAIL_USER=you@example.com
EMAIL_PASS=app-specific-password
EMAIL_FROM=SecondHandCell <you@example.com>
CONDITION_EMAIL_FROM=conditions@example.com
CONDITION_EMAIL_BCC=qc@example.com
APP_FRONTEND_URL=https://secondhandcell.com
SHIPENGINE_KEY=live-shipengine-key
SHIPENGINE_SANDBOX_CARRIER_CODE=stamps_com
SHIPENGINE_SANDBOX_SERVICE_CODE=usps_first_class_mail
SHIPENGINE_FROM_NAME=Warehouse Team
SHIPENGINE_FROM_PHONE=2015551234
SHIPENGINE_FROM_ADDRESS1=1206 McDonald Ave
SHIPENGINE_FROM_CITY=Brooklyn
SHIPENGINE_FROM_STATE=NY
SHIPENGINE_FROM_POSTAL=11230
SHIPENGINE_FROM_COUNTRY=US
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
WHOLESALE_ADMIN_TOKEN=very-secret-token
GEMINI_KEY=generative-ai-key
SALES_EMAIL=sales@example.com
```

- `EMAIL_*` values configure transactional email delivery (Gmail by default).【F:functions/index.js†L71-L165】
- `CONDITION_EMAIL_*`, `SALES_EMAIL`, and `APP_FRONTEND_URL` drive the customer notification templates and the URLs embedded in emails.【F:functions/index.js†L154-L207】【F:functions/index.js†L1762-L1766】【F:functions/index.js†L2688-L2689】
- `SHIPENGINE_*` values power label generation, wholesale fulfilment, and PDF kit workflows.【F:functions/index.js†L305-L323】【F:functions/routes/wholesale.js†L82-L120】
- `STRIPE_*` and `WHOLESALE_ADMIN_TOKEN` secure the wholesale routes for pricing and inventory management.【F:functions/routes/wholesale.js†L57-L151】

Apply `firebase functions:config:set` if you prefer managed config:

```bash
firebase functions:config:set \
  stripe.secret="$STRIPE_SECRET_KEY" \
  stripe.publishable="$STRIPE_PUBLISHABLE_KEY" \
  stripe.webhook_secret="$STRIPE_WEBHOOK_SECRET" \
  shipengine.key="$SHIPENGINE_KEY"
```

Then deploy the runtime config:

```bash
cd functions
firebase deploy --only functions
```

【F:functions/package.json†L4-L10】【F:functions/routes/wholesale.js†L44-L151】

## Running locally

1. **Build static assets** (once after dependency install):
   ```bash
   npm run build
   npm --prefix admin run build:css  # optional for admin standalone styles
   ```
   【F:package.json†L6-L26】【F:admin/package.json†L6-L33】

2. **Start the Firebase Functions emulator** (serves the `/api/**` routes on port 5001 by default):
   ```bash
   cd functions
   npm run serve
   ```
   【F:functions/package.json†L4-L10】【F:firebase.json†L33-L47】

3. **Serve the static site** (marketing pages, admin UI, print queue, etc.):
   ```bash
   cd ..
   ./start-server.sh           # or: PORT=4000 node server.js
   ```
   The static server hosts the repository root, supports directory browsing with `DIR_LISTING=1`, and can fall back to `index.html` for SPAs when `SPA_FALLBACK=1` is set.【F:start-server.sh†L1-L5】【F:server.js†L6-L124】

4. **Run the admin console API** (optional if you need the Express helpers in `admin/index.js`):
   ```bash
   npm --prefix admin start
   ```
   【F:admin/package.json†L6-L10】

5. **Point the front-end at your local API (optional):**
   - For one-off sessions, open the admin/print queue page and run `window.BACKEND_BASE_URL = "http://localhost:5001/<project-id>/us-central1/api";` in the browser console before interacting with the UI.【F:assets/js/pages/admin-print-queue.js†L9-L59】【F:assets/js/pages/admin-index.js†L5414-L5417】
   - Alternatively, inject a `<script>` tag before the bundled scripts that sets `window.API_BASE` to the emulator URL.

## Deployment notes

- Firebase Hosting rewrites `/api/**` requests to the deployed Cloud Function bundle defined in `functions/index.js`. Deploy with `firebase deploy` to push both hosting and API updates, or `firebase deploy --only functions` to update the API alone.【F:firebase.json†L15-L31】【F:functions/package.json†L4-L10】
- The admin console (`/admin`) can be deployed as a separate service (Heroku, Cloud Run, etc.) because it is a standalone Express application. Ensure the same environment variables and service account file are present in the deployment environment.【F:admin/index.js†L1-L114】
- Keep ShipEngine, Stripe, and email secrets in a secure secret manager or CI environment variables. Avoid committing `.env` files.

## Troubleshooting

- **CORS or auth errors in admin pages:** confirm `window.BACKEND_BASE_URL` points at the correct API origin and that the Firebase emulator/production function includes your origin in the allowed list.【F:functions/index.js†L26-L53】【F:assets/js/pages/admin-print-queue.js†L9-L59】
- **Email delivery issues:** verify the SMTP credentials and that `EMAIL_SERVICE`/`EMAIL_HOST` values are configured in both the admin console and Cloud Functions runtimes.【F:admin/index.js†L75-L107】【F:functions/index.js†L71-L165】
- **ShipEngine label failures:** ensure `SHIPENGINE_KEY` (and optional sandbox carrier/service codes) are set and valid.【F:functions/index.js†L305-L323】【F:functions/routes/wholesale.js†L82-L120】
- **Stripe webhook errors:** double-check `STRIPE_WEBHOOK_SECRET` matches the endpoint you configured in Stripe’s dashboard.【F:functions/routes/wholesale.js†L57-L79】

With the prerequisites met and the configuration populated, you can run the entire buyback workflow—public quote pages, internal admin screens, PDF printing, and transactional automations—entirely from this repository.
