import { route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { getBookingForViewer } from "@/server/services/booking";
import { ticketInclude } from "@/server/services/tickets";
import { renderTicketsPdf } from "@/server/tickets/pdf";

/** All of an order's tickets in one PDF. */
export const GET = route({ limit: { bucket: "pdf", max: 30, windowSeconds: 60 } }, async (request, params) => {
  const user = await getCurrentUser();
  const booking = await getBookingForViewer(params.reference, {
    userId: user?.id,
    isAdmin: user?.role === "SUPER_ADMIN",
    guestToken: request.nextUrl.searchParams.get("t"),
  });
  const tickets = await db.ticket.findMany({ where: { bookingId: booking.id, status: { in: ["VALID", "USED"] } }, include: ticketInclude });
  if (tickets.length === 0) throw notFound("This order has no active tickets.");
  const pdf = await renderTicketsPdf(tickets);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="tixora-${booking.reference}.pdf"`, "Cache-Control": "private, no-store" },
  });
});
