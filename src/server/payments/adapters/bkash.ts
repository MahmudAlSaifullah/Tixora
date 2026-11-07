import { env } from "../../env";
import { decimalStringToMinor, minorToDecimalString, type CallbackRequest, type InitiateContext, type ParsedCallback, type PaymentContext, type PaymentGateway, type VerifiedPayment } from "../types";

// bKash Tokenized Checkout. Docs: https://developer.bka.sh/docs
// Needs BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME and BKASH_PASSWORD.
// bKash callbacks are unsigned: authenticity comes from execute and status calls made with our credentials.

const base = () =>
  env.paymentMode === "live"
    ? "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout"
    : "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout";

let cached: { token: string; expiresAt: number } | null = null;

async function grantToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await fetch(`${base()}/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: process.env.BKASH_USERNAME ?? "",
      password: process.env.BKASH_PASSWORD ?? "",
    },
    body: JSON.stringify({ app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as { id_token?: string; expires_in?: number; statusMessage?: string };
  if (!data.id_token) throw new Error(`bKash token grant failed: ${data.statusMessage ?? response.status}`);
  // Refresh a minute before the documented expiry.
  cached = { token: data.id_token, expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
  return data.id_token;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: await grantToken(),
      "X-APP-Key": process.env.BKASH_APP_KEY ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return (await response.json()) as T;
}

interface BkashStatus {
  statusCode?: string;
  statusMessage?: string;
  transactionStatus?: string;
  trxID?: string;
  amount?: string;
  currency?: string;
}

const toVerified = (data: BkashStatus): VerifiedPayment => {
  if (data.transactionStatus === "Completed") {
    return { status: "SUCCEEDED", amountMinor: decimalStringToMinor(data.amount), currency: data.currency ?? "BDT", gatewayTxnId: data.trxID, method: "bKash", raw: data };
  }
  if (data.transactionStatus === "Initiated" || data.transactionStatus === "Pending" || !data.transactionStatus) {
    return { status: "PENDING", reason: data.statusMessage, raw: data };
  }
  return { status: "FAILED", reason: data.statusMessage ?? data.transactionStatus, raw: data };
};

export const bkashGateway: PaymentGateway = {
  code: "bkash",
  label: "bKash",
  description: "Pay from your bKash wallet. You will confirm on bKash's own page.",
  instruments: ["bKash"],
  isTestOnly: false,

  isAvailable: () =>
    Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET && process.env.BKASH_USERNAME && process.env.BKASH_PASSWORD),

  async initiate(ctx: InitiateContext) {
    const data = await call<{ paymentID?: string; bkashURL?: string; statusCode?: string; statusMessage?: string }>("/create", {
      mode: "0011",
      payerReference: ctx.customer.phone,
      callbackURL: ctx.urls.success,
      amount: minorToDecimalString(ctx.amountMinor),
      currency: ctx.currency,
      intent: "sale",
      merchantInvoiceNumber: ctx.merchantTxnId,
    });
    if (!data.paymentID || !data.bkashURL) throw new Error(`bKash rejected the payment: ${data.statusMessage ?? data.statusCode}`);
    return { redirectUrl: data.bkashURL, gatewayPaymentId: data.paymentID, raw: data };
  },

  parseCallback({ query }: CallbackRequest): ParsedCallback {
    const status = (query.status ?? "").toLowerCase();
    return {
      merchantTxnId: query.txn ?? null,
      gatewayPaymentId: query.paymentID ?? null,
      claimedStatus: status === "success" ? "SUCCESS" : status === "cancel" ? "CANCELLED" : status === "failure" ? "FAILED" : "UNKNOWN",
      signatureValid: null,
      dedupeKey: `bkash:${query.paymentID}:${status}`,
      raw: query,
    };
  },

  /** bKash captures on /execute. It runs only after a success redirect, then status is confirmed. */
  async verify(payment: PaymentContext, callback?: ParsedCallback): Promise<VerifiedPayment> {
    const paymentID = payment.gatewayPaymentId;
    if (!paymentID) return { status: "PENDING", reason: "No bKash paymentID yet" };
    if (callback?.claimedStatus === "CANCELLED") return { status: "CANCELLED", reason: "Cancelled on bKash" };
    if (callback?.claimedStatus === "FAILED") return { status: "FAILED", reason: "Failed on bKash" };
    if (callback?.claimedStatus === "SUCCESS") {
      const executed = await call<BkashStatus>("/execute", { paymentID });
      if (executed.transactionStatus === "Completed") return toVerified(executed);
      // Fall through: a retried execute reports an error even though the payment was captured.
    }
    return toVerified(await call<BkashStatus>("/payment/status", { paymentID }));
  },

  async refund(payment: PaymentContext, amountMinor: number, reason: string) {
    if (!payment.gatewayPaymentId || !payment.gatewayTxnId) throw new Error("This payment is missing its bKash references.");
    const data = await call<{ refundTrxID?: string; transactionStatus?: string; statusMessage?: string }>("/payment/refund", {
      paymentID: payment.gatewayPaymentId,
      trxID: payment.gatewayTxnId,
      amount: minorToDecimalString(amountMinor),
      reason: reason.slice(0, 80),
      sku: "ticket",
    });
    if (!data.refundTrxID) throw new Error(`bKash refund failed: ${data.statusMessage ?? "unknown error"}`);
    return { status: data.transactionStatus === "Completed" ? "COMPLETED" : "PENDING", refundId: data.refundTrxID, raw: data } as const;
  },
};
