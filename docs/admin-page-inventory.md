# Admin page inventory (API routes + buttons)

This is an implementation inventory of the current admin UI so a replacement can be built from scratch.

## 1) API routes used by admin surfaces

> Base client helper is `public/js/apiClient.js`, which prefixes routes with `/api` by default.

### Orders admin (`/admin/index.html`, script: `assets/js/pages/admin-index.js`)

| Route | Method | Used for |
|---|---|---|
| `/generate-label/:id` | POST | Generates shipping label(s) for an order from the action modal and bulk label flow. |
| `/checkImei` | POST | Runs IMEI/ESN check and attaches result data to the order workflow. |
| `/orders/:id/void-label` | POST | Voids selected existing shipping labels for an order. |
| `/orders/:id/clear-data` | POST | Clears selected label/tracking/shipping fields from an order. |
| `/fetch-pdf` | POST | Fetches a remote label PDF URL server-side so browser can merge/print documents. |
| `/refresh-tracking` | POST | Refreshes inbound/outbound tracking from carrier data (`type: kit` or `type: email`). |
| `/orders/:id/status` | PUT | Updates order status (examples: `received`, `completed`, selected bulk status). |
| `/orders/:id/shipping-info` | PUT | Saves shipping address/contact details edits from the modal. |
| `/orders/:id` | GET | Loads full order details when opening an order modal. |
| `/manual-fulfill/:id` | POST | Manual fulfillment path: records tracking + label URL without generating labels. |
| `/orders/:id/re-offer` | POST | Sends a re-offer amount/reasons/comments to customer + updates order state. |
| `/orders/:id/send-condition-email` | POST | Sends condition/problem notice email (balance owed, FMI lock, etc.). |
| `/orders/:id/return-label` | POST | Creates/sends return label for declined re-offer flow. |
| `/orders/:id/mark-kit-sent` | POST | Marks kit shipment sent (used by actions + print flow fallback). |
| `/orders/:id/mark-kit-printed` | POST | Preferred endpoint when printing kit docs to move status forward. |
| `/orders/:id/send-review-request` | POST | Sends Trustpilot review request after completion path. |
| `/orders/:id/auto-requote` | POST | Applies automatic reduced payout action ("Finalize 75% Reduced Payout"). |
| `/orders/:id/cancel` | POST | Cancels order (and in some paths after voiding labels). |
| `/orders/:id` | DELETE | Permanently deletes an order. |
| `/admin/reminders/send` | POST | Sends standard label reminder email. |
| `/admin/reminders/send-expiring` | POST | Sends urgent/expiring reminder email. |
| `/admin/reminders/send-kit` | POST | Sends kit return reminder email. |
| `/feeds/feed.xml` | GET | Loads feed pricing XML used for in-admin pricing comparisons. |

### Print label page (`/admin/print-label.html`)

| Route | Method | Used for |
|---|---|---|
| `/orders/:id` | GET | Loads latest order details by order ID. |
| `/print-bundle/:id` | GET (raw blob) | Downloads merged print bundle PDF. |
| `/orders/:id/sync-outbound-tracking` | POST | Pulls latest outbound tracking before print summary. |
| `/orders/:id/mark-kit-sent` | POST | Marks kit as sent after successful printing for kit orders. |

### Print queue (`/admin/print-queue/index.html`)

| Route | Method | Used for |
|---|---|---|
| `/orders/needs-printing/bundle` | GET (raw blob) | Batch PDF generation for all printable kit orders. |
| `/orders/:id/mark-kit-sent` | POST | Moves each successfully printed order to kit sent state. |

### Admin chat + email tools

| Route | Method | Used for |
|---|---|---|
| `/orders/find?identifier=...` | GET | Lookup order from chat by order ID / email / phone identifier. |
| `/orders/by-user/:userId` | GET | Fetches a user's order history inside chat sidebar/detail panel. |
| `/create-admin` | POST | Creates a new admin account from admin-create page. |
| `/send-email` | POST | Sends manual outbound email from admin email tool. |

