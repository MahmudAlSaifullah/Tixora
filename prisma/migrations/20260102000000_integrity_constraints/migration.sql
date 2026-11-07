-- Invariants Prisma's schema language cannot express. These are the last line of defence:
-- even a buggy code path cannot oversell, double-admit, or over-refund.

-- Inventory can never go negative or exceed the total.
ALTER TABLE "TicketInventory"
  ADD CONSTRAINT "inventory_nonnegative" CHECK ("total" >= 0 AND "reserved" >= 0 AND "sold" >= 0),
  ADD CONSTRAINT "inventory_no_oversell" CHECK ("reserved" + "sold" <= "total");

-- A ticket can be accepted at the gate exactly once.
CREATE UNIQUE INDEX "checkin_one_accepted_per_ticket"
  ON "CheckIn" ("ticketId") WHERE "result" = 'ACCEPTED';

-- A booking can have at most one live successful payment. Fully refunded payments are excluded
-- because a stray duplicate payment is refunded while the booking's real payment still stands.
CREATE UNIQUE INDEX "payment_one_success_per_booking"
  ON "Payment" ("bookingId") WHERE "status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED');

-- Only one customer-side active refund request per booking at a time.
CREATE UNIQUE INDEX "refund_one_open_per_booking"
  ON "Refund" ("bookingId") WHERE "status" IN ('REQUESTED', 'PROCESSING');

-- Money sanity.
ALTER TABLE "TicketType" ADD CONSTRAINT "ticket_price_nonnegative" CHECK ("priceMinor" >= 0);
ALTER TABLE "TicketType" ADD CONSTRAINT "ticket_purchase_limits" CHECK ("minPerOrder" >= 1 AND "maxPerOrder" >= "minPerOrder");
ALTER TABLE "Booking" ADD CONSTRAINT "booking_amounts_nonnegative"
  CHECK ("subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "platformFeeMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "BookingItem" ADD CONSTRAINT "booking_item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_refund_within_amount" CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "Refund" ADD CONSTRAINT "refund_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Payout" ADD CONSTRAINT "payout_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Promo redemption can never exceed its limit.
ALTER TABLE "PromoCode" ADD CONSTRAINT "promo_within_limit"
  CHECK ("usedCount" >= 0 AND ("usageLimit" IS NULL OR "usedCount" <= "usageLimit"));
