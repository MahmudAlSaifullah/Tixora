import { parseJson, route } from "@/server/api";
import { requestPasswordReset } from "@/server/services/accounts";
import { forgotSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "forgot", max: 5, windowSeconds: 900 } }, async (request) => {
  const { email } = await parseJson(request, forgotSchema);
  await requestPasswordReset(email);
  // The same answer whether or not the account exists.
  return { ok: true };
});
