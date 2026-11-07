import { parseJson, route } from "@/server/api";
import { registerUser } from "@/server/services/accounts";
import { registerSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "register", max: 10, windowSeconds: 3600 } }, async (request) => {
  const input = await parseJson(request, registerSchema);
  const user = await registerUser(input);
  return { id: user.id, email: user.email };
});
