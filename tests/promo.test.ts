import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBooking, quoteOrder, releaseExpiredReservations } from "@/server/services/booking";
import { bookingInput, makeEvent, makeUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

type PromoInput = Parameters<typeof db.promoCode.create>[0]["data"];

const makePromo = (data: Partial<PromoInput> & { code: string }) =>
  db.promoCode.create({ data: { name: data.code, discountType: "PERCENT", discountValue: 1000, ...data } as PromoInput });

describe("discounts", () => {
  it("applies percentage and fixed discounts, with a cap", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 100_000 });
    await makePromo({ code: "PCT20", discountValue: 2000 });
    await makePromo({ code: "FIXED", discountType: "FIXED", discountValue: 50_000 });
    await makePromo({ code: "CAPPED", discountValue: 5000, maxDiscountMinor: 10_000 });
    const items = [{ ticketTypeId: ticketType.id, quantity: 2 }];
    const quote = (promoCode: string) => quoteOrder({ eventId: event.id, items, promoCode }, {});
    expect((await quote("pct20")).discountMinor).toBe(40_000);
    expect((await quote("FIXED")).discountMinor).toBe(50_000);
    expect((await quote("CAPPED")).discountMinor).toBe(10_000);
  });

  it("a discount cannot exceed the order, and a fully discounted order is free", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 10_000 });
    await makePromo({ code: "ALL", discountType: "FIXED", discountValue: 999_999 });
    const quote = await quoteOrder({ eventId: event.id, items: [{ ticketTypeId: ticketType.id, quantity: 1 }], promoCode: "ALL" }, {});
    expect(quote.discountMinor).toBe(10_000);
    expect(quote.totalMinor).toBe(0);
  });

  it("recomputes the price on the server when booking", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 100_000 });
    await makePromo({ code: "TEN" });
    const buyer = await makeUser();
    const { booking } = await createBooking(bookingInput(event.id, ticketType.id, 1, buyer.email, { promoCode: "TEN" }), { userId: buyer.id });
    expect(booking.discountMinor).toBe(10_000);
    expect(booking.totalMinor).toBe(90_000 + 2_250 + 338);
  });
});

describe("eligibility", () => {
  const rejects = async (code: string, error: string, eventId: string, ticketTypeId: string) => {
    await expect(quoteOrder({ eventId, items: [{ ticketTypeId, quantity: 1 }], promoCode: code }, {})).rejects.toMatchObject({ code: error });
  };

  it("checks active flag, dates and minimum order", async () => {
    const { event, ticketType } = await makeEvent({ priceMinor: 10_000 });
    await makePromo({ code: "OFF", isActive: false });
    await makePromo({ code: "OLD", expiresAt: new Date(Date.now() - 1000) });
    await makePromo({ code: "SOON", startsAt: new Date(Date.now() + 86_400_000) });
    await makePromo({ code: "BIG", minOrderMinor: 500_000 });
    await rejects("OFF", "PROMO_INVALID", event.id, ticketType.id);
    await rejects("OLD", "PROMO_EXPIRED", event.id, ticketType.id);
    await rejects("SOON", "PROMO_NOT_STARTED", event.id, ticketType.id);
    await rejects("BIG", "PROMO_MIN_ORDER", event.id, ticketType.id);
    await rejects("NOPE", "PROMO_INVALID", event.id, ticketType.id);
  });

  it("scopes codes to their organizer, event, category and ticket type", async () => {
    const a = await makeEvent();
    const b = await makeEvent();
    await makePromo({ code: "ORG", organization: { connect: { id: a.organization.id } } });
    await makePromo({ code: "EVT", event: { connect: { id: a.event.id } } });
    await makePromo({ code: "CAT", category: { connect: { id: a.category.id } } });
    await makePromo({ code: "TYPE", ticketType: { connect: { id: a.ticketType.id } } });
    for (const code of ["ORG", "EVT", "CAT"]) await rejects(code, "PROMO_INVALID", b.event.id, b.ticketType.id);
    await rejects("TYPE", "PROMO_NOT_APPLICABLE", b.event.id, b.ticketType.id);
    const ok = await quoteOrder({ eventId: a.event.id, items: [{ ticketTypeId: a.ticketType.id, quantity: 1 }], promoCode: "TYPE" }, {});
    expect(ok.discountMinor).toBeGreaterThan(0);
  });
});

describe("usage limits", () => {
  it("cannot be exceeded under concurrency", async () => {
    const { event, ticketType } = await makeEvent({ total: 100 });
    const promo = await makePromo({ code: "LIMITED", usageLimit: 3 });
    const buyers = await Promise.all(Array.from({ length: 15 }, () => makeUser()));
    const results = await Promise.allSettled(
      buyers.map((b) => createBooking(bookingInput(event.id, ticketType.id, 1, b.email, { promoCode: "LIMITED" }), { userId: b.id })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await db.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usedCount).toBe(3);
    // Losers keep no stock.
    expect((await db.ticketInventory.findUniqueOrThrow({ where: { ticketTypeId: ticketType.id } })).reserved).toBe(3);
  });

  it("enforces the per-customer limit, and gives uses back on expiry", async () => {
    const a = await makeEvent();
    const b = await makeEvent();
    const promo = await makePromo({ code: "ONCE", perUserLimit: 1 });
    const buyer = await makeUser();
    const { booking } = await createBooking(bookingInput(a.event.id, a.ticketType.id, 1, buyer.email, { promoCode: "ONCE" }), { userId: buyer.id });
    await expect(createBooking(bookingInput(b.event.id, b.ticketType.id, 1, buyer.email, { promoCode: "ONCE" }), { userId: buyer.id })).rejects.toMatchObject({ code: "PROMO_USER_LIMIT" });

    await db.booking.update({ where: { id: booking.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await releaseExpiredReservations();
    expect((await db.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usedCount).toBe(0);
    await expect(createBooking(bookingInput(b.event.id, b.ticketType.id, 1, buyer.email, { promoCode: "ONCE" }), { userId: buyer.id })).resolves.toBeTruthy();
  });
});
