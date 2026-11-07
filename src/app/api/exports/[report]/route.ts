import { route } from "@/server/api";
import { getMembership, requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/errors";
import { attendeesCsv, csvResponse, salesCsv } from "@/server/services/exports";

/** CSV reports. An organizer is always limited to their own organization. Admins see everything. */
export const GET = route({ limit: { bucket: "export", max: 20, windowSeconds: 60 } }, async (request, params) => {
  if (params.report !== "attendees" && params.report !== "sales") throw notFound();
  const user = await requireUser();
  const eventId = request.nextUrl.searchParams.get("eventId") ?? undefined;

  const scope: { organizationId?: string; eventId?: string } = { eventId };
  if (user.role !== "SUPER_ADMIN") {
    const membership = await getMembership(user.id);
    if (!membership || membership.role === "STAFF") throw forbidden();
    scope.organizationId = membership.organizationId;
    if (eventId) {
      const owned = await db.event.findFirst({ where: { id: eventId, organizationId: membership.organizationId }, select: { id: true } });
      if (!owned) throw notFound("Event not found.");
    }
  }
  const csv = params.report === "attendees" ? await attendeesCsv(scope) : await salesCsv(scope);
  return csvResponse(`tixora-${params.report}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
