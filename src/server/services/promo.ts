import type { Tx } from "../db";
import { badRequest, conflict } from "../errors";
import { bpsOf } from "@/lib/money";

export interface PromoLine {
  ticketTypeId: string;
  lineTotalMinor: number;
}

export interface PromoContext {
  eventId: string;
  organizationId: string;
  categoryId: string;
  lines: PromoLine[];
  userId?: string | null;
  email: string;
  now?: Date;
}

export const normalizePromoCode = (code: string) => code.trim().toUpperCase();

/** Validates a code for an order and computes its discount. Throws a user-readable error. */
export async function evaluatePromo(tx: Tx, rawCode: string, ctx: PromoContext) {
  const now = ctx.now ?? new Date();
  const promo = await tx.promoCode.findUnique({ where: { code: normalizePromoCode(rawCode) } });
  const invalid = () => badRequest("This promo code is not valid.", "PROMO_INVALID");

  if (!promo || !promo.isActive) throw invalid();
  if (promo.startsAt && promo.startsAt > now) throw badRequest("This promo code is not active yet.", "PROMO_NOT_STARTED");
  if (promo.expiresAt && promo.expiresAt < now) throw badRequest("This promo code has expired.", "PROMO_EXPIRED");

  // Scoping. An organizer's code must never work on another organizer's event.
  if (promo.organizationId && promo.organizationId !== ctx.organizationId) throw invalid();
  if (promo.eventId && promo.eventId !== ctx.eventId) throw invalid();
  if (promo.categoryId && promo.categoryId !== ctx.categoryId) throw invalid();

  const eligible = promo.ticketTypeId ? ctx.lines.filter((l) => l.ticketTypeId === promo.ticketTypeId) : ctx.lines;
  const eligibleMinor = eligible.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  if (eligibleMinor === 0) throw badRequest("This promo code does not apply to the selected tickets.", "PROMO_NOT_APPLICABLE");

  const orderMinor = ctx.lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  if (orderMinor < promo.minOrderMinor) {
    throw badRequest("Your order does not meet this code's minimum value.", "PROMO_MIN_ORDER");
  }
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    throw conflict("This promo code has reached its usage limit.", "PROMO_EXHAUSTED");
  }
  if (promo.perUserLimit !== null) {
    const used = await tx.promoCodeUsage.count({
      where: {
        promoCodeId: promo.id,
        OR: [{ email: ctx.email.toLowerCase() }, ...(ctx.userId ? [{ userId: ctx.userId }] : [])],
      },
    });
    if (used >= promo.perUserLimit) throw conflict("You have already used this promo code.", "PROMO_USER_LIMIT");
  }

  let discountMinor = promo.discountType === "PERCENT" ? bpsOf(eligibleMinor, promo.discountValue) : promo.discountValue;
  if (promo.maxDiscountMinor !== null) discountMinor = Math.min(discountMinor, promo.maxDiscountMinor);
  discountMinor = Math.min(discountMinor, eligibleMinor);
  return { promo, discountMinor };
}

/** Claims one redemption atomically. Returns false if the last one was just taken. */
export async function claimPromo(tx: Tx, promoId: string): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE "PromoCode" SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
    WHERE "id" = ${promoId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  return count === 1;
}

export async function releasePromo(tx: Tx, bookingId: string): Promise<void> {
  const usage = await tx.promoCodeUsage.findUnique({ where: { bookingId } });
  if (!usage) return;
  await tx.promoCodeUsage.delete({ where: { id: usage.id } });
  await tx.$executeRaw`
    UPDATE "PromoCode" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now()
    WHERE "id" = ${usage.promoCodeId}`;
}
