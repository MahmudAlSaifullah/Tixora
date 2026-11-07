import { parseJson, route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { guestOrderToken } from "@/server/crypto";
import { createBooking } from "@/server/services/booking";
import { createBookingSchema } from "@/lib/validation";

export const POST = route({ limit: { bucket: "booking", max: 30, windowSeconds: 60 } }, async (request) => {
  const input = await parseJson(request, createBookingSchema);
  const user = await getCurrentUser();
  const { booking, reused } = await createBooking(input, { userId: user?.id });
  return {
    reference: booking.reference,
    status: booking.status,
    expiresAt: booking.expiresAt,
    totalMinor: booking.totalMinor,
    reused,
    guestToken: booking.userId ? null : guestOrderToken(booking.id),
  };
});
