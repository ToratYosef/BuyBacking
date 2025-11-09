# Firestore sample documents

The JSON files in this folder provide representative Firestore documents that can be imported during development.

- `devices.sample.json` – example device catalog entries with pricing fields used by the quote engine.
- `orders.sample.json` – sample canonical order records, including mirrored user orders, shipping metadata, and audit logs.

To seed the emulator, run `firebase emulators:start` and import these files using `scripts/migrate_import_html.js` or manual writes with the Firebase Admin SDK.
