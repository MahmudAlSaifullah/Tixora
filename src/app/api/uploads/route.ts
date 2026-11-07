import { route } from "@/server/api";
import { requireRole } from "@/server/auth/guards";
import { badRequest } from "@/server/errors";
import { storeImage } from "@/server/storage";

export const POST = route({ limit: { bucket: "upload", max: 40, windowSeconds: 300 } }, async (request) => {
  await requireRole("ORGANIZER", "SUPER_ADMIN");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.");
  return { url: await storeImage(file) };
});
