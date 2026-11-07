import { parseJson, route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { getBookingForViewer } from "@/server/services/booking";
import { initiatePayment } from "@/server/services/payment";
import { initiatePaymentSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "pay", max: 20, windowSeconds: 60 } }, async (request) => {
  const input = await parseJson(request, initiatePaymentSchema);
  const user = await getCurrentUser();
  const booking = await getBookingForViewer(input.reference, { userId: user?.id, guestToken: input.guestToken });
  const { redirectUrl } = await initiatePayment(booking.id, input.gateway);
  return { redirectUrl };
});
