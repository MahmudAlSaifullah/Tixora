import { db, type Tx } from "../db";
import { ticketCode, verifyGuestOrderToken } from "../crypto";
import { deriveQrToken, newQrCredentials } from "../tickets/qr";
import { randomUUID } from "node:crypto";

/** Creates one ticket per attendee. Only ever called for a booking being confirmed. */
export async function issueTickets(tx: Tx, bookingId: string): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { attendees: { include: { bookingItem: true, ticket: { select: { id: true } } } } },
  });
  for (const attendee of booking.attendees) {
    if (attendee.ticket) continue; // idempotent
    const id = randomUUID();
    await tx.ticket.create({
      data: {
        id,
        code: ticketCode(),
        attendeeId: attendee.id,
        bookingId,
        bookingItemId: attendee.bookingItemId,
        eventId: booking.eventId,
        ticketTypeId: attendee.bookingItem.ticketTypeId,
        status: "VALID",
        ...newQrCredentials(id),
      },
    });
  }
}

export const ticketInclude = {
  attendee: true,
  ticketType: true,
  booking: { select: { id: true, reference: true, userId: true, contactEmail: true, status: true } },
  event: { include: { venue: true, organization: { select: { name: true } } } },
} as const;

/** The QR token is only derived for viewers who are allowed to hold the ticket. */
export function ticketToken(ticket: { id: string; qrNonce: string }) {
  return deriveQrToken(ticket.id, ticket.qrNonce);
}

export async function getTicketForViewer(
  code: string,
  viewer: { userId?: string | null; isAdmin?: boolean; guestToken?: string | null },
) {
  const ticket = await db.ticket.findUnique({ where: { code }, include: ticketInclude });
  if (!ticket) return null;
  const isOwner = Boolean(viewer.userId && ticket.booking.userId === viewer.userId);
  const hasGuestLink = Boolean(viewer.guestToken && verifyGuestOrderToken(ticket.booking.id, viewer.guestToken));
  return isOwner || viewer.isAdmin || hasGuestLink ? ticket : null;
}

export type TicketWithRelations = NonNullable<Awaited<ReturnType<typeof getTicketForViewer>>>;
