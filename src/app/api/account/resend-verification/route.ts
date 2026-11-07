import { route } from "@/server/api";
import { requireUser } from "@/server/auth/guards";
import { sendVerificationEmail } from "@/server/services/accounts";

export const POST = route({ limit: { bucket: "resend-verify", max: 3, windowSeconds: 900 } }, async () => {
  const user = await requireUser();
  if (!user.emailVerifiedAt) await sendVerificationEmail(user);
  return { ok: true };
});
