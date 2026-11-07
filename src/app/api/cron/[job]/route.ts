import { assertCron, route } from "@/server/api";
import { notFound } from "@/server/errors";
import { pruneRateLimits } from "@/server/rate-limit";
import { releaseExpiredReservations } from "@/server/services/booking";
import { completeFinishedEvents, sendEventReminders } from "@/server/services/event-management";
import { reconcilePayments } from "@/server/services/payment";

/** Scheduled jobs. Call with "Authorization: Bearer $CRON_SECRET". See README for schedules. */
const handler = route({ sameOrigin: false }, async (request, params) => {
  assertCron(request);
  switch (params.job) {
    case "release-reservations":
      return { released: await releaseExpiredReservations() };
    case "reconcile-payments":
      return { results: await reconcilePayments() };
    case "complete-events":
      return { completed: await completeFinishedEvents() };
    case "event-reminders":
      return { sent: await sendEventReminders() };
    case "prune":
      return { removed: await pruneRateLimits() };
    default:
      throw notFound("Unknown job.");
  }
});

export const GET = handler;
export const POST = handler;
