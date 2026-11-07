import { route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { notFound, conflict } from "@/server/errors";
import { getTicketForViewer } from "@/server/services/tickets";
import { renderTicketsPdf } from "@/server/tickets/pdf";

export const GET = route({ limit: { bucket: "pdf", max: 30, windowSeconds: 60 } }, async (request, params) => {
  const user = await getCurrentUser();
  const ticket = await getTicketForViewer(params.code, {
    userId: user?.id,
    isAdmin: user?.role === "SUPER_ADMIN",
    guestToken: request.nextUrl.searchParams.get("t"),
  });
  if (!ticket) throw notFound("Ticket not found.");
  if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") throw conflict("This ticket is no longer valid.");
  const pdf = await renderTicketsPdf([ticket]);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="tixora-${ticket.code}.pdf"`, "Cache-Control": "private, no-store" },
  });
});
