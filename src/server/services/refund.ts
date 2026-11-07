import { db, TX_OPTIONS } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { audit } from "../audit";
import { getGateway } from "../payments/registry";
import { ManualRefundRequired, scrubPayload } from "../payments/types";
import { voidBookingTickets } from "./booking";
import { adjustCommissionForRefund } from "./commission";
import { syncSoldOut } from "./inventory";
import { sendRefundMessages } from "./booking-messages";

/** Opens a refund against a booking's successful payment. Defaults to everything still refundable. */
export async function requestRefund(input: { bookingId: string; amountMinor?: number; reason: string; requestedById?: string | null }) {
  const payment = await db.payment.findFirst({
    where: { bookingId: input.bookingId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
  });
  if (!payment) throw badRequest("This booking has no refundable payment.");
  const refundable = payment.amountMinor - payment.refundedMinor;
  const amountMinor = input.amountMinor ?? refundable;
  if (amountMinor <= 0 || amountMinor > refundable) throw badRequest("The refund amount exceeds what is refundable.");
  const open = await db.refund.findFirst({ where: { bookingId: input.bookingId, status: { in: ["REQUESTED", "PROCESSING"] } } });
  if (open) throw conflict("A refund is already in progress for this booking.");
  return db.refund.create({
    data: { paymentId: payment.id, bookingId: input.bookingId, amountMinor, reason: input.reason, requestedById: input.requestedById ?? null },
  });
}

export async function rejectRefund(refundId: string, adminId: string, note: string) {
  const gate = await db.refund.updateMany({
    where: { id: refundId, status: { in: ["REQUESTED", "FAILED"] } },
    data: { status: "REJECTED", adminNote: note, processedById: adminId, processedAt: new Date() },
  });
  if (gate.count !== 1) throw conflict("This refund has already been processed.");
  await audit({ actorId: adminId, action: "refund.reject", entity: "Refund", entityId: refundId, metadata: { note } });
}

/**
 * Sends an approved refund to the gateway. The status gate means a double click or a second admin
 * cannot refund twice; the gateway call happens outside any database transaction.
 */
export async function processRefund(refundId: string, adminId: string) {
  const gate = await db.refund.updateMany({
    where: { id: refundId, status: { in: ["REQUESTED", "FAILED"] } },
    data: { status: "PROCESSING", processedById: adminId },
  });
  if (gate.count !== 1) throw conflict("This refund has already been processed.");

  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  const gateway = getGateway(refund.payment.gateway);
  try {
    if (!gateway) throw new Error(`Gateway ${refund.payment.gateway} is not registered`);
    const result = await gateway.refund(refund.payment, refund.amountMinor, refund.reason);
    await db.paymentTransaction.create({
      data: { paymentId: refund.paymentId, type: "REFUND", status: result.status, externalId: result.refundId, amountMinor: refund.amountMinor, payload: scrubPayload(result.raw ?? {}) as never },
    });
    if (result.status === "COMPLETED") {
      await settleRefund(refundId, adminId, result.refundId ?? null);
    } else {
      await db.refund.update({ where: { id: refundId }, data: { gatewayRefundId: result.refundId ?? null, adminNote: "The gateway is still processing this refund." } });
    }
  } catch (error) {
    const manual = error instanceof ManualRefundRequired;
    const message = error instanceof Error ? error.message : "Refund failed";
    await db.refund.update({ where: { id: refundId }, data: { status: "FAILED", adminNote: message } });
    await audit({ actorId: adminId, action: "refund.failed", entity: "Refund", entityId: refundId, metadata: { message, manual } });
    if (!manual) console.error("[refund] gateway error", error);
  }
  return db.refund.findUniqueOrThrow({ where: { id: refundId } });
}

/** Records a refund made outside Tixora, such as in a gateway's merchant portal. */
export async function completeRefundManually(refundId: string, adminId: string, reference: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw notFound();
  if (refund.status === "COMPLETED" || refund.status === "REJECTED") throw conflict("This refund has already been processed.");
  await settleRefund(refundId, adminId, reference);
}

async function settleRefund(refundId: string, adminId: string, gatewayRefundId: string | null) {
  const settled = await db.$transaction(async (tx) => {
    const gate = await tx.refund.updateMany({
      where: { id: refundId, status: { notIn: ["COMPLETED", "REJECTED"] } },
      data: { status: "COMPLETED", gatewayRefundId, processedById: adminId, processedAt: new Date() },
    });
    if (gate.count !== 1) return false;

    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true, booking: true } });
    const { payment, booking } = refund;
    const wasLive = payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED";
    const totalRefunded = payment.refundedMinor + refund.amountMinor;
    const isFull = totalRefunded >= payment.amountMinor;

    await tx.payment.update({
      where: { id: payment.id },
      data: { refundedMinor: totalRefunded, status: isFull ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });

    // A stray duplicate or late payment (REVIEW) never backed the tickets, so they stay untouched.
    if (wasLive) {
      await adjustCommissionForRefund(tx, booking.id, refund.amountMinor, payment.amountMinor);
      if (isFull) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "REFUNDED" } });
        await voidBookingTickets(tx, booking.id, "REFUNDED");
        await syncSoldOut(tx, booking.eventId);
      } else {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "PARTIALLY_REFUNDED" } });
      }
    }
    await audit({ actorId: adminId, action: "refund.completed", entity: "Refund", entityId: refundId, metadata: { amountMinor: refund.amountMinor, booking: booking.reference, full: isFull } }, tx);
    return true;
  }, TX_OPTIONS);
  if (settled) await sendRefundMessages(refundId);
}
