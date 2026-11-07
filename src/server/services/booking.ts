import { db, Prisma, TX_OPTIONS, type Tx } from "../db";
import { AppError, badRequest, conflict, notFound, unauthorized } from "../errors";
import { bookingReference, verifyGuestOrderToken } from "../crypto";
import { getSettings, type PlatformSettings } from "../settings";
import { audit } from "../audit";
import { commitReservation, releaseReservation, releaseSold, reserve, syncSoldOut } from "./inventory";
import { claimPromo, evaluatePromo, releasePromo } from "./promo";
import { priceOrder } from "./pricing";
import { issueTickets } from "./tickets";
import { recordCommission } from "./commission";
import { sendBookingConfirmedMessages } from "./booking-messages";

export interface OrderItemInput {
  ticketTypeId: string;
  quantity: number;
  attendees: { name: string; email?: string | null; phone?: string | null }[];
}

export interface CreateBookingInput {
  eventId: string;
  items: OrderItemInput[];
  contact: { name: string; email: string; phone: string };
  promoCode?: string | null;
  idempotencyKey: string;
}

/** Stock the seller may still sell: everything not held or already sold. */
export const availableOf = (inventory: { total: number; reserved: number; sold: number } | null) =>
  inventory ? Math.max(inventory.total - inventory.reserved - inventory.sold, 0) : 0;

const OPEN_FOR_SALE = new Set(["PUBLISHED"]);

async function loadEventForSale(tx: Tx, eventId: string) {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { ticketTypes: { include: { inventory: true } } },
  });
  if (!event) throw notFound("This event could not be found.");
  if (event.status === "SOLD_OUT") throw conflict("This event is sold out.", "SOLD_OUT");
  if (!OPEN_FOR_SALE.has(event.status)) throw conflict("This event is not on sale.", "EVENT_NOT_ON_SALE");
  if (event.endsAt && event.endsAt < new Date()) throw conflict("This event has ended.", "EVENT_ENDED");
  return event;
}

/** Validates the requested items against sale windows and purchase limits. */
function validateItems(event: Awaited<ReturnType<typeof loadEventForSale>>, items: OrderItemInput[], now: Date) {
  const merged = new Map<string, OrderItemInput>();
  for (const item of items) {
    if (merged.has(item.ticketTypeId)) throw badRequest("Each ticket category may appear only once in an order.");
    merged.set(item.ticketTypeId, item);
  }
  return [...merged.values()]
    .sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId)) // consistent lock order prevents deadlocks
    .map((item) => {
      const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (!type || !type.isActive) throw badRequest("A selected ticket category is no longer available.", "TICKET_UNAVAILABLE");
      if (type.salesStartAt && type.salesStartAt > now) throw conflict(`Sales for ${type.name} have not started yet.`, "SALE_NOT_STARTED");
      if (type.salesEndAt && type.salesEndAt < now) throw conflict(`Sales for ${type.name} have ended.`, "SALE_ENDED");
      if (item.quantity < type.minPerOrder) throw badRequest(`${type.name}: minimum ${type.minPerOrder} per order.`, "BELOW_MINIMUM");
      if (item.quantity > type.maxPerOrder) throw badRequest(`${type.name}: maximum ${type.maxPerOrder} per order.`, "ABOVE_MAXIMUM");
      if (item.attendees.length !== item.quantity) throw badRequest("Please enter one attendee for each ticket.", "ATTENDEE_MISMATCH");
      return { input: item, type, lineTotalMinor: type.priceMinor * item.quantity };
    });
}

