import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { cancelPendingBooking, createBooking, quoteOrder, releaseExpiredReservations } from "@/server/services/booking";
import { bookingInput, makeEvent, makeUser, resetDatabase } from "./helpers";

const inventory = (ticketTypeId: string) => db.ticketInventory.findUniqueOrThrow({ where: { ticketTypeId } });

beforeEach(resetDatabase);

describe("inventory and overselling", () => {
  it("never oversells under heavy concurrency", async () => {
    const { event, ticketType } = await makeEvent({ total: 10 });
    const buyers = await Promise.all(Array.from({ length: 40 }, () => makeUser()));

    const results = await Promise.allSettled(
      buyers.map((buyer) => createBooking(bookingInput(event.id, ticketType.id, 1, buyer.email), { userId: buyer.id })),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(10);
    expect(lost).toHaveLength(30);
    for (const failure of lost) expect(failure.reason.code).toBe("SOLD_OUT");

    const stock = await inventory(ticketType.id);
    expect(stock.reserved).toBe(10);
    expect(stock.reserved + stock.sold).toBeLessThanOrEqual(stock.total);
  });

  it("the database itself refuses to oversell, even if application code were wrong", async () => {
    const { ticketType } = await makeEvent({ total: 5 });
    await expect(
      db.$executeRaw`UPDATE "TicketInventory" SET "reserved" = 6 WHERE "ticketTypeId" = ${ticketType.id}`,
    ).rejects.toThrow();
  });

  it("rejects a multi-ticket order when only part of it is available", async () => {
    const { event, ticketType } = await makeEvent({ total: 3 });
    const buyer = await makeUser();
    await expect(createBooking(bookingInput(event.id, ticketType.id, 4, buyer.email), { userId: buyer.id })).rejects.toMatchObject({ code: "SOLD_OUT" });
    expect((await inventory(ticketType.id)).reserved).toBe(0);
  });
});

describe("reservations", () => {
  it("releases expired reservations, and only those", async () => {
    const { event, ticketType } = await makeEvent({ total: 10 });
    const [a, b] = [await makeUser(), await makeUser()];
    const { booking: stale } = await createBooking(bookingInput(event.id, ticketType.id, 3, a.email), { userId: a.id });
    const { booking: fresh } = await createBooking(bookingInput(event.id, ticketType.id, 2, b.email), { userId: b.id });
    await db.booking.update({ where: { id: stale.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await releaseExpiredReservations()).toBe(1);

    expect((await inventory(ticketType.id)).reserved).toBe(2);
    expect((await db.booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING");
  });

  it("concurrent expiry runs release a booking's stock only once", async () => {
    const { event, ticketType } = await makeEvent({ total: 10 });
    const [a, b] = [await makeUser(), await makeUser()];
    const { booking: stale } = await createBooking(bookingInput(event.id, ticketType.id, 3, a.email), { userId: a.id });
    await createBooking(bookingInput(event.id, ticketType.id, 2, b.email), { userId: b.id });
    await db.booking.update({ where: { id: stale.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const counts = await Promise.all(Array.from({ length: 5 }, () => releaseExpiredReservations()));
    expect(counts.reduce((x, y) => x + y, 0)).toBe(1);
    expect((await inventory(ticketType.id)).reserved).toBe(2);
  });

  it("uses the configured reservation window", async () => {
    await db.platformSetting.create({ data: { key: "reservationMinutes", value: 3 } });
    const { event, ticketType } = await makeEvent();
    const buyer = await makeUser();
    const { booking } = await createBooking(bookingInput(event.id, ticketType.id, 1, buyer.email), { userId: buyer.id });
    const minutes = (booking.expiresAt.getTime() - booking.createdAt.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(2.9);
    expect(minutes).toBeLessThan(3.1);
  });

  it("cancelling checkout gives the stock back", async () => {
    const { event, ticketType } = await makeEvent({ total: 5 });
    const buyer = await makeUser();
    const { booking } = await createBooking(bookingInput(event.id, ticketType.id, 5, buyer.email), { userId: buyer.id });
    await cancelPendingBooking(booking.id);
    expect((await inventory(ticketType.id)).reserved).toBe(0);
  });
});

describe("duplicate orders", () => {
  it("the same idempotency key returns one booking, even when raced", async () => {
    const { event, ticketType } = await makeEvent({ total: 50 });
    const buyer = await makeUser();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createBooking(bookingInput(event.id, ticketType.id, 2, buyer.email, { idempotencyKey: key }), { userId: buyer.id })),
    );
    expect(new Set(results.map((r) => r.booking.id)).size).toBe(1);
    expect((await inventory(ticketType.id)).reserved).toBe(2);
  });

  it("an identical order with a new key resumes the open booking", async () => {
    const { event, ticketType } = await makeEvent({ total: 50 });
    const buyer = await makeUser();
    const first = await createBooking(bookingInput(event.id, ticketType.id, 2, buyer.email), { userId: buyer.id });
    const second = await createBooking(bookingInput(event.id, ticketType.id, 2, buyer.email), { userId: buyer.id });
    expect(second.booking.id).toBe(first.booking.id);
    expect((await inventory(ticketType.id)).reserved).toBe(2);
  });

  it("a changed order replaces the open booking and frees its stock", async () => {
    const { event, ticketType } = await makeEvent({ total: 50 });
    const buyer = await makeUser();
    const first = await createBooking(bookingInput(event.id, ticketType.id, 2, buyer.email), { userId: buyer.id });
    const second = await createBooking(bookingInput(event.id, ticketType.id, 5, buyer.email), { userId: buyer.id });
    expect(second.booking.id).not.toBe(first.booking.id);
    expect((await inventory(ticketType.id)).reserved).toBe(5);
    expect((await db.booking.findUniqueOrThrow({ where: { id: first.booking.id } })).status).toBe("CANCELLED");
  });
});

describe("purchase rules", () => {
  it("enforces per-order and per-customer limits", async () => {
    const { event, ticketType } = await makeEvent({ perUserLimit: 3, maxPerOrder: 4 });
    const buyer = await makeUser();
    await expect(createBooking(bookingInput(event.id, ticketType.id, 5, buyer.email), { userId: buyer.id })).rejects.toMatchObject({ code: "ABOVE_MAXIMUM" });
    await expect(createBooking(bookingInput(event.id, ticketType.id, 4, buyer.email), { userId: buyer.id })).rejects.toMatchObject({ code: "USER_LIMIT" });
  });

  it("requires one attendee per ticket", async () => {
    const { event, ticketType } = await makeEvent();
    const buyer = await makeUser();
    const input = bookingInput(event.id, ticketType.id, 2, buyer.email);
    input.items[0].attendees = [{ name: "Only one" }];
    await expect(createBooking(input, { userId: buyer.id })).rejects.toMatchObject({ code: "ATTENDEE_MISMATCH" });
  });

  it("refuses unpublished events and closed sale windows", async () => {
    const draft = await makeEvent({ status: "DRAFT" });
    const buyer = await makeUser();
    await expect(createBooking(bookingInput(draft.event.id, draft.ticketType.id, 1, buyer.email), { userId: buyer.id })).rejects.toMatchObject({ code: "EVENT_NOT_ON_SALE" });

    const closed = await makeEvent();
    await db.ticketType.update({ where: { id: closed.ticketType.id }, data: { salesEndAt: new Date(Date.now() - 1000) } });
    await expect(createBooking(bookingInput(closed.event.id, closed.ticketType.id, 1, buyer.email), { userId: buyer.id })).rejects.toMatchObject({ code: "SALE_ENDED" });
  });

  it("guest checkout works only where the event allows it", async () => {
    const closed = await makeEvent({ guestCheckout: false });
    await expect(createBooking(bookingInput(closed.event.id, closed.ticketType.id, 1, "guest@example.test"), {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const open = await makeEvent({ guestCheckout: true });
    const { booking } = await createBooking(bookingInput(open.event.id, open.ticketType.id, 1, "guest@example.test"), {});
    expect(booking.userId).toBeNull();
  });

  it("computes fee and tax from settings, on the server", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 100_000 });
    const quote = await quoteOrder({ eventId: event.id, items: [{ ticketTypeId: ticketType.id, quantity: 2 }] }, {});
    expect(quote.subtotalMinor).toBe(200_000);
    expect(quote.platformFeeMinor).toBe(5_000); // 2.5%
    expect(quote.taxMinor).toBe(750); // 15% of the fee
    expect(quote.totalMinor).toBe(205_750);
  });
});

describe("free orders", () => {
  it("confirm immediately with tickets and no payment", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 0, total: 5 });
    const buyer = await makeUser();
    const { booking } = await createBooking(bookingInput(event.id, ticketType.id, 2, buyer.email), { userId: buyer.id });
    expect(booking.status).toBe("CONFIRMED");
    expect(await db.ticket.count({ where: { bookingId: booking.id, status: "VALID" } })).toBe(2);
    expect(await db.payment.count({ where: { bookingId: booking.id } })).toBe(0);
    const stock = await inventory(ticketType.id);
    expect([stock.reserved, stock.sold]).toEqual([0, 2]);
  });
});
