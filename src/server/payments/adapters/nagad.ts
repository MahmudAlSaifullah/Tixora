import { constants, createSign, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { env } from "../../env";
import {
  decimalStringToMinor,
  ManualRefundRequired,
  minorToDecimalString,
  type CallbackRequest,
  type InitiateContext,
  type ParsedCallback,
  type PaymentContext,
  type PaymentGateway,
  type VerifiedPayment,
} from "../types";

// Nagad Remote Payment Gateway (merchant API v0.2.0). Request bodies are RSA-encrypted and signed.
// Needs NAGAD_MERCHANT_ID, NAGAD_MERCHANT_NUMBER, NAGAD_MERCHANT_PRIVATE_KEY and NAGAD_PUBLIC_KEY.

const base = () =>
  env.paymentMode === "live"
    ? "https://api.mynagad.com/api/dfs"
    : "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs";

const merchantId = () => process.env.NAGAD_MERCHANT_ID ?? "";

const pem = (body: string, label: string) => `-----BEGIN ${label}-----\n${body.replace(/\s+/g, "")}\n-----END ${label}-----`;
const merchantKey = () => pem(process.env.NAGAD_MERCHANT_PRIVATE_KEY ?? "", "PRIVATE KEY");
const nagadKey = () => pem(process.env.NAGAD_PUBLIC_KEY ?? "", "PUBLIC KEY");

const encrypt = (data: string) =>
  publicEncrypt({ key: nagadKey(), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(data)).toString("base64");
const decrypt = (data: string) =>
  privateDecrypt({ key: merchantKey(), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(data, "base64")).toString();
const sign = (data: string) => createSign("RSA-SHA256").update(data).sign(merchantKey(), "base64");

/** Nagad expects yyyyMMddHHmmss in Bangladesh time. */
function dhakaTimestamp(): string {
  const shifted = new Date(Date.now() + 6 * 3_600_000).toISOString();
  return shifted.replace(/[-:T]/g, "").slice(0, 14);
}

const headers = () => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-KM-Api-Version": "v-0.2.0",
  "X-KM-IP-V4": "127.0.0.1",
  "X-KM-Client-Type": "PC_WEB",
});

export const nagadGateway: PaymentGateway = {
  code: "nagad",
  label: "Nagad",
  description: "Pay from your Nagad wallet. You will confirm on Nagad's own page.",
  instruments: ["Nagad"],
  isTestOnly: false,

  isAvailable: () =>
    Boolean(merchantId() && process.env.NAGAD_MERCHANT_NUMBER && process.env.NAGAD_MERCHANT_PRIVATE_KEY && process.env.NAGAD_PUBLIC_KEY),

  async initiate(ctx: InitiateContext) {
    const orderId = ctx.merchantTxnId;
    const datetime = dhakaTimestamp();
    const sensitive = JSON.stringify({ merchantId: merchantId(), datetime, orderId, challenge: randomBytes(20).toString("hex") });
    const initResponse = await fetch(`${base()}/check-out/initialize/${merchantId()}/${orderId}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        accountNumber: process.env.NAGAD_MERCHANT_NUMBER,
        dateTime: datetime,
        sensitiveData: encrypt(sensitive),
        signature: sign(sensitive),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const init = (await initResponse.json()) as { sensitiveData?: string; message?: string };
    if (!init.sensitiveData) throw new Error(`Nagad initialize failed: ${init.message ?? initResponse.status}`);
    const { paymentReferenceId, challenge } = JSON.parse(decrypt(init.sensitiveData)) as { paymentReferenceId: string; challenge: string };

    const order = JSON.stringify({
      merchantId: merchantId(),
      orderId,
      currencyCode: "050", // BDT
      amount: minorToDecimalString(ctx.amountMinor),
      challenge,
    });
    const completeResponse = await fetch(`${base()}/check-out/complete/${paymentReferenceId}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        sensitiveData: encrypt(order),
        signature: sign(order),
        merchantCallbackURL: ctx.urls.success,
        additionalMerchantInfo: { bookingReference: ctx.bookingReference },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const complete = (await completeResponse.json()) as { callBackUrl?: string; status?: string; message?: string };
    if (complete.status !== "Success" || !complete.callBackUrl) throw new Error(`Nagad checkout failed: ${complete.message ?? complete.status}`);
    return { redirectUrl: complete.callBackUrl, gatewayPaymentId: paymentReferenceId };
  },

  parseCallback({ query }: CallbackRequest): ParsedCallback {
    const status = (query.status ?? "").toLowerCase();
    return {
      merchantTxnId: query.order_id ?? query.txn ?? null,
      gatewayPaymentId: query.payment_ref_id ?? null,
      claimedStatus: status === "success" ? "SUCCESS" : status === "aborted" || status === "cancelled" ? "CANCELLED" : status ? "FAILED" : "UNKNOWN",
      signatureValid: null,
      dedupeKey: `nagad:${query.payment_ref_id}:${status}`,
      raw: query,
    };
  },

  async verify(payment: PaymentContext): Promise<VerifiedPayment> {
    if (!payment.gatewayPaymentId) return { status: "PENDING", reason: "No Nagad reference yet" };
    const response = await fetch(`${base()}/verify/payment/${payment.gatewayPaymentId}`, { headers: headers(), signal: AbortSignal.timeout(20_000) });
    const data = (await response.json()) as { status?: string; amount?: string; orderId?: string; issuerPaymentRefNo?: string; message?: string };
    if (data.orderId && data.orderId !== payment.merchantTxnId) return { status: "FAILED", reason: "Nagad order id mismatch", raw: data };
    if (data.status === "Success") {
      return { status: "SUCCEEDED", amountMinor: decimalStringToMinor(data.amount), currency: "BDT", gatewayTxnId: data.issuerPaymentRefNo, method: "Nagad", raw: data };
    }
    if (data.status === "Aborted" || data.status === "Cancelled") return { status: "CANCELLED", reason: data.status, raw: data };
    if (data.status === "Initiated" || data.status === "Ready" || !data.status) return { status: "PENDING", raw: data };
    return { status: "FAILED", reason: data.message ?? data.status, raw: data };
  },

  async refund() {
    throw new ManualRefundRequired("Nagad refunds are made in the Nagad merchant portal. Record the reference here afterwards.");
  },
};
