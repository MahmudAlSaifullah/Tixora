# Tixora API

Errors have one shape:

```json
{ "error": { "code": "SOLD_OUT", "message": "Not enough VIP tickets left.", "details": null } }
```

Common statuses: `400` bad request, `401` not logged in, `403` not allowed, `404` not found or not yours, `409` state conflict, `422` validation failed, `429` rate limited.

Sessions use an HttpOnly cookie set by Auth.js. POST, PUT and PATCH requests with a foreign `Origin` are refused, except gateway webhooks and cron jobs, which authenticate differently. Amounts are integers in poisha (`125000` = ৳1,250). Limits below are per client IP.

## Accounts

| Method and path | Access | Body | Notes |
|---|---|---|---|
| `POST /api/account/register` | Public, 10/hour | `name, email, password` | Sends welcome and verification emails |
| `POST /api/account/forgot-password` | Public, 5/15 min | `email` | Same answer whether or not the account exists |
| `POST /api/account/reset-password` | Public, 10/15 min | `token, password` | Single-use token; ends all sessions |
| `POST /api/account/resend-verification` | Logged in, 3/15 min | | |
| `GET, POST /api/auth/*` | Auth.js | | Credentials and Google sign-in |

## Events

| Method and path | Access | Notes |
|---|---|---|
| `GET /api/events` | Public, 300/min | Query: `q, category, city, from, to, minPrice, maxPrice, when (upcoming, ongoing, completed, all), sort (date, popular, newest), page`. Prices are in taka. Returns `{ events, total, page, pageSize, pages }` |
| `GET /api/events/near?city=` | Public, 120/min | Upcoming events in a city |

## Booking

| Method and path | Access | Notes |
|---|---|---|
| `POST /api/bookings/quote` | Public, 60/min | `eventId, items[{ticketTypeId, quantity}], promoCode?`. Price breakdown. Holds nothing |
| `POST /api/bookings` | Logged in, or guest where the event allows it; 30/min | See below. Holds stock until `expiresAt` |
| `GET /api/bookings/:reference` | Owner, admin, or `?t=` guest token | Status summary |
| `POST /api/bookings/:reference/cancel` | Owner or `?t=` | Abandons an unpaid order and releases the hold |
| `GET /api/bookings/:reference/pdf` | Owner, admin, or `?t=` | All active tickets in one PDF |
| `GET /api/tickets/:code/pdf` | Owner, admin, or `?t=` | One ticket as a PDF |

```jsonc
// POST /api/bookings
{
  "eventId": "...",
  "items": [{ "ticketTypeId": "...", "quantity": 2, "attendees": [{ "name": "Ayesha" }, { "name": "Rafiq" }] }],
  "contact": { "name": "Ayesha", "email": "a@example.com", "phone": "01712345678" },
  "promoCode": "WELCOME10",
  "idempotencyKey": "client-generated, 16-80 chars"
}
// Response
{ "reference": "TX...", "status": "PENDING", "expiresAt": "...", "totalMinor": 205750, "reused": false, "guestToken": null }
```

Retrying with the same key returns the same booking. Prices in the request are ignored. A free order comes back already `CONFIRMED`.

## Payments

| Method and path | Access | Notes |
|---|---|---|
| `POST /api/payments/initiate` | Owner or guest token; 20/min | `reference, gateway, guestToken?`. Returns `{ redirectUrl }` |
| `GET, POST /api/payments/callback/:gateway` | Gateway browser return | Verifies with the gateway, then redirects to the order page (303) |
| `POST /api/payments/webhook/:gateway` | Gateway server | Signature checked where the gateway signs. A bad signature returns `401` |
| `POST /api/payments/test/decide` | Sandbox only | Backs the TEST MODE page. `404` unless the test gateway is enabled |

Gateway codes: `sslcommerz`, `bkash`, `nagad`, `test`. Only configured gateways are available.

## Scanner

| Method and path | Access | Notes |
|---|---|---|
| `POST /api/scanner/validate` | Staff assigned to the event, its organizer's team, or admin | `eventId, value (QR token or ticket ID), gate?, deviceKey?, deviceName?` |
| `GET /api/scanner/stats?eventId=` | Same | Live attendance |

`result` is one of `ACCEPTED, DUPLICATE, INVALID, WRONG_EVENT, CANCELLED, REFUNDED, NOT_ACTIVE`. Attendee details are never returned for `INVALID` or `WRONG_EVENT`.

## Organizer

| Method and path | Access | Notes |
|---|---|---|
| `POST /api/organizer/events` | Owner or manager | Creates a draft |
| `PUT /api/organizer/events/:id` | Owner or manager of that event's organization | Updates it. Another organizer's event returns `404` |
| `POST /api/organizer/events/:id/submit` | Same | Sends to approval, or publishes if approval is off |
| `POST /api/uploads` | Organizer or admin | Multipart `file`. JPEG, PNG or WebP, checked by content, 5 MB maximum |
| `GET /api/exports/attendees?eventId=` | Owner, manager or admin | CSV, limited to the caller's organization |
| `GET /api/exports/sales?eventId=` | Same | CSV |

## Other

| Method and path | Access | Notes |
|---|---|---|
| `POST /api/newsletter` | Public, 10/hour | `email` |
| `GET /api/health` | Public | `200` when the database is reachable, otherwise `503` |
| `GET, POST /api/cron/:job` | `Authorization: Bearer $CRON_SECRET` | `release-reservations, reconcile-payments, complete-events, event-reminders, prune` |

## Server actions

Dashboard and account forms use Next.js server actions, which check `Origin` and re-check permissions on each call.

- **`src/server/actions/account.ts`**: profile, password, notification preferences, log out everywhere, refund request, review, organizer application.
- **`src/server/actions/organizer.ts`**: submit and cancel events, inventory, promo codes, payouts, organization settings, team, staff assignment.
- **`src/server/actions/admin.ts`**: users, organizers, event approval and suspension, tickets, bookings, reconciliation, refunds, commissions, settings, campaigns, categories, payouts, staff, CMS.
