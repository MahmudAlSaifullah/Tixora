import { route } from "@/server/api";
import { parseEventFilters, searchEvents } from "@/server/services/catalog";

export const GET = route({ limit: { bucket: "events", max: 300, windowSeconds: 60 } }, async (request) => {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return searchEvents(parseEventFilters(params));
});
