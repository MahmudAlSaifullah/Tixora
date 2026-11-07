import { route } from "@/server/api";
import { getEventsNear } from "@/server/services/catalog";

export const GET = route({ limit: { bucket: "events-near", max: 120, windowSeconds: 60 } }, async (request) => {
  const city = request.nextUrl.searchParams.get("city")?.trim().slice(0, 60) ?? "Dhaka";
  return { city, events: await getEventsNear(city) };
});