## 2) Buttons on the Orders admin page and what they do

This section covers `admin/index.html` + dynamic action buttons created by `renderActionButtons` in `assets/js/pages/admin-index.js`.

### Static/top-level controls

- **Apply SHIP48 / Start my quote now / dismiss (banner controls):** promo banner actions + close.
- **Status filter chips (`All`, `Order Pending`, `Needs Printing`, `Kit Sent`, `Kit Delivered`, `Label Generated`, `Phone On The Way`, `Received`, `Completed`, `Reoffer Pending`, `Return Label`, `Canceled`):** filter visible order table by status.
- **Refresh all kit tracking:** bulk POST to `/refresh-tracking` with `type: kit` for eligible orders.
- **Separate kit orders:** splits / groups kit orders in current dataset for operational triage.
- **Refresh all email tracking:** bulk POST to `/refresh-tracking` with `type: email`.
- **Bulk Generate Labels:** generates labels for many eligible orders in one run.
- **Create Order from Text:** opens parser/import modal for pasted order text.
- **Apply (bulk status):** applies selected status to selected rows.
- **Pagination controls (first/prev/next/last):** move through order pages.

### Order text import modal

- **Close (`×`) / Cancel:** dismiss modal.
- **Save Order:** parses pasted text and creates/updates an order payload.

### Order details modal (fixed buttons)

- **Close modal (`×`)**
- **Shipping address section:** `Edit`, `Add Address`, `Save`, `Cancel`.
- **Check IMEI:** submits `/checkImei` and updates order/device verification data.
- **Status button:** opens status selection/update behavior.
- **Refresh tracking button:** context-aware single-order tracking refresh.

### Re-offer / fulfillment / destructive confirmation modal buttons

- **Send Re-offer / Cancel**
- **Confirm Fulfillment / Cancel**
- **Void Labels & Cancel Order / Back**
- **Void Selected Labels / Cancel**
- **Clear Selected Data / Cancel**
- **Yes, Delete Permanently / Cancel**
- **Send Reminder / Send Urgent Reminder / Send Kit Reminder**

### Dynamic action buttons (depend on current order status)

Possible buttons rendered in grouped action panels:

- **Generate USPS Label** → `/generate-label/:id`
- **Order Manually Fulfilled** → opens manual fulfillment form, then `/manual-fulfill/:id`
- **Mark I Sent** → `/orders/:id/mark-kit-sent`
- **Mark as Received** → `PUT /orders/:id/status` to `received`
- **Mark as Completed** → `PUT /orders/:id/status` to `completed`
- **Propose Re-offer** → opens form, then `/orders/:id/re-offer`
- **Pay Now / Mark Paid** (state-dependent payout flow)
- **Send Return Label** → `/orders/:id/return-label`
- **Send Review Request Email** → `/orders/:id/send-review-request`
- **Finalize 75% Reduced Payout** → `/orders/:id/auto-requote`
- **Refresh Kit Tracking** → `/refresh-tracking` (`type: kit`)
- **Refresh Email Label Tracking** → `/refresh-tracking` (`type: email`)
- **Print Kit Docs (Labels + Bag Label)** or **Print Document (Label + Bag Label)**
- **Print Packing Slip**
- **Void Shipping Labels** → opens selector, then `/orders/:id/void-label`
- **Clear Saved Shipping Data** → opens selector, then `/orders/:id/clear-data`
- **Cancel Order & Void Labels** or **Cancel Order**
- **Delete Order** → `DELETE /orders/:id`
- **Condition/problem emails:**
  - Email Outstanding Balance Notice
  - Email Password Lock Notice
  - Email Lost/Stolen Notice
  - Email FMI / Activation Lock Notice
  (all call `/orders/:id/send-condition-email` with different `reason` values)

