import { db, type Tx } from "../db";
import { bpsOf } from "@/lib/money";
import { getSettings } from "../settings";

/**
 * Accrues the platform's commission and the organizer's net.
 * Organizer-funded promos reduce the commissionable amount. Platform campaigns (no organization)
 * are funded by Tixora, so the organizer is still paid on the full ticket value.
 */
export async function recordCommission(
  tx: Tx,
  booking: { id: string; eventId: string; organizationId: string; subtotalMinor: number; discountMinor: number; promoCode?: { organizationId: string | null } | null },
) {
  const settings = await getSettings(tx);
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: booking.organizationId } });
  const rateBps = organization.commissionBps ?? settings.commissionBps;
  const organizerFundedDiscount = booking.promoCode?.organizationId ? booking.discountMinor : 0;
  const grossMinor = booking.subtotalMinor - organizerFundedDiscount;
  const amountMinor = bpsOf(grossMinor, rateBps);
  await tx.platformCommission.upsert({
    where: { bookingId: booking.id },
    update: {},
    create: {
      bookingId: booking.id,
      organizationId: booking.organizationId,
      eventId: booking.eventId,
      grossMinor,
      rateBps,
      amountMinor,
      organizerNetMinor: grossMinor - amountMinor,
    },
  });
}

/** Proportionally reduces commission and organizer net when part of a booking is refunded. */
export async function adjustCommissionForRefund(tx: Tx, bookingId: string, refundMinor: number, paidMinor: number) {
  const commission = await tx.platformCommission.findUnique({ where: { bookingId } });
  if (!commission || paidMinor <= 0) return;
  // Work from the original amounts: the stored ones shrink with each earlier partial refund.
  const share = Math.min(refundMinor / paidMinor, 1);
  const originalCommission = bpsOf(commission.grossMinor, commission.rateBps);
  const originalNet = commission.grossMinor - originalCommission;
  await tx.platformCommission.update({
    where: { bookingId },
    data: {
      organizerNetMinor: Math.max(commission.organizerNetMinor - Math.round(originalNet * share), 0),
      amountMinor: Math.max(commission.amountMinor - Math.round(originalCommission * share), 0),
    },
  });
}

/** Earned minus everything already paid or awaiting payment. */
export async function organizerBalance(organizationId: string, client: Tx = db) {
  const earned = await client.platformCommission.aggregate({ _sum: { organizerNetMinor: true }, where: { organizationId } });
  const payouts = await client.payout.groupBy({ by: ["status"], _sum: { amountMinor: true }, where: { organizationId } });
  const sumOf = (...statuses: string[]) =>
    payouts.filter((p) => statuses.includes(p.status)).reduce((sum, p) => sum + (p._sum.amountMinor ?? 0), 0);
  const earnedMinor = earned._sum.organizerNetMinor ?? 0;
  const paidMinor = sumOf("PAID");
  const pendingMinor = sumOf("REQUESTED", "APPROVED");
  return { earnedMinor, paidMinor, pendingMinor, availableMinor: Math.max(earnedMinor - paidMinor - pendingMinor, 0) };
}
