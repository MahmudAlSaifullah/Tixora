import { route } from "@/server/api";
import { requireUser } from "@/server/auth/guards";
import { badRequest } from "@/server/errors";
import { attendanceStats } from "@/server/services/checkin";

export const GET = route({ limit: { bucket: "scan-stats", max: 300, windowSeconds: 60 } }, async (request) => {
  const user = await requireUser();
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) throw badRequest("eventId is required.");
  return attendanceStats({ id: user.id, role: user.role }, eventId);
});
