import { route } from "@/server/api";
import { requireOrgEvent } from "@/server/auth/guards";
import { submitEvent } from "@/server/services/event-management";

export const POST = route({ limit: { bucket: "org-events", max: 60, windowSeconds: 60 } }, async (_request, params) => {
  const { user, organization, event } = await requireOrgEvent(params.id);
  return { status: await submitEvent(organization.id, user.id, event.id) };
});
