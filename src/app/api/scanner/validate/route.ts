import { parseJson, route } from "@/server/api";
import { requireUser } from "@/server/auth/guards";
import { scanTicket } from "@/server/services/checkin";
import { scanSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "scan", max: 600, windowSeconds: 60 } }, async (request) => {
  const user = await requireUser();
  const input = await parseJson(request, scanSchema);
  return scanTicket({ id: user.id, role: user.role }, input);
});
