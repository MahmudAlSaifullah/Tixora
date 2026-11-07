import { db, Prisma, TX_OPTIONS, type Tx } from "../db";
import { env } from "../env";
import { badRequest, conflict, notFound } from "../errors";
import { merchantTxnId } from "../crypto";
import { audit } from "../audit";
import { getGateway } from "../payments/registry";
import { scrubPayload, type CallbackRequest, type ParsedCallback, type PaymentContext, type VerifiedPayment } from "../payments/types";
import { finaliseBooking } from "./booking";
import { reserve, releaseReservation } from "./inventory";
import { claimPromo } from "./promo";
import { sendBookingConfirmedMessages, notifyPaymentNeedsReview } from "./booking-messages";

const GRACE_MS = 5 * 60_000;
const MAX_HOLD_MS = 30 * 60_000;

const toContext = (p: { merchantTxnId: string; gatewayPaymentId: string | null; gatewayTxnId: string | null; amountMinor: number; currency: string }): PaymentContext => ({
  merchantTxnId: p.merchantTxnId,
  gatewayPaymentId: p.gatewayPaymentId,
  gatewayTxnId: p.gatewayTxnId,
  amountMinor: p.amountMinor,
  currency: p.currency,
});

/** Starts a payment attempt. The amount always comes from the stored booking, never the client. */
export async function initiatePayment(bookingId: string, gatewayCode: string) {
  const gateway = getGateway(gatewayCode);
  if (!gateway || !gateway.isAvailable()) throw badRequest("This payment method is not available.", "GATEWAY_UNAVAILABLE");

  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { event: { select: { title: true } } } });
  if (!booking) throw notFound("Order not found.");
  if (booking.status !== "PENDING") throw conflict("This order can no longer be paid.", "BOOKING_NOT_PAYABLE");
  const now = Date.now();
  if (booking.expiresAt.getTime() <= now) throw conflict("Your reservation has expired. Please book again.", "RESERVATION_EXPIRED");
  if (booking.totalMinor <= 0) throw badRequest("This order has nothing to pay.");

  // Do not let a reservation lapse while the customer is on the gateway's page, within a hard cap.
  const extended = Math.min(Math.max(booking.expiresAt.getTime(), now + GRACE_MS), booking.createdAt.getTime() + MAX_HOLD_MS);
  if (extended > booking.expiresAt.getTime()) {
    await db.booking.updateMany({ where: { id: booking.id, status: "PENDING" }, data: { expiresAt: new Date(extended) } });
  }

  const payment = await db.payment.create({
    data: {
      bookingId: booking.id,
      gateway: gateway.code,
      mode: gateway.isTestOnly || env.paymentMode === "sandbox" ? "SANDBOX" : "LIVE",
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      merchantTxnId: merchantTxnId(),
    },
  });

  const callback = (kind: string) =>
    `${env.appUrl}/api/payments/callback/${gateway.code}?result=${kind}&txn=${payment.merchantTxnId}`;
  try {
    const result = await gateway.initiate({
      ...toContext(payment),
      bookingReference: booking.reference,
      eventTitle: booking.event.title,
      customer: { name: booking.contactName, email: booking.contactEmail, phone: booking.contactPhone },
      urls: {
        success: callback("success"),
        fail: callback("fail"),
        cancel: callback("cancel"),
        webhook: `${env.appUrl}/api/payments/webhook/${gateway.code}`,
      },
    });
    await db.$transaction([
      db.payment.update({ where: { id: payment.id }, data: { gatewayPaymentId: result.gatewayPaymentId ?? null } }),
      db.paymentTransaction.create({
        data: { paymentId: payment.id, type: "INITIATE", status: "CREATED", externalId: result.gatewayPaymentId, amountMinor: payment.amountMinor, payload: scrubPayload(result.raw ?? {}) as never },
      }),
    ]);
    return { paymentId: payment.id, redirectUrl: result.redirectUrl };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not reach the payment gateway";
    await db.$transaction([
      db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason } }),
      db.paymentTransaction.create({ data: { paymentId: payment.id, type: "INITIATE", status: "ERROR", payload: { error: reason } } }),
    ]);
    console.error(`[payment] ${gateway.code} initiate failed`, error);
    throw new (await import("../errors")).AppError(502, "GATEWAY_ERROR", "The payment gateway could not start this payment. Please try another method.");
  }
}

