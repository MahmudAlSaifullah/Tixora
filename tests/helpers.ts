import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { handleGatewayEvent, initiatePayment } from "@/server/services/payment";
import { createBooking } from "@/server/services/booking";
import { signTestDecision } from "@/server/payments/adapters/test-gateway";
import type { RoleKey } from "@/generated/prisma/client";

const unique = () => randomUUID().slice(0, 8);

export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function makeUser(role: RoleKey = "CUSTOMER", overrides: { email?: string; name?: string } = {}) {
  const roleRow = await db.role.upsert({ where: { key: role }, create: { key: role, name: role }, update: {} });
  return db.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${unique()}@example.test`,
      name: overrides.name ?? "Test Person",
      roleId: roleRow.id,
      emailVerifiedAt: new Date(),
    },
  });
}

export async function makeEvent(options: { total?: number; priceMinor?: number; guestCheckout?: boolean; perUserLimit?: number | null; maxPerOrder?: number; status?: "PUBLISHED" | "DRAFT" | "PENDING_APPROVAL"; commissionBps?: number } = {}) {
  const id = unique();
  const owner = await makeUser("ORGANIZER");
  const organization = await db.organization.create({
    data: {
      name: `Org ${id}`,
      slug: `org-${id}`,
      status: "APPROVED",
      commissionBps: options.commissionBps,
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  const category = await db.eventCategory.create({ data: { name: `Cat ${id}`, slug: `cat-${id}` } });
  const event = await db.event.create({
    data: {
      slug: `event-${id}`,
      title: `Event ${id}`,
      shortDescription: "Short",
      description: "Long",
      status: options.status ?? "PUBLISHED",
      guestCheckout: options.guestCheckout ?? false,
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      endsAt: new Date(Date.now() + 8 * 86_400_000),
      categoryId: category.id,
      organizationId: organization.id,
    },
  });
  const ticketType = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "General",
      priceMinor: options.priceMinor ?? 100_000,
      maxPerOrder: options.maxPerOrder ?? 10,
      perUserLimit: options.perUserLimit ?? null,
      inventory: { create: { total: options.total ?? 100 } },
    },
  });
  return { event, ticketType, organization, owner, category };
}

export const attendees = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `Attendee ${i + 1}` }));

export function bookingInput(eventId: string, ticketTypeId: string, quantity: number, email: string, extra: { promoCode?: string; idempotencyKey?: string } = {}) {
  return {
    eventId,
    items: [{ ticketTypeId, quantity, attendees: attendees(quantity) }],
    contact: { name: "Buyer", email, phone: "+8801700000000" },
    idempotencyKey: extra.idempotencyKey ?? randomUUID(),
    promoCode: extra.promoCode,
  };
}

/** Drives the test gateway the way the hosted page does: signed decision, then callback. */
export async function decideTestPayment(merchantTxnId: string, outcome: "SUCCESS" | "FAILED" | "CANCELLED", overrideAmountMinor?: number) {
  const payment = await db.payment.findUniqueOrThrow({ where: { merchantTxnId } });
  const amount = overrideAmountMinor ?? payment.amountMinor;
  const sig = signTestDecision(merchantTxnId, outcome, amount);
  await db.paymentTransaction.create({
    data: { paymentId: payment.id, type: "CALLBACK", status: "TEST_DECISION", signatureValid: true, amountMinor: amount, payload: { outcome } },
  });
  return handleGatewayEvent("test", { query: {}, body: { txn: merchantTxnId, outcome, amount: String(amount), sig } }, "CALLBACK");
}

/** Books and pays through the full flow. Returns the confirmed booking and its tickets. */
export async function buyTickets(eventId: string, ticketTypeId: string, quantity: number, user: { id: string; email: string }) {
  const { booking } = await createBooking(bookingInput(eventId, ticketTypeId, quantity, user.email), { userId: user.id });
  const { paymentId } = await initiatePayment(booking.id, "test");
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await decideTestPayment(payment.merchantTxnId, "SUCCESS");
  return db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { tickets: true, payments: true } });
}
