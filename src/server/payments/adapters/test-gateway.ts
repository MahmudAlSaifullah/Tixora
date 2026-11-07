import { db } from "../../db";
import { env } from "../../env";
import { hmac, safeEqual } from "../../crypto";
import type { CallbackRequest, InitiateContext, ParsedCallback, PaymentContext, PaymentGateway, RefundResult, VerifiedPayment } from "../types";

// A clearly labelled stand-in for a real gateway, for use before merchant credentials exist.
// No money moves. A tester decides the outcome on a hosted page marked TEST MODE, and the decision
// goes through the same callback, signature check and verification path a real gateway uses.
// The adapter refuses to run when PAYMENT_MODE=live.

export type TestOutcome = "SUCCESS" | "FAILED" | "CANCELLED";

const sign = (txn: string, outcome: string, amountMinor: number) =>
  hmac(env.signingSecret, `test-gateway:${txn}:${outcome}:${amountMinor}`);

export const testPageSignature = (txn: string) => hmac(env.signingSecret, `test-gateway-page:${txn}`);

export const verifyTestPageSignature = (txn: string, signature: string) => safeEqual(testPageSignature(txn), signature);

export const signTestDecision = sign;

export const testGateway: PaymentGateway = {
  code: "test",
  label: "Test gateway",
  description: "Sandbox only. No real money moves. Choose the outcome on the next page.",
  instruments: ["Test card", "Test wallet"],
  isTestOnly: true,

  isAvailable: () => env.testGatewayEnabled,

  async initiate(ctx: InitiateContext) {
    const sig = testPageSignature(ctx.merchantTxnId);
    return { redirectUrl: `${env.appUrl}/payments/test/${ctx.merchantTxnId}?sig=${encodeURIComponent(sig)}` };
  },

  parseCallback({ body }: CallbackRequest): ParsedCallback {
    const merchantTxnId = body.txn ?? null;
    const outcome = (body.outcome ?? "") as TestOutcome;
    const amount = Number(body.amount);
    const signatureValid = Boolean(merchantTxnId && body.sig && safeEqual(sign(merchantTxnId, outcome, amount), body.sig));
    return {
      merchantTxnId,
      claimedStatus: outcome === "SUCCESS" || outcome === "FAILED" || outcome === "CANCELLED" ? outcome : "UNKNOWN",
      signatureValid,
      dedupeKey: `test:${merchantTxnId}:${outcome}:${body.sig ?? "unsigned"}`,
      raw: { txn: merchantTxnId, outcome, amount },
    };
  },

  /** Stands in for the gateway's status API by reading the signed decision the page recorded. */
  async verify(payment: PaymentContext): Promise<VerifiedPayment> {
    const row = await db.paymentTransaction.findFirst({
      where: { payment: { merchantTxnId: payment.merchantTxnId }, status: "TEST_DECISION", signatureValid: true },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return { status: "PENDING" };
    const outcome = (row.payload as { outcome?: TestOutcome })?.outcome;
    if (outcome === "SUCCESS") {
      return {
        status: "SUCCEEDED",
        amountMinor: row.amountMinor ?? undefined,
        currency: payment.currency,
        gatewayTxnId: `TEST-${payment.merchantTxnId}`,
        method: "Test gateway",
      };
    }
    return { status: outcome === "CANCELLED" ? "CANCELLED" : "FAILED", reason: `Test gateway outcome: ${outcome}` };
  },

  async refund(payment: PaymentContext, amountMinor: number): Promise<RefundResult> {
    return { status: "COMPLETED", refundId: `TEST-RF-${payment.merchantTxnId}-${amountMinor}` };
  },
};
