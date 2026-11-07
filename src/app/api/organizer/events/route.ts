import { parseJson, route } from "@/server/api";
import { requireOrg } from "@/server/auth/guards";
import { saveEvent } from "@/server/services/event-management";
import { eventDraftSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "org-events", max: 60, windowSeconds: 60 } }, async (request) => {
  const { user, organization } = await requireOrg("MANAGER");
  const input = await parseJson(request, eventDraftSchema);
  const event = await saveEvent(organization.id, user.id, input);
  return { id: event.id, slug: event.slug, status: event.status };
});
