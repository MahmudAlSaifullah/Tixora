import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBooking } from "@/server/services/booking";
import { handleGatewayEvent, initiatePayment, reconcilePayments } from "@/server/services/payment";
import { processRefund, requestRefund } from "@/server/services/refund";
import { organizerBalance } from "@/server/services/commission";
import { sslcommerzSignatureValid } from "@/server/payments/adapters/sslcommerz";
import { scrubPayload } from "@/server/payments/types";
import { bookingInput, buyTickets, decideTestPayment, makeEvent, makeUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

async function pendingPayment(total = 10, quantity = 2) {
  const fixture = await makeEvent({ total });
  const buyer = await makeUser();
  const { booking } = await createBooking(bookingInput(fixture.event.id, fixture.ticketType.id, quantity, buyer.email), { userId: buyer.id });
  const { paymentId } = await initiatePayment(booking.id, "test");
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return { ...fixture, buyer, booking, payment };
}

const load = (id: string) => db.booking.findUniqueOrThrow({ where: { id }, include: { tickets: true, payments: true, commission: true } });
const stock = (ticketTypeId: string) => db.ticketInventory.findUniqueOrThrow({ where: { ticketTypeId } });

describe("confirmation", () => {
  it("issues no tickets before payment, and exactly one per attendee after", async () => {
    const { booking, payment, ticketType } = await pendingPayment();
    expect((await load(booking.id)).tickets).toHaveLength(0);

    await decideTestPayment(payment.merchantTxnId, "SUCCESS");

    const after = await load(booking.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.tickets).toHaveLength(2);
    expect(after.tickets.every((t) => t.status === "VALID")).toBe(true);
    expect(after.payments[0].gatewayTxnId).toBe(`TEST-${payment.merchantTxnId}`);
    const inv = await stock(ticketType.id);
    expect([inv.reserved, inv.sold]).toEqual([0, 2]);
  });

  it("a forged callback claiming success changes nothing", async () => {
    const { booking, payment } = await pendingPayment();
    const result = await handleGatewayEvent("test", { query: {}, body: { txn: payment.merchantTxnId, outcome: "SUCCESS", amount: String(payment.amountMinor), sig: "forged" } }, "WEBHOOK");
    expect(result.rejected).toBe(true);
    const after = await load(booking.id);
    expect(after.status).toBe("PENDING");
    expect(after.tickets).toHaveLength(0);
  });

  it("a correctly signed callback is still not believed without gateway verification", async () => {
    // The gateway's own record (the TEST_DECISION row) says nothing has been paid.
    const { booking, payment } = await pendingPayment();
    const { signTestDecision } = await import("@/server/payments/adapters/test-gateway");
    const sig = signTestDecision(payment.merchantTxnId, "SUCCESS", payment.amountMinor);
    await handleGatewayEvent("test", { query: {}, body: { txn: payment.merchantTxnId, outcome: "SUCCESS", amount: String(payment.amountMinor), sig } }, "CALLBACK");
    expect((await load(booking.id)).status).toBe("PENDING");
  });

  it("replayed and raced callbacks produce one set of tickets", async () => {
    const { booking, payment, ticketType } = await pendingPayment();
    await Promise.all(Array.from({ length: 10 }, () => decideTestPayment(payment.merchantTxnId, "SUCCESS")));
    const after = await load(booking.id);
    expect(after.tickets).toHaveLength(2);
    expect(after.status).toBe("CONFIRMED");
    const inv = await stock(ticketType.id);
    expect([inv.reserved, inv.sold]).toEqual([0, 2]);
    expect(await db.platformCommission.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("holds an underpayment for review and issues no tickets", async () => {
    const { booking, payment } = await pendingPayment();
    await decideTestPayment(payment.merchantTxnId, "SUCCESS", payment.amountMinor - 100);
    const after = await load(booking.id);
    expect(after.status).toBe("PENDING");
    expect(after.tickets).toHaveLength(0);
    expect(after.payments[0].status).toBe("REVIEW");
  });
});

describe("failure", () => {
  it("failed and cancelled attempts issue nothing, and the customer can retry", async () => {
    const { booking, payment } = await pendingPayment();
    await decideTestPayment(payment.merchantTxnId, "FAILED");
    let after = await load(booking.id);
    expect(after.status).toBe("PENDING");
    expect(after.tickets).toHaveLength(0);
    expect(after.payments[0].status).toBe("FAILED");

    const retry = await initiatePayment(booking.id, "test");
    const retryPayment = await db.payment.findUniqueOrThrow({ where: { id: retry.paymentId } });
    await decideTestPayment(retryPayment.merchantTxnId, "SUCCESS");
    after = await load(booking.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.tickets).toHaveLength(2);
  });

  it("a late failure cannot undo a success", async () => {
    const { booking, payment } = await pendingPayment();
    await decideTestPayment(payment.merchantTxnId, "SUCCESS");
    await decideTestPayment(payment.merchantTxnId, "FAILED");
    const after = await load(booking.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.payments[0].status).toBe("SUCCEEDED");
  });

  it("refuses unknown gateways and expired reservations", async () => {
    const { booking } = await pendingPayment();
    await expect(initiatePayment(booking.id, "paypal")).rejects.toMatchObject({ code: "GATEWAY_UNAVAILABLE" });
    await db.booking.update({ where: { id: booking.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(initiatePayment(booking.id, "test")).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
  });
});

describe("late and duplicate payments", () => {
  it("honours a payment after expiry when seats remain", async () => {
    const { booking, payment } = await pendingPayment(10);
    await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
    await db.ticketInventory.updateMany({ data: { reserved: 0 } });
    await decideTestPayment(payment.merchantTxnId, "SUCCESS");
    const after = await load(booking.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.tickets).toHaveLength(2);
  });

  it("sends a payment after expiry to review and refund when the seats are gone", async () => {
    const { booking, payment, ticketType } = await pendingPayment(2);
    await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
    await db.ticketInventory.update({ where: { ticketTypeId: ticketType.id }, data: { reserved: 0, sold: 2 } });
    await decideTestPayment(payment.merchantTxnId, "SUCCESS");
    const after = await load(booking.id);
    expect(after.status).toBe("EXPIRED");
    expect(after.tickets).toHaveLength(0);
    expect(after.payments[0].status).toBe("REVIEW");
    expect(await db.refund.count({ where: { bookingId: booking.id, status: "REQUESTED" } })).toBe(1);
  });

  it("a second successful attempt on a paid booking goes to review, without new tickets", async () => {
    const { booking, payment } = await pendingPayment();
    const second = await initiatePayment(booking.id, "test");
    const secondPayment = await db.payment.findUniqueOrThrow({ where: { id: second.paymentId } });
    await decideTestPayment(payment.merchantTxnId, "SUCCESS");
    await decideTestPayment(secondPayment.merchantTxnId, "SUCCESS");
    const after = await load(booking.id);
    expect(after.tickets).toHaveLength(2);
    expect(after.payments.find((p) => p.id === secondPayment.id)?.status).toBe("REVIEW");
    // Refunding the stray payment leaves the real tickets alone.
    const refund = await db.refund.findFirstOrThrow({ where: { paymentId: secondPayment.id } });
    const admin = await makeUser("SUPER_ADMIN");
    await processRefund(refund.id, admin.id);
    const final = await load(booking.id);
    expect(final.status).toBe("CONFIRMED");
    expect(final.tickets.every((t) => t.status === "VALID")).toBe(true);
  });
});

describe("reconciliation", () => {
  it("settles an attempt whose callback never arrived, and leaves undecided ones alone", async () => {
    const paid = await pendingPayment();
    const undecided = await pendingPayment();
    await db.paymentTransaction.create({
      data: { paymentId: paid.payment.id, type: "CALLBACK", status: "TEST_DECISION", signatureValid: true, amountMinor: paid.payment.amountMinor, payload: { outcome: "SUCCESS" } },
    });
    await db.payment.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } });

    await reconcilePayments();

    expect((await load(paid.booking.id)).status).toBe("CONFIRMED");
    expect((await load(undecided.booking.id)).status).toBe("PENDING");
  });
});

describe("refunds and commission", () => {
  it("a full refund voids tickets, restores stock and reverses earnings", async () => {
    const { event, ticketType } = await makeEvent({ total: 5, commissionBps: 1000 });
    const buyer = await makeUser();
    const admin = await makeUser("SUPER_ADMIN");
    const booking = await buyTickets(event.id, ticketType.id, 2, buyer);

    const refund = await requestRefund({ bookingId: booking.id, reason: "Can't attend", requestedById: buyer.id });
    await processRefund(refund.id, admin.id);

    const after = await load(booking.id);
    expect(after.status).toBe("REFUNDED");
    expect(after.tickets.every((t) => t.status === "REFUNDED")).toBe(true);
    expect(after.payments[0].status).toBe("REFUNDED");
    expect(after.commission?.organizerNetMinor).toBe(0);
    expect((await stock(ticketType.id)).sold).toBe(0);
    await expect(processRefund(refund.id, admin.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("two admins racing cannot refund twice", async () => {
    const { event, ticketType } = await makeEvent({ total: 5 });
    const buyer = await makeUser();
    const admin = await makeUser("SUPER_ADMIN");
    const booking = await buyTickets(event.id, ticketType.id, 1, buyer);
    const refund = await requestRefund({ bookingId: booking.id, reason: "x" });
    const results = await Promise.allSettled([processRefund(refund.id, admin.id), processRefund(refund.id, admin.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await load(booking.id);
    expect(after.payments[0].refundedMinor).toBe(after.payments[0].amountMinor);
  });

  it("a partial refund keeps tickets valid and cannot exceed what was paid", async () => {
    const { event, ticketType } = await makeEvent({ total: 5, commissionBps: 1000, priceMinor: 100_000 });
    const buyer = await makeUser();
    const admin = await makeUser("SUPER_ADMIN");
    const booking = await buyTickets(event.id, ticketType.id, 1, buyer);
    const paid = booking.payments[0].amountMinor;

    const refund = await requestRefund({ bookingId: booking.id, amountMinor: 10_000, reason: "goodwill" });
    await processRefund(refund.id, admin.id);

    const after = await load(booking.id);
    expect(after.status).toBe("PARTIALLY_REFUNDED");
    expect(after.tickets[0].status).toBe("VALID");
    expect(after.commission!.organizerNetMinor).toBeLessThan(90_000);
    await expect(requestRefund({ bookingId: booking.id, amountMinor: paid, reason: "too much" })).rejects.toThrow();
  });

  it("commission uses the organizer override, and balance tracks it", async () => {
    const { event, ticketType, organization } = await makeEvent({ total: 5, commissionBps: 1000, priceMinor: 100_000 });
    const buyer = await makeUser();
    await buyTickets(event.id, ticketType.id, 2, buyer);
    const balance = await organizerBalance(organization.id);
    expect(balance.earnedMinor).toBe(180_000);
    expect(balance.availableMinor).toBe(180_000);
  });
});

describe("gateway helpers", () => {
  it("verifies SSLCommerz signatures", () => {
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    const params: Record<string, string> = { tran_id: "T1", amount: "100.00", status: "VALID", verify_key: "amount,status,tran_id" };
    const signed = `amount=100.00&status=VALID&store_passwd=${md5("pw")}&tran_id=T1`;
    params.verify_sign = md5(signed);
    expect(sslcommerzSignatureValid(params, "pw")).toBe(true);
    expect(sslcommerzSignatureValid({ ...params, amount: "1.00" }, "pw")).toBe(false);
    expect(sslcommerzSignatureValid(params, "wrong")).toBe(false);
  });

  it("scrubs credentials from logged payloads", () => {
    const clean = scrubPayload({ tran_id: "1", store_passwd: "x", nested: { cvv: "123", pin: "1", card_no: "4111", ok: true } });
    expect(clean).toEqual({ tran_id: "1", nested: { ok: true } });
  });
});
