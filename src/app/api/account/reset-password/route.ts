import { parseJson, route } from "@/server/api";
import { resetPassword } from "@/server/services/accounts";
import { resetSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "reset", max: 10, windowSeconds: 900 } }, async (request) => {
  const { token, password } = await parseJson(request, resetSchema);
  await resetPassword(token, password);
  return { ok: true };
});