/** Price preview for the checkout UI. Holds no stock and redeems nothing. */
export async function quoteOrder(
  input: { eventId: string; items: { ticketTypeId: string; quantity: number }[]; promoCode?: string | null; email?: string | null },
  actor: { userId?: string | null },
) {
  const settings = await getSettings();
  const event = await loadEventForSale(db, input.eventId);
  const lines = validateItems(
    event,
    input.items.map((i) => ({ ...i, attendees: Array.from({ length: i.quantity }, () => ({ name: "-" })) })),
    new Date(),
  );
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  let discount = 0;
  let promoCode: string | null = null;
  if (input.promoCode) {
    const result = await evaluatePromo(db, input.promoCode, {
      eventId: event.id,
      organizationId: event.organizationId,
      categoryId: event.categoryId,
      lines: lines.map((l) => ({ ticketTypeId: l.type.id, lineTotalMinor: l.lineTotalMinor })),
      userId: actor.userId,
      email: input.email ?? "",
    });
    discount = result.discountMinor;
    promoCode = result.promo.code;
  }
  return {
    currency: event.currency,
    promoCode,
    lines: lines.map((l) => ({
      ticketTypeId: l.type.id,
      name: l.type.name,
      quantity: l.input.quantity,
      unitPriceMinor: l.type.priceMinor,
      lineTotalMinor: l.lineTotalMinor,
    })),
    ...priceOrder(subtotal, discount, settings),
  };
}

function sameItems(existing: { ticketTypeId: string; quantity: number }[], wanted: OrderItemInput[]) {
  if (existing.length !== wanted.length) return false;
  return wanted.every((w) => existing.some((e) => e.ticketTypeId === w.ticketTypeId && e.quantity === w.quantity));
}

/**
 * Creates a PENDING booking and holds inventory until `expiresAt`.
 * Free orders (total 0) are confirmed immediately, since there is nothing to pay.
 */
export async function createBooking(input: CreateBookingInput, actor: { userId?: string | null }) {
  const email = input.contact.email.trim().toLowerCase();
  const userId = actor.userId ?? null;

  const existing = await db.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.userId !== userId || existing.contactEmail !== email) throw conflict("Please restart checkout.", "IDEMPOTENCY_MISMATCH");
    return { booking: existing, reused: true };
  }

  const settings = await getSettings();
  await releaseExpiredReservations({ eventId: input.eventId });

  let created;
  try {
    created = await db.$transaction(
      (tx) => reserveAndCreate(tx, input, { userId, email, settings }),
      TX_OPTIONS,
    );
  } catch (error) {
    // A concurrent retry with the same key won the race: return its booking.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (winner) return { booking: winner, reused: true };
    }
    throw error;
  }

  if (created.reused) return created;

  if (created.booking.totalMinor === 0) {
    const confirmed = await confirmFreeBooking(created.booking.id);
    return { booking: confirmed, reused: false };
  }
  return created;
}

