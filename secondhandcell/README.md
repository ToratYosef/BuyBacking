# SecondHandCell Monorepo

Modernised Next.js + Firebase implementation for the SecondHandCell website and backend services.

## Structure

```
secondhandcell/
├── apps/
│   └── web/               # Next.js 14 (App Router) frontend
├── services/
│   └── functions/         # Firebase Functions (Node 20, TypeScript)
├── packages/
│   └── types/             # Shared TypeScript types
├── firebase.json
├── firestore.rules
├── storage.rules
└── tsconfig.base.json
```

## Getting Started

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

Environment variables go in `apps/web/.env.local` (see `.env.example`).

### Firebase Functions

```bash
cd services/functions
npm install
npm run build
firebase emulators:start --only functions,firestore,auth
```

Deploy with `npm run deploy` after authenticating via the Firebase CLI.

## Environment Variables

| Name | Description |
| ---- | ----------- |
| `NEXT_PUBLIC_FB_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FB_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FB_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FB_STORAGE_BUCKET` | Firebase storage bucket |
| `NEXT_PUBLIC_FB_APP_ID` | Firebase app ID |
| `FUNCTIONS_URL` | Base HTTPS URL for the deployed Firebase function |

## Linting & Type Checking

- `npm run lint` within `apps/web`
- `npm run typecheck` within `apps/web`
- `npm run build` within `services/functions`

## Deployment Notes

- Next.js app is ready for deployment on Vercel or Firebase Hosting.
- Cloud Function `api` exposes `/createQuote` and `/contactMessage` endpoints for form submissions.
- Firestore and Storage security rules default to deny-all; update with project-specific access controls before production launch.
