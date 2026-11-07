import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { guestOrderToken } from "@/server/crypto";
import { handleGatewayEvent } from "@/server/services/payment";

// The customer's browser returns here from the gateway, by redirect or cross-site POST.
// handleGatewayEvent verifies with the gateway itself; nothing in this request is believed.

async function readRequest(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const body: Record<string, string> = {};
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === "string") body[key] = value;
    });
  }
  return { query, body };
}

async function handle(request: NextRequest, context: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await context.params;
  const payload = await readRequest(request);
  const txn = payload.query.txn ?? payload.body.tran_id ?? payload.query.order_id;
  try {
    await handleGatewayEvent(gateway, payload, "CALLBACK");
  } catch (error) {
    console.error(`[payment] callback error from ${gateway}`, error);
  }
  // The order page shows the booking's real state, whatever happened above.
  const payment = txn
    ? await db.payment.findUnique({ where: { merchantTxnId: txn }, include: { booking: { select: { id: true, reference: true, userId: true } } } })
    : null;
  if (!payment) return NextResponse.redirect(`${env.appUrl}/my-orders`, 303);
  const guest = payment.booking.userId ? "" : `&t=${guestOrderToken(payment.booking.id)}`;
  return NextResponse.redirect(`${env.appUrl}/orders/${payment.booking.reference}?from=gateway${guest}`, 303);
}

export const GET = handle;
export const POST = handle;
