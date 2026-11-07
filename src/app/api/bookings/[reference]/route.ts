import { route } from "@/server/api";
import { getCurrentUser } from "@/server/auth/guards";
import { getBookingForViewer } from "@/server/services/booking";

export const GET = route({ limit: { bucket: "booking-read", max: 120, windowSeconds: 60 } }, async (request, params) => {
  const user = await getCurrentUser();
  const booking = await getBookingForViewer(params.reference, {
    userId: user?.id,
    isAdmin: user?.role === "SUPER_ADMIN",
    guestToken: request.nextUrl.searchParams.get("t"),
  });
  return {
    reference: booking.reference,
    status: booking.status,
    expiresAt: booking.expiresAt,
    totalMinor: booking.totalMinor,
    currency: booking.currency,
    ticketCount: booking.tickets.length,
    latestPaymentStatus: booking.payments[0]?.status ?? null,
  };
});
