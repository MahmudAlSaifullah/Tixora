/**
 * Self-hosted housekeeping, run inside the server process. Every job is safe to run concurrently,
 * so several instances can each run them. Booking also releases expired holds on demand, so
 * overselling protection never depends on this. On serverless hosts, where no process stays alive,
 * set DISABLE_BACKGROUND_JOBS=true and schedule /api/cron/* instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_BACKGROUND_JOBS === "true") return;

  const { releaseExpiredReservations } = await import("@/server/services/booking");
  const { completeFinishedEvents, sendEventReminders } = await import("@/server/services/event-management");
  const { reconcilePayments } = await import("@/server/services/payment");
  const { pruneRateLimits } = await import("@/server/rate-limit");

  const every = (ms: number, name: string, job: () => Promise<unknown>) => {
    const timer = setInterval(() => {
      job().catch((error) => console.error(`[jobs] ${name} failed`, error));
    }, ms);
    timer.unref?.();
  };
  every(60_000, "release reservations", () => releaseExpiredReservations());
  every(10 * 60_000, "reconcile payments", () => reconcilePayments());
  every(10 * 60_000, "complete events", () => completeFinishedEvents());
  every(60 * 60_000, "event reminders", () => sendEventReminders());
  every(60 * 60_000, "prune rate limits", () => pruneRateLimits());
}
