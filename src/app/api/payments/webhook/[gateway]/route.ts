import { route } from "@/server/api";
import { handleGatewayEvent } from "@/server/services/payment";
import { AppError } from "@/server/errors";

/** Server-to-server notifications such as SSLCommerz IPN. Authenticated by signature and re-verification. */
export const POST = route({ sameOrigin: false }, async (request, params) => {
  const body: Record<string, string> = {};
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [key, value] of Object.entries(json)) if (typeof value === "string" || typeof value === "number") body[key] = String(value);
  } else {
    const form = await request.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === "string") body[key] = value;
    });
  }
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await handleGatewayEvent(params.gateway, { query, body }, "WEBHOOK");
  if (result.rejected) throw new AppError(401, "BAD_SIGNATURE", "Signature verification failed.");
  return { received: true };
});