/** Handles any browser return or server webhook from a gateway. Safe to replay and to race. */
export async function handleGatewayEvent(gatewayCode: string, request: CallbackRequest, source: "CALLBACK" | "WEBHOOK") {
  const gateway = getGateway(gatewayCode);
  if (!gateway || !gateway.isAvailable()) throw notFound("Unknown payment gateway.");

  const parsed = gateway.parseCallback(request);
  if (!parsed.merchantTxnId) throw badRequest("Missing transaction reference.");
  const payment = await db.payment.findUnique({ where: { merchantTxnId: parsed.merchantTxnId } });
  if (!payment || payment.gateway !== gateway.code) throw notFound("Unknown transaction.");

  await logEvent(payment.id, source, parsed);

  // A gateway that signs its callbacks and sent a bad signature is treated as an attack.
  if (parsed.signatureValid === false) {
    console.warn(`[payment] rejected bad signature for ${payment.merchantTxnId}`);
    return { paymentId: payment.id, bookingId: payment.bookingId, rejected: true as const };
  }
  if (parsed.gatewayPaymentId && !payment.gatewayPaymentId) {
    await db.payment.update({ where: { id: payment.id }, data: { gatewayPaymentId: parsed.gatewayPaymentId } });
    payment.gatewayPaymentId = parsed.gatewayPaymentId;
  }

  const verified = await gateway.verify(toContext(payment), parsed);
  await applyVerification(payment.id, verified, "VERIFY");
  return { paymentId: payment.id, bookingId: payment.bookingId, rejected: false as const };
}

async function logEvent(paymentId: string, source: "CALLBACK" | "WEBHOOK", parsed: ParsedCallback) {
  try {
    await db.paymentTransaction.create({
      data: {
        paymentId,
        type: source,
        status: parsed.claimedStatus,
        dedupeKey: `${source}:${parsed.dedupeKey}`,
        signatureValid: parsed.signatureValid,
        payload: scrubPayload(parsed.raw) as never,
      },
    });
  } catch (error) {
    // Replays land on the unique dedupeKey. Verification still re-runs and is idempotent.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}

/** Records a gateway's authoritative answer and acts on it. */
export async function applyVerification(paymentId: string, verified: VerifiedPayment, logType: "VERIFY" | "RECONCILE") {
  await db.paymentTransaction.create({
    data: {
      paymentId,
      type: logType,
      status: verified.status,
      externalId: verified.gatewayTxnId,
      amountMinor: verified.amountMinor,
      payload: scrubPayload(verified.raw ?? { reason: verified.reason }) as never,
    },
  });
  await db.payment.update({ where: { id: paymentId }, data: { lastCheckedAt: new Date() } });

  if (verified.status === "SUCCEEDED") return confirmPayment(paymentId, verified);
  if (verified.status === "FAILED" || verified.status === "CANCELLED") {
    // Only an open attempt can fail: a late "failed" must never undo a success.
    // The booking stays PENDING, so the customer can retry until the reservation lapses.
    await db.payment.updateMany({
      where: { id: paymentId, status: "INITIATED" },
      data: { status: verified.status === "FAILED" ? "FAILED" : "CANCELLED", failureReason: verified.reason ?? null },
    });
  }
  return { outcome: "NOOP" as const };
}

/**
 * The only path that marks a payment as paid. It runs in one transaction with the payment row
 * locked, so concurrent callback + webhook + reconcile runs issue tickets exactly once.
 */
export async function confirmPayment(paymentId: string, verified: VerifiedPayment) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { booking: { include: { items: true, promoCode: true } } } });

    if (payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED" || payment.status === "REFUNDED") {
      return { outcome: "ALREADY_CONFIRMED" as const };
    }

    const paidFields = {
      gatewayTxnId: verified.gatewayTxnId ?? payment.gatewayTxnId,
      method: verified.method ?? payment.method,
      paidAt: new Date(),
    };

    // Money must match what we asked for, to the poisha.
    if (verified.amountMinor !== payment.amountMinor || (verified.currency ?? payment.currency) !== payment.currency) {
      const reason = `Amount mismatch: expected ${payment.amountMinor} ${payment.currency}, gateway reported ${verified.amountMinor} ${verified.currency}`;
      await holdForReview(tx, payment, paidFields, reason, false);
      return { outcome: "REVIEW" as const, reason };
    }

    const booking = payment.booking;
    if (booking.status === "CONFIRMED" || booking.status === "PARTIALLY_REFUNDED" || booking.status === "REFUNDED") {
      const reason = "Duplicate payment: this booking was already paid by another attempt.";
      await holdForReview(tx, payment, paidFields, reason, true);
      return { outcome: "REVIEW" as const, reason };
    }

    if (booking.status !== "PENDING") {
      // The customer paid after the hold lapsed. Honour it if the seats are still free.
      if (!(await reacquire(tx, booking))) {
        const reason = "Paid after the reservation expired, and the tickets are no longer available.";
        await holdForReview(tx, payment, paidFields, reason, true);
        return { outcome: "REVIEW" as const, reason };
      }
    }

    await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", failureReason: null, ...paidFields } });
    await finaliseBooking(tx, booking.id);
    await audit({ action: "payment.confirmed", entity: "Payment", entityId: payment.id, metadata: { booking: booking.reference, gateway: payment.gateway, amountMinor: payment.amountMinor } }, tx);
    return { outcome: "CONFIRMED" as const, bookingId: booking.id };
  }, TX_OPTIONS);

  // Messages go out after commit. A mail outage must not undo a paid booking.
  if (result.outcome === "CONFIRMED") await sendBookingConfirmedMessages(result.bookingId);
  if (result.outcome === "REVIEW") await notifyPaymentNeedsReview(paymentId, result.reason);
  return result;
}

