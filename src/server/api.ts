import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, forbidden } from "./errors";
import { rateLimit } from "./rate-limit";
import { env } from "./env";

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "local";
}

/** CSRF defence for cookie-authenticated JSON APIs: browsers always send Origin on cross-site POSTs. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser client: no ambient cookies are at risk.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Handled below: an unparsable Origin never matches.
  }
  if (originHost !== host && origin !== env.appUrl) throw forbidden("Cross-site request refused.");
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Please check your input.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

type Params = Record<string, string>;

interface RouteOptions {
  /** Requests per window, per client IP. */
  limit?: { bucket: string; max: number; windowSeconds: number };
  /** Set false only for gateway webhooks and cron, which authenticate another way. */
  sameOrigin?: boolean;
}

/** Wraps a handler with rate limiting, CSRF protection and uniform error responses. */
export function route(options: RouteOptions, handler: (request: NextRequest, params: Params) => Promise<Response | unknown>) {
  return async (request: NextRequest, context: { params: Promise<Params> }) => {
    try {
      if (options.sameOrigin !== false && request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      if (options.limit) await rateLimit(`${options.limit.bucket}:${clientIp(request)}`, options.limit.max, options.limit.windowSeconds);
      const result = await handler(request, await context.params);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "The request body was not valid JSON.");
  }
  return schema.parse(body);
}

/** Runs a scheduled job only for callers presenting the cron secret. */
export function assertCron(request: Request) {
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${env.cronSecret}`) throw new AppError(401, "UNAUTHORIZED", "Invalid cron secret.");
}
