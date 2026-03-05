# Database Testing (MongoDB only)

This folder provides a **parallel test flow** under `/database-testing` that does not use Firebase or Firestore.

## Open the test site

- `/database-testing/`
- `/database-testing/sell/`
- `/database-testing/checkout.html`
- `/database-testing/order-submitted.html`
- `/database-testing/admin/`
- `/database-testing/debug.html`

## API endpoints

Base path: `/database-testing/api`

- `GET /users` → Mongo collection `users`
- `GET /users/:uid` → Mongo `_id = users/:uid`
- `GET /orders` → Mongo collection `orders`
- `GET /orders/:orderId` → Mongo `_id = orders/:orderId`
- `POST /orders` → creates new order in Mongo collection `orders` only
- `GET /admin/orders` → same order list, requires token

### Admin auth (temporary)

Admin endpoints accept `x-database-testing-token`, `Authorization: Bearer ...`, or `?token=`.
Default token: `database-testing-admin` (set `DATABASE_TESTING_ADMIN_TOKEN` in env to change).

## Mongo storage details

- Mongo URI: `mongodb://127.0.0.1:27017`
- DB Name: `SHC`

Order docs created by this test flow are saved as:

- collection: `orders`
- `_id`: `orders/<orderId>`
- includes metadata fields: `__fs_path`, `__collection_path`, `__parent_doc_path`, `__ancestors`, `__migrated_at`

## Migration contract rules used

Option-B recursive flattened mapping:

- collection name = joined Firestore collection names with `__`
  - `orders/ORDERID` → `orders`
  - `users/UID/orders/OID` → `users__orders`
  - `users/UID/orders/OID/items/IID` → `users__orders__items`
- Mongo `_id` = full Firestore document path string
  - `orders/ORDERID`
  - `users/UID/orders/OID`

Helper functions live in `api/src/db/mongo.js`.
