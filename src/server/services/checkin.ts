import { db, TX_OPTIONS } from "../db";
import { forbidden } from "../errors";
import { normalizeTicketCode } from "../crypto";
import { hashQrToken, isQrToken } from "../tickets/qr";
import type { CheckInResult } from "@/generated/prisma/client";

export interface ScanActor {
  id: string;
  role: string;
}

export interface ScanInput {
  eventId: string;
  /** Scanned QR token, or a ticket code typed in manually. */
  value: string;
  gate?: string | null;
  deviceKey?: string | null;
  deviceName?: string | null;
}

/** Who may scan an event: super admins, members of the owning organizer, and assigned staff. */
export async function canScanEvent(actor: ScanActor, eventId: string): Promise<boolean> {
  if (actor.role === "SUPER_ADMIN") return true;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      organization: { select: { members: { where: { userId: actor.id }, select: { id: true } } } },
      staff: { where: { userId: actor.id }, select: { id: true } },
    },
  });
  if (!event) return false;
  return event.organization.members.length > 0 || event.staff.length > 0;
}

export async function scannableEvents(actor: ScanActor) {
  const where =
    actor.role === "SUPER_ADMIN"
      ? {}
      : { OR: [{ staff: { some: { userId: actor.id } } }, { organization: { members: { some: { userId: actor.id } } } }] };
  return db.event.findMany({
    where: { ...where, status: { in: ["PUBLISHED", "SOLD_OUT", "COMPLETED"] } },
    select: { id: true, title: true, startsAt: true, status: true, venue: { select: { name: true, city: true } }, staff: { where: { userId: actor.id }, select: { gate: true } } },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
}

async function resolveDevice(actor: ScanActor, input: ScanInput) {
  if (!input.deviceKey) return null;
  const name = input.deviceName?.slice(0, 80) || undefined;
  const device = await db.scannerDevice.upsert({
    where: { deviceKey: input.deviceKey },
    create: { deviceKey: input.deviceKey, name: name ?? "Scanner device", userId: actor.id, eventId: input.eventId },
    update: { lastSeenAt: new Date(), eventId: input.eventId, userId: actor.id, name },
  });
  return device.id;
}

const MESSAGES: Record<CheckInResult, string> = {
  ACCEPTED: "Valid ticket. Entry granted.",
  DUPLICATE: "Already checked in. Do not admit.",
  INVALID: "Ticket not recognised. Do not admit.",
  WRONG_EVENT: "This ticket is for a different event. Do not admit.",
  CANCELLED: "This ticket was cancelled. Do not admit.",
  REFUNDED: "This ticket was refunded. Do not admit.",
  NOT_ACTIVE: "This ticket is not active. Do not admit.",
};

/** Validates a scan and admits the ticket at most once, however many scanners race. */
export async function scanTicket(actor: ScanActor, input: ScanInput) {
  if (!(await canScanEvent(actor, input.eventId))) throw forbidden("You are not assigned to this event.");

  const value = input.value.trim();
  const isQr = isQrToken(value);
  const method = isQr ? "QR" : "MANUAL";
  const ticket = await db.ticket.findUnique({
    where: isQr ? { qrTokenHash: hashQrToken(value) } : { code: normalizeTicketCode(value) },
    include: { attendee: true, ticketType: { select: { name: true } }, booking: { select: { reference: true } } },
  });
  const deviceId = await resolveDevice(actor, input);
  const gate = input.gate?.trim().slice(0, 60) || null;

  const log = (result: CheckInResult, ticketId: string | null) =>
    db.checkIn.create({ data: { eventId: input.eventId, ticketId, scannerUserId: actor.id, deviceId, gate, result, method } });

  // Details of a ticket are shown only for the event being scanned. Nothing leaks for a foreign ticket.
  const reply = (result: CheckInResult, checkedInAt?: Date | null, previous?: { gate: string | null; scanner: string | null } | null) => ({
    result,
    ok: result === "ACCEPTED",
    message: MESSAGES[result],
    ticket:
      ticket && result !== "INVALID" && result !== "WRONG_EVENT"
        ? { code: ticket.code, attendeeName: ticket.attendee.name, ticketType: ticket.ticketType.name, bookingReference: ticket.booking.reference, status: ticket.status }
        : null,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    gate: previous ? previous.gate : gate,
    previousScanner: previous?.scanner ?? null,
  });

  if (!ticket) {
    await log("INVALID", null);
    return reply("INVALID");
  }
  if (ticket.eventId !== input.eventId) {
    await log("WRONG_EVENT", null);
    return reply("WRONG_EVENT");
  }
  if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
    await log(ticket.status, ticket.id);
    return reply(ticket.status);
  }
  if (ticket.status === "PENDING") {
    await log("NOT_ACTIVE", ticket.id);
    return reply("NOT_ACTIVE");
  }

  const event = await db.event.findUnique({ where: { id: input.eventId }, select: { status: true } });
  if (event?.status === "CANCELLED" || event?.status === "SUSPENDED") {
    await log("NOT_ACTIVE", ticket.id);
    return reply("NOT_ACTIVE");
  }

  // The conditional update is the gate: of N concurrent scans, exactly one sees count === 1.
  const admittedAt = new Date();
  const admitted = await db.$transaction(async (tx) => {
    const gateResult = await tx.ticket.updateMany({
      where: { id: ticket.id, status: "VALID" },
      data: { status: "USED", checkedInAt: admittedAt },
    });
    if (gateResult.count !== 1) return false;
    await tx.checkIn.create({ data: { eventId: input.eventId, ticketId: ticket.id, scannerUserId: actor.id, deviceId, gate, result: "ACCEPTED", method, createdAt: admittedAt } });
    return true;
  }, TX_OPTIONS);

  if (admitted) return reply("ACCEPTED", admittedAt);

  await log("DUPLICATE", ticket.id);
  const first = await db.checkIn.findFirst({
    where: { ticketId: ticket.id, result: "ACCEPTED" },
    include: { scannerUser: { select: { name: true } } },
  });
  return reply("DUPLICATE", first?.createdAt ?? ticket.checkedInAt, { gate: first?.gate ?? null, scanner: first?.scannerUser.name ?? null });
}

export async function attendanceStats(actor: ScanActor, eventId: string) {
  if (!(await canScanEvent(actor, eventId))) throw forbidden("You are not assigned to this event.");
  const [byStatus, byType, byGate, recent, rejected] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["ticketTypeId", "status"], where: { eventId, status: { in: ["VALID", "USED"] } }, _count: { _all: true } }),
    db.checkIn.groupBy({ by: ["gate"], where: { eventId, result: "ACCEPTED" }, _count: { _all: true } }),
    db.checkIn.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { ticket: { select: { code: true, attendee: { select: { name: true } } } }, scannerUser: { select: { name: true } } },
    }),
    db.checkIn.count({ where: { eventId, result: { not: "ACCEPTED" } } }),
  ]);
  const types = await db.ticketType.findMany({ where: { eventId }, select: { id: true, name: true } });
  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const checkedIn = count("USED");
  const issued = checkedIn + count("VALID");
  return {
    issued,
    checkedIn,
    remaining: count("VALID"),
    rejectedScans: rejected,
    attendanceRate: issued ? checkedIn / issued : 0,
    byType: types.map((type) => {
      const pick = (status: string) => byType.find((row) => row.ticketTypeId === type.id && row.status === status)?._count._all ?? 0;
      return { name: type.name, checkedIn: pick("USED"), issued: pick("USED") + pick("VALID") };
    }),
    byGate: byGate.map((row) => ({ gate: row.gate ?? "Unassigned", count: row._count._all })),
    recent: recent.map((row) => ({
      id: row.id,
      result: row.result,
      at: row.createdAt.toISOString(),
      gate: row.gate,
      scanner: row.scannerUser.name,
      attendee: row.ticket?.attendee.name ?? null,
      code: row.ticket?.code ?? null,
    })),
  };
}
