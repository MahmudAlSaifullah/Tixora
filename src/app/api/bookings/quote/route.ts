import { parseJson, route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { quoteOrder } from "@/server/services/booking";
import { quoteSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "quote", max: 60, windowSeconds: 60 } }, async (request) => {
  const input = await parseJson(request, quoteSchema);
  const user = await getCurrentUser();
  return quoteOrder({ ...input, email: input.email ?? user?.email }, { userId: user?.id });
});