async function holdForReview(
  tx: Tx,
  payment: { id: string; bookingId: string; amountMinor: number },
  paidFields: { gatewayTxnId?: string | null; method?: string | null; paidAt: Date },
  reason: string,
  openRefund: boolean,
) {
  await tx.payment.update({ where: { id: payment.id }, data: { status: "REVIEW", failureReason: reason, ...paidFields } });
  if (openRefund) {
    const open = await tx.refund.findFirst({ where: { bookingId: payment.bookingId, status: { in: ["REQUESTED", "PROCESSING"] } } });
    if (!open) {
      await tx.refund.create({ data: { paymentId: payment.id, bookingId: payment.bookingId, amountMinor: payment.amountMinor, reason } });
    }
  }
  await audit({ action: "payment.review", entity: "Payment", entityId: payment.id, metadata: { reason } }, tx);
}

/** Re-takes stock for a lapsed booking and reopens it. All or nothing. */
async function reacquire(tx: Tx, booking: { id: string; promoCodeId: string | null; userId: string | null; contactEmail: string; discountMinor: number; items: { ticketTypeId: string; quantity: number }[] }) {
  const held: { ticketTypeId: string; quantity: number }[] = [];
  const items = [...booking.items].sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId));
  for (const item of items) {
    if (await reserve(tx, item.ticketTypeId, item.quantity)) {
      held.push(item);
    } else {
      for (const h of held) await releaseReservation(tx, h.ticketTypeId, h.quantity);
      return false;
    }
  }
  // The customer already paid the discounted price, so restore the promo record. If the code's
  // limit has been reached since, the discount is still honoured and only the counter stays put.
  if (booking.promoCodeId) {
    await claimPromo(tx, booking.promoCodeId);
    await tx.promoCodeUsage.upsert({
      where: { bookingId: booking.id },
      update: {},
      create: { promoCodeId: booking.promoCodeId, bookingId: booking.id, userId: booking.userId, email: booking.contactEmail, discountMinor: booking.discountMinor },
    });
  }
  await tx.booking.update({ where: { id: booking.id }, data: { status: "PENDING", cancelledAt: null } });
  return true;
}

/** Re-checks attempts that never reported back. Run from cron, or per payment by an admin. */
export async function reconcilePayments(options: { paymentId?: string; olderThanMinutes?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (options.olderThanMinutes ?? 10) * 60_000);
  const horizon = new Date(Date.now() - 72 * 3_600_000);
  const payments = await db.payment.findMany({
    where: options.paymentId ? { id: options.paymentId } : { status: "INITIATED", createdAt: { lt: cutoff, gt: horizon } },
    take: options.limit ?? 100,
    orderBy: { createdAt: "asc" },
  });
  const results: { merchantTxnId: string; status: string }[] = [];
  for (const payment of payments) {
    const gateway = getGateway(payment.gateway);
    if (!gateway?.isAvailable()) {
      results.push({ merchantTxnId: payment.merchantTxnId, status: "GATEWAY_UNAVAILABLE" });
      continue;
    }
    try {
      const verified = await gateway.verify(toContext(payment));
      await applyVerification(payment.id, verified, "RECONCILE");
      results.push({ merchantTxnId: payment.merchantTxnId, status: verified.status });
    } catch (error) {
      console.error(`[payment] reconcile failed for ${payment.merchantTxnId}`, error);
      results.push({ merchantTxnId: payment.merchantTxnId, status: "ERROR" });
    }
  }
  return results;
}
