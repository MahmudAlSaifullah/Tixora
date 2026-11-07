import { parseJson, route } from "@/server/api";
import { requireOrgEvent } from "@/server/auth/guards";
import { saveEvent } from "@/server/services/event-management";
import { eventDraftSchema } from "@/lib/validation";

export const PUT = route({ limit: { bucket: "org-events", max: 120, windowSeconds: 60 } }, async (request, params) => {
  const { user, organization, event } = await requireOrgEvent(params.id);
  const input = await parseJson(request, eventDraftSchema);
  const saved = await saveEvent(organization.id, user.id, input, event.id);
  return { id: saved.id, slug: saved.slug, status: saved.status };
});
