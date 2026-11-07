import { parseJson, route } from "@/server/api";
import { db } from "@/server/db";
import { newsletterSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "newsletter", max: 10, windowSeconds: 3600 } }, async (request) => {
  const { email } = await parseJson(request, newsletterSchema);
  await db.newsletterSubscriber.upsert({ where: { email }, update: {}, create: { email } });
  return { ok: true };
});
