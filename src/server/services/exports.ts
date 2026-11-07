import { db } from "../db";

/** Quotes a CSV cell and defuses spreadsheet formula injection (cells starting with = + - @). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function csvResponse(filename: string, csv: string) {
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function attendeesCsv(scope: { organizationId?: string; eventId?: string }) {
  const tickets = await db.ticket.findMany({
    where: {
      ...(scope.eventId ? { eventId: scope.eventId } : {}),
      ...(scope.organizationId ? { event: { organizationId: scope.organizationId } } : {}),
    },
    include: {
      attendee: true,
      ticketType: { select: { name: true } },
      event: { select: { title: true } },
      booking: { select: { reference: true, contactEmail: true, contactPhone: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 50_000,
  });
  return toCsv(
    ["Event", "Ticket code", "Ticket type", "Status", "Attendee", "Attendee email", "Booking reference", "Contact email", "Contact phone", "Checked in at"],
    tickets.map((t) => [t.event.title, t.code, t.ticketType.name, t.status, t.attendee.name, t.attendee.email, t.booking.reference, t.booking.contactEmail, t.booking.contactPhone, t.checkedInAt]),
  );
}

export async function salesCsv(scope: { organizationId?: string; eventId?: string }) {
  const bookings = await db.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      ...(scope.eventId ? { eventId: scope.eventId } : {}),
      ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    },
    include: {
      event: { select: { title: true } },
      items: { select: { quantity: true } },
      commission: true,
      payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, take: 1 },
    },
    orderBy: { confirmedAt: "desc" },
    take: 50_000,
  });
  const major = (minor?: number | null) => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));
  return toCsv(
    ["Booking reference", "Event", "Status", "Confirmed at", "Tickets", "Currency", "Subtotal", "Discount", "Platform fee", "Tax", "Total paid", "Commission", "Organizer net", "Gateway", "Transaction ID"],
    bookings.map((b) => [
      b.reference,
      b.event.title,
      b.status,
      b.confirmedAt,
      b.items.reduce((sum, item) => sum + item.quantity, 0),
      b.currency,
      major(b.subtotalMinor),
      major(b.discountMinor),
      major(b.platformFeeMinor),
      major(b.taxMinor),
      major(b.totalMinor),
      major(b.commission?.amountMinor),
      major(b.commission?.organizerNetMinor),
      b.payments[0]?.gateway ?? "",
      b.payments[0]?.gatewayTxnId ?? "",
    ]),
  );
}
