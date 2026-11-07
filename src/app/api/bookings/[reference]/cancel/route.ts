import { route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { conflict } from "@/server/errors";
import { cancelPendingBooking, getBookingForViewer } from "@/server/services/booking";

/** Abandons an unpaid checkout and releases its reservation straight away. */
export const POST = route({ limit: { bucket: "booking-cancel", max: 30, windowSeconds: 60 } }, async (request, params) => {
  const user = await getCurrentUser();
  const booking = await getBookingForViewer(params.reference, {
    userId: user?.id,
    guestToken: request.nextUrl.searchParams.get("t"),
  });
  if (!(await cancelPendingBooking(booking.id))) throw conflict("This order can no longer be cancelled.");
  return { ok: true };
});
