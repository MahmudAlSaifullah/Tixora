import { db } from "./db";
import { tooMany } from "./errors";

/** Removes expired counters so the table does not grow forever. */
export async function pruneRateLimits() {
  const { count } = await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return count;
}

/**
 * Fixed-window limiter stored in Postgres, so limits hold across instances and restarts.
 * The upsert is a single atomic statement. If the limiter's own query fails we let the request
 * through: a database problem should surface in the real query, not as a false "too many attempts".
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  let count = 0;
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::double precision))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < now()
          THEN now() + make_interval(secs => ${windowSeconds}::double precision)
          ELSE "RateLimit"."resetAt" END
      RETURNING "count"`;
    count = rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[rate-limit] check failed", error);
    return;
  }
  if (count > limit) throw tooMany();
}
