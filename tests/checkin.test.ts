import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { attendanceStats, scanTicket } from "@/server/services/checkin";
import { deriveQrToken } from "@/server/tickets/qr";
import { ticketToken } from "@/server/services/tickets";
import { buyTickets, makeEvent, makeUser, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

async function fixture() {
  const data = await makeEvent({ total: 10 });
  const buyer = await makeUser();
  const booking = await buyTickets(data.event.id, data.ticketType.id, 2, buyer);
  const scanner = await makeUser("SCANNER");
  await db.staffAssignment.create({ data: { eventId: data.event.id, userId: scanner.id, gate: "North" } });
  return { ...data, buyer, booking, scanner, actor: { id: scanner.id, role: "SCANNER" } };
}

describe("QR tokens", () => {
  it("are opaque, unique, and stored only as a hash", async () => {
    const { booking, buyer } = await fixture();
    const [a, b] = booking.tickets;
    const tokenA = ticketToken(a);
    expect(tokenA).not.toBe(ticketToken(b));
    expect(tokenA).toMatch(/^TXR1\.[A-Za-z0-9_-]{43}$/);
    expect(tokenA).not.toContain(buyer.email);
    expect(tokenA).not.toContain(a.code);
    expect(a.qrTokenHash).not.toContain(tokenA);
  });
});

describe("scanning", () => {
  it("admits a valid ticket once, then flags duplicates with the first entry's details", async () => {
    const { booking, event, actor } = await fixture();
    const value = ticketToken(booking.tickets[0]);

    const first = await scanTicket(actor, { eventId: event.id, value, gate: "North" });
    expect(first.result).toBe("ACCEPTED");
    expect(first.ticket?.attendeeName).toMatch(/Attendee/);
    expect(first.gate).toBe("North");

    const second = await scanTicket(actor, { eventId: event.id, value, gate: "South" });
    expect(second.result).toBe("DUPLICATE");
    expect(second.gate).toBe("North");
    expect(second.checkedInAt).toBe(first.checkedInAt);
  });

  it("exactly one of many simultaneous scanners wins", async () => {
    const { booking, event, actor } = await fixture();
    const value = ticketToken(booking.tickets[0]);
    const results = await Promise.all(Array.from({ length: 25 }, () => scanTicket(actor, { eventId: event.id, value })));
    expect(results.filter((r) => r.result === "ACCEPTED")).toHaveLength(1);
    expect(results.filter((r) => r.result === "DUPLICATE")).toHaveLength(24);
    expect(await db.checkIn.count({ where: { ticketId: booking.tickets[0].id, result: "ACCEPTED" } })).toBe(1);
  });

  it("the database refuses a second accepted check-in, even if application code were wrong", async () => {
    const { booking, event, actor, scanner } = await fixture();
    await scanTicket(actor, { eventId: event.id, value: ticketToken(booking.tickets[0]) });
    await expect(
      db.checkIn.create({ data: { eventId: event.id, ticketId: booking.tickets[0].id, scannerUserId: scanner.id, result: "ACCEPTED" } }),
    ).rejects.toThrow();
  });

  it("flags invalid tokens and tampered or stale ones", async () => {
    const { booking, event, actor } = await fixture();
    expect((await scanTicket(actor, { eventId: event.id, value: "TXR1.notarealtoken" })).result).toBe("INVALID");
    expect((await scanTicket(actor, { eventId: event.id, value: deriveQrToken(booking.tickets[0].id, "wrong-nonce") })).result).toBe("INVALID");
    expect((await scanTicket(actor, { eventId: event.id, value: "TXR-NOPE-NOPE" })).result).toBe("INVALID");
  });

  it("flags cancelled and refunded tickets", async () => {
    const { booking, event, actor } = await fixture();
    const [a, b] = booking.tickets;
    await db.ticket.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
    await db.ticket.update({ where: { id: b.id }, data: { status: "REFUNDED" } });
    expect((await scanTicket(actor, { eventId: event.id, value: ticketToken(a) })).result).toBe("CANCELLED");
    expect((await scanTicket(actor, { eventId: event.id, value: ticketToken(b) })).result).toBe("REFUNDED");
  });

  it("rejects a ticket from another event without revealing who holds it", async () => {
    const { booking, actor, scanner } = await fixture();
    const other = await makeEvent();
    await db.staffAssignment.create({ data: { eventId: other.event.id, userId: scanner.id } });
    const result = await scanTicket(actor, { eventId: other.event.id, value: ticketToken(booking.tickets[0]) });
    expect(result.result).toBe("WRONG_EVENT");
    expect(result.ticket).toBeNull();
  });

  it("manual lookup by ticket code follows the same rules", async () => {
    const { booking, event, actor } = await fixture();
    const code = booking.tickets[0].code.toLowerCase();
    expect((await scanTicket(actor, { eventId: event.id, value: code })).result).toBe("ACCEPTED");
    expect((await scanTicket(actor, { eventId: event.id, value: code })).result).toBe("DUPLICATE");
  });

  it("refuses scanners who are not assigned to the event", async () => {
    const { booking, event } = await fixture();
    const outsider = await makeUser("SCANNER");
    await expect(scanTicket({ id: outsider.id, role: "SCANNER" }, { eventId: event.id, value: ticketToken(booking.tickets[0]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: booking.tickets[0].id } })).status).toBe("VALID");
  });

  it("refuses scanners from another organizer's team", async () => {
    const { booking, event } = await fixture();
    const rival = await makeEvent();
    await expect(scanTicket({ id: rival.owner.id, role: "ORGANIZER" }, { eventId: event.id, value: ticketToken(booking.tickets[0]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records the gate and device, and reports live stats", async () => {
    const { booking, event, actor } = await fixture();
    await scanTicket(actor, { eventId: event.id, value: ticketToken(booking.tickets[0]), gate: "North", deviceKey: "device-abc", deviceName: "Pixel" });
    await scanTicket(actor, { eventId: event.id, value: "TXR1.bad", gate: "North", deviceKey: "device-abc" });

    const stats = await attendanceStats(actor, event.id);
    expect(stats).toMatchObject({ issued: 2, checkedIn: 1, remaining: 1, rejectedScans: 1, attendanceRate: 0.5 });
    expect(stats.byGate).toEqual([{ gate: "North", count: 1 }]);
    const accepted = await db.checkIn.findFirstOrThrow({ where: { result: "ACCEPTED" }, include: { device: true } });
    expect(accepted.device?.name).toBe("Pixel");
    expect(accepted.gate).toBe("North");
  });
});
