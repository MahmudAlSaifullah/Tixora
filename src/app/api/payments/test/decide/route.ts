import { z } from "zod";
import { parseJson, route } from "@/server/api";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { forbidden, notFound } from "@/server/errors";
import { guestOrderToken } from "@/server/crypto";
import { signTestDecision, testGateway, verifyTestPageSignature } from "@/server/payments/adapters/test-gateway";
import { handleGatewayEvent } from "@/server/services/payment";

const schema = z.object({
  txn: z.string().min(4).max(60),
  sig: z.string().min(10).max(200),
  outcome: z.enum(["SUCCESS", "FAILED", "CANCELLED"]),
});

/**
 * Backs the TEST MODE page. It records the tester's choice as the sandbox gateway's own record,
 * then runs the ordinary callback path. It does not exist unless PAYMENT_MODE is sandbox and the
 * test gateway is enabled.
 */
export const POST = route({ limit: { bucket: "test-pay", max: 30, windowSeconds: 60 } }, async (request) => {
  if (!testGateway.isAvailable()) throw notFound();
  const { txn, sig, outcome } = await parseJson(request, schema);
  if (!verifyTestPageSignature(txn, sig)) throw forbidden("This test payment link is invalid.");
  const payment = await db.payment.findUnique({ where: { merchantTxnId: txn }, include: { booking: true } });
  if (!payment || payment.gateway !== "test") throw notFound();

  const decision = signTestDecision(txn, outcome, payment.amountMinor);
  await db.paymentTransaction.create({
    data: { paymentId: payment.id, type: "CALLBACK", status: "TEST_DECISION", signatureValid: true, amountMinor: payment.amountMinor, payload: { outcome } },
  });
  await handleGatewayEvent("test", { query: {}, body: { txn, outcome, amount: String(payment.amountMinor), sig: decision } }, "CALLBACK");

  const guest = payment.booking.userId ? "" : `&t=${guestOrderToken(payment.booking.id)}`;
  return { redirectUrl: `${env.appUrl}/orders/${payment.booking.reference}?from=gateway${guest}` };
});
