# Tixora database

[`prisma/schema.prisma`](../prisma/schema.prisma) is the authoritative schema. Migrations are in `prisma/migrations`. Money is stored as integer minor units (poisha) with a currency column, and rates as basis points (`1250` = 12.5%).

## Entities

| Area | Model | Purpose |
|---|---|---|
| Identity | `Role` | The four roles |
| | `User` | Accounts. `sessionVersion` revokes sessions |
| | `Account`, `AuthToken` | Google links; hashed, single-use email tokens |
| Organizers | `Organization` | Organizer profile, status, commission override, payout details |
| | `OrganizationMember` | Team membership: owner, manager, staff |
| Catalog | `EventCategory`, `Venue` | |
| | `Event`, `EventImage` | Draft, pending approval, published, rejected, sold out, completed, cancelled, suspended |
| Tickets | `TicketType` | Price, sale window, purchase limits |
| | `TicketInventory` | `total`, `reserved`, `sold`. The single source of truth for availability |
| Orders | `Booking`, `BookingItem` | Items snapshot name and price, so later edits never rewrite history |
| | `Attendee` | One per ticket |
| | `Ticket` | Public `code`, status, QR nonce and token hash |
| Payments | `Payment` | One per attempt: gateway, amount, references, status |
| | `PaymentTransaction` | Append-only gateway log, scrubbed of credentials, with `dedupeKey` for replays |
| | `Refund` | Requested, processing, completed, rejected, failed |
| Earnings | `PlatformCommission` | Per booking: gross, rate, commission, organizer net |
| | `Payout` | Organizer withdrawals |
| Promotions | `PromoCode`, `PromoCodeUsage` | Scoped by organizer, event, category or ticket type |
| Entry | `CheckIn` | Every scan, accepted or not, with gate, device and scanner |
| | `ScannerDevice`, `StaffAssignment` | |
| Platform | `Notification`, `Review`, `AuditLog`, `PlatformSetting`, `CmsPage`, `NewsletterSubscriber`, `EmailLog`, `RateLimit` | |

## Relationships

```
Organization 1-* Event 1-* TicketType 1-1 TicketInventory
Event 1-* Booking 1-* BookingItem 1-* Attendee 1-1 Ticket 1-* CheckIn
Booking 1-* Payment 1-* PaymentTransaction
Booking 1-* Refund *-1 Payment
Booking 1-1 PlatformCommission, Booking 1-1 PromoCodeUsage
Organization 1-* OrganizationMember *-1 User *-1 Role
Event 1-* StaffAssignment *-1 User
```

Foreign keys that protect financial history (`Booking` to `Event`, `Ticket` to `Booking`, `Payment` to `Booking`) use `RESTRICT`. Dependent details such as gallery images or a booking's items cascade. Optional links such as an acting admin use `SET NULL`.

## Integrity rules in the database

These are in `prisma/migrations/20260102000000_integrity_constraints`, because Prisma's schema language can't express them. They hold even if application code is wrong.

| Rule | Mechanism |
|---|---|
| Inventory can't go negative or oversell | `CHECK (reserved + sold <= total)` and non-negative checks |
| A ticket is accepted at the gate only once | Partial unique index on `CheckIn(ticketId) WHERE result = 'ACCEPTED'` |
| A booking has one live successful payment | Partial unique index on `Payment(bookingId)` |
| A booking has one open refund | Partial unique index on `Refund(bookingId)` |
| Refunds can't exceed the payment | `CHECK (refundedMinor <= amountMinor)` |
| A promo code can't exceed its limit | `CHECK (usedCount <= usageLimit)` |
| Amounts, quantities and ratings stay in range | `CHECK` constraints |

## Transactions

| Operation | Where | Protection |
|---|---|---|
| Reserve stock and create booking | `services/booking.ts` | Advisory lock per customer and event, conditional updates in consistent order |
| Expire or cancel a reservation | `releaseBooking` | Status gate, so only one outcome can win |
| Confirm a payment and issue tickets | `services/payment.ts` | `SELECT ... FOR UPDATE` on the payment row, all in one transaction |
| Check in | `services/checkin.ts` | Conditional update, backed by the partial unique index |
| Settle a refund | `services/refund.ts` | Status gate, with stock and earnings adjusted together |
| Request a payout | `actions/organizer.ts` | Advisory lock per organization, balance re-read inside the lock |

## Migrations

```bash
npm run db:migrate    # apply, safe for production (prisma migrate deploy)
npx prisma studio     # browse data locally
```

To change the schema, edit `schema.prisma` and run `npx prisma migrate dev --name your_change`, then commit the new migration folder.