async function reserveAndCreate(
  tx: Tx,
  input: CreateBookingInput,
  who: { userId: string | null; email: string; settings: PlatformSettings },
) {
  const { userId, email, settings } = who;
  const now = new Date();

  // Serialize one customer's checkouts per event so limits and duplicate detection are race-free.
  const lockKey = `booking:${input.eventId}:${userId ?? email}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  const event = await loadEventForSale(tx, input.eventId);
  if (!userId && !event.guestCheckout) throw unauthorized("Please log in to book this event.");
  const lines = validateItems(event, input.items, now);

  // Duplicate protection: an identical unexpired order is resumed; a changed one replaces it.
  const pending = await tx.booking.findMany({
    where: {
      eventId: event.id,
      status: "PENDING",
      expiresAt: { gt: now },
      ...(userId ? { userId } : { contactEmail: email, userId: null }),
    },
    include: { items: true },
  });
  for (const open of pending) {
    if (sameItems(open.items, input.items) && !input.promoCode === !open.promoCodeId) {
      return { booking: open, reused: true };
    }
    await releaseBooking(tx, open.id, "CANCELLED");
  }

  // Lifetime per-customer limits.
  for (const line of lines) {
    if (line.type.perUserLimit === null) continue;
    const aggregate = await tx.bookingItem.aggregate({
      _sum: { quantity: true },
      where: {
        ticketTypeId: line.type.id,
        booking: {
          status: { in: ["PENDING", "CONFIRMED", "PARTIALLY_REFUNDED"] },
          OR: [{ contactEmail: email }, ...(userId ? [{ userId }] : [])],
        },
      },
    });
    if ((aggregate._sum.quantity ?? 0) + line.input.quantity > line.type.perUserLimit) {
      throw conflict(`${line.type.name} is limited to ${line.type.perUserLimit} per customer.`, "USER_LIMIT");
    }
  }

  for (const line of lines) {
    if (!(await reserve(tx, line.type.id, line.input.quantity))) {
      throw conflict(`Not enough ${line.type.name} tickets left.`, "SOLD_OUT");
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  let promo: { id: string; discountMinor: number } | null = null;
  if (input.promoCode) {
    const result = await evaluatePromo(tx, input.promoCode, {
      eventId: event.id,
      organizationId: event.organizationId,
      categoryId: event.categoryId,
      lines: lines.map((l) => ({ ticketTypeId: l.type.id, lineTotalMinor: l.lineTotalMinor })),
      userId,
      email,
      now,
    });
    const promoLock = `promo:${result.promo.id}:${userId ?? email}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${promoLock}, 0))`;
    if (!(await claimPromo(tx, result.promo.id))) {
      throw conflict("This promo code has reached its usage limit.", "PROMO_EXHAUSTED");
    }
    promo = { id: result.promo.id, discountMinor: result.discountMinor };
  }

  const prices = priceOrder(subtotal, promo?.discountMinor ?? 0, settings);
  const booking = await tx.booking.create({
    data: {
      reference: bookingReference(),
      idempotencyKey: input.idempotencyKey,
      userId,
      eventId: event.id,
      organizationId: event.organizationId,
      contactName: input.contact.name.trim(),
      contactEmail: email,
      contactPhone: input.contact.phone.trim(),
      currency: event.currency,
      ...prices,
      promoCodeId: promo?.id,
      expiresAt: new Date(now.getTime() + settings.reservationMinutes * 60_000),
    },
  });

  for (const line of lines) {
    const item = await tx.bookingItem.create({
      data: {
        bookingId: booking.id,
        ticketTypeId: line.type.id,
        ticketTypeName: line.type.name,
        unitPriceMinor: line.type.priceMinor,
        quantity: line.input.quantity,
        lineTotalMinor: line.lineTotalMinor,
      },
    });
    await tx.attendee.createMany({
      data: line.input.attendees.map((a) => ({
        bookingId: booking.id,
        bookingItemId: item.id,
        name: a.name.trim(),
        email: a.email?.trim().toLowerCase() || null,
        phone: a.phone?.trim() || null,
      })),
    });
  }

  if (promo) {
    await tx.promoCodeUsage.create({
      data: { promoCodeId: promo.id, bookingId: booking.id, userId, email, discountMinor: promo.discountMinor },
    });
  }
  await syncSoldOut(tx, event.id);
  return { booking, reused: false };
}

/**
 * Atomically moves a PENDING booking to a terminal state and returns its holds.
 * The status check is the gate, so expiry, cancellation and payment confirmation cannot both win.
 */
export async function releaseBooking(tx: Tx, bookingId: string, status: "EXPIRED" | "CANCELLED" | "FAILED"): Promise<boolean> {
  const gate = await tx.booking.updateMany({
    where: { id: bookingId, status: "PENDING" },
    data: { status, cancelledAt: status === "CANCELLED" ? new Date() : undefined },
  });
  if (gate.count !== 1) return false;
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { items: true } });
  for (const item of booking.items) await releaseReservation(tx, item.ticketTypeId, item.quantity);
  await releasePromo(tx, bookingId);
  await syncSoldOut(tx, booking.eventId);
  return true;
}

/** Releases unpaid reservations past their deadline. Safe to run concurrently. */
export async function releaseExpiredReservations(scope: { eventId?: string; limit?: number } = {}) {
  const due = await db.booking.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() }, ...(scope.eventId ? { eventId: scope.eventId } : {}) },
    select: { id: true },
    take: scope.limit ?? 200,
    orderBy: { expiresAt: "asc" },
  });
  let released = 0;
  for (const { id } of due) {
    const done = await db.$transaction((tx) => releaseBooking(tx, id, "EXPIRED"), TX_OPTIONS);
    if (done) released++;
  }
  return released;
}

/** Customer abandons checkout. */
export async function cancelPendingBooking(bookingId: string) {
  return db.$transaction((tx) => releaseBooking(tx, bookingId, "CANCELLED"), TX_OPTIONS);
}

/**
 * Finalises a booking inside the caller's transaction: stock moves from held to sold, tickets are
 * issued, and commission is accrued. Callers must have already established the money is good.
 */
export async function finaliseBooking(tx: Tx, bookingId: string): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { items: true, promoCode: true },
  });
  for (const item of booking.items) {
    if (!(await commitReservation(tx, item.ticketTypeId, item.quantity))) {
      throw new AppError(500, "INVENTORY_DESYNC", `Reservation missing for booking ${booking.reference}`);
    }
  }
  await tx.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await issueTickets(tx, bookingId);
  await recordCommission(tx, booking);
  await syncSoldOut(tx, booking.eventId);
}

async function confirmFreeBooking(bookingId: string) {
  const booking = await db.$transaction(async (tx) => {
    const locked = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (locked.status !== "PENDING" || locked.totalMinor !== 0) return locked;
    await finaliseBooking(tx, bookingId);
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  }, TX_OPTIONS);
  await sendBookingConfirmedMessages(bookingId);
  return booking;
}

/** Confirmed free bookings have no money to return: tickets are simply released. */
export async function cancelFreeBooking(bookingId: string, actorId: string | null) {
  await db.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.totalMinor !== 0) throw badRequest("Paid bookings are cancelled through a refund.");
    const gate = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (gate.count !== 1) throw conflict("This booking can no longer be cancelled.");
    await voidBookingTickets(tx, bookingId, "CANCELLED");
    await syncSoldOut(tx, booking.eventId);
    await audit({ actorId, action: "booking.cancel_free", entity: "Booking", entityId: bookingId }, tx);
  }, TX_OPTIONS);
}

/** Voids unused tickets and returns their seats to the pool. Used tickets stay as history. */
export async function voidBookingTickets(tx: Tx, bookingId: string, status: "CANCELLED" | "REFUNDED") {
  const tickets = await tx.ticket.findMany({ where: { bookingId, status: "VALID" }, select: { ticketTypeId: true } });
  await tx.ticket.updateMany({ where: { bookingId, status: "VALID" }, data: { status } });
  const counts = new Map<string, number>();
  for (const ticket of tickets) counts.set(ticket.ticketTypeId, (counts.get(ticket.ticketTypeId) ?? 0) + 1);
  for (const [ticketTypeId, quantity] of counts) await releaseSold(tx, ticketTypeId, quantity);
}

/** Loads a booking for whoever may see it: its owner, or a guest holding the signed order link. */
export async function getBookingForViewer(reference: string, viewer: { userId?: string | null; isAdmin?: boolean; guestToken?: string | null }) {
  const booking = await db.booking.findUnique({
    where: { reference },
    include: {
      event: { include: { venue: true, organization: { select: { name: true } } } },
      items: true,
      attendees: true,
      tickets: { include: { attendee: true, ticketType: true } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      promoCode: { select: { code: true } },
    },
  });
  if (!booking) throw notFound("Order not found.");
  const isOwner = Boolean(viewer.userId && booking.userId === viewer.userId);
  const hasGuestLink = Boolean(viewer.guestToken && verifyGuestOrderToken(booking.id, viewer.guestToken));
  if (!isOwner && !viewer.isAdmin && !hasGuestLink) {
    // Same answer as a missing order, so references cannot be probed.
    if (!viewer.userId && !viewer.guestToken) throw unauthorized();
    throw notFound("Order not found.");
  }
  return booking;
}
