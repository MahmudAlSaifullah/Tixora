import { createHash } from "node:crypto";
import { env } from "../../env";
import { safeEqual } from "../../crypto";
import {
  decimalStringToMinor,
  minorToDecimalString,
  type CallbackRequest,
  type InitiateContext,
  type ParsedCallback,
  type PaymentContext,
  type PaymentGateway,
  type VerifiedPayment,
} from "../types";

// SSLCommerz hosted checkout: Visa, Mastercard, Amex, plus local mobile banking.
// Docs: https://developer.sslcommerz.com/doc/v4/
// Needs SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD.

const base = () => (env.paymentMode === "live" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");
const storeId = () => process.env.SSLCOMMERZ_STORE_ID ?? "";
const storePassword = () => process.env.SSLCOMMERZ_STORE_PASSWORD ?? "";
const md5 = (value: string) => createHash("md5").update(value).digest("hex");

const OK_STATUSES = new Set(["VALID", "VALIDATED"]);

/** Recomputes verify_sign as documented by SSLCommerz. Exported for unit tests. */
export function sslcommerzSignatureValid(params: Record<string, string>, password: string): boolean {
  const { verify_sign: signature, verify_key: keys } = params;
  if (!signature || !keys) return false;
  const pairs = keys.split(",").map((key) => [key, params[key] ?? ""] as const);
  pairs.push(["store_passwd", md5(password)]);
  pairs.sort(([a], [b]) => a.localeCompare(b));
  return safeEqual(md5(pairs.map(([k, v]) => `${k}=${v}`).join("&")), signature);
}

export const sslcommerzGateway: PaymentGateway = {
  code: "sslcommerz",
  label: "Card or mobile banking",
  description: "Pay securely by Visa, Mastercard or mobile banking through SSLCommerz.",
  instruments: ["Visa", "Mastercard", "Amex", "Mobile banking"],
  isTestOnly: false,

  isAvailable: () => Boolean(storeId() && storePassword()),

  async initiate(ctx: InitiateContext) {
    const form = new URLSearchParams({
      store_id: storeId(),
      store_passwd: storePassword(),
      total_amount: minorToDecimalString(ctx.amountMinor),
      currency: ctx.currency,
      tran_id: ctx.merchantTxnId,
      success_url: ctx.urls.success,
      fail_url: ctx.urls.fail,
      cancel_url: ctx.urls.cancel,
      ipn_url: ctx.urls.webhook,
      cus_name: ctx.customer.name,
      cus_email: ctx.customer.email,
      cus_phone: ctx.customer.phone,
      cus_add1: "N/A",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      product_name: ctx.eventTitle.slice(0, 100),
      product_category: "Event ticket",
      product_profile: "non-physical-goods",
      value_a: ctx.bookingReference,
    });
    const response = await fetch(`${base()}/gwprocess/v4/api.php`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
    const data = (await response.json()) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string };
    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      throw new Error(`SSLCommerz rejected the session: ${data.failedreason ?? "unknown reason"}`);
    }
    return { redirectUrl: data.GatewayPageURL, gatewayPaymentId: data.sessionkey, raw: data };
  },

  parseCallback({ body, query }: CallbackRequest): ParsedCallback {
    const params = { ...query, ...body };
    const status = (params.status ?? "").toUpperCase();
    const claimedStatus = OK_STATUSES.has(status)
      ? "SUCCESS"
      : status === "CANCELLED"
        ? "CANCELLED"
        : status === "FAILED" || status === "EXPIRED" || status === "UNATTEMPTED"
          ? "FAILED"
          : "UNKNOWN";
    return {
      merchantTxnId: params.tran_id ?? null,
      claimedStatus,
      // Browser redirects may lack verify_sign. Only the IPN is required to carry it.
      signatureValid: params.verify_sign ? sslcommerzSignatureValid(params, storePassword()) : null,
      dedupeKey: `sslcommerz:${params.tran_id}:${params.val_id ?? status}:${params.bank_tran_id ?? ""}`,
      raw: params,
    };
  },

  /** Queries by our own transaction id, so the answer does not depend on anything in the callback. */
  async verify(payment: PaymentContext): Promise<VerifiedPayment> {
    const url = new URL(`${base()}/validator/api/merchantTransIDvalidationAPI.php`);
    url.search = new URLSearchParams({
      tran_id: payment.merchantTxnId,
      store_id: storeId(),
      store_passwd: storePassword(),
      format: "json",
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = (await response.json()) as {
      APIConnect?: string;
      element?: { status?: string; tran_id?: string; amount?: string; currency_type?: string; bank_tran_id?: string; card_type?: string; error?: string }[];
    };
    if (data.APIConnect !== "DONE") return { status: "PENDING", reason: `SSLCommerz API: ${data.APIConnect}`, raw: data };
    const elements = data.element ?? [];
    const paid = elements.find((e) => OK_STATUSES.has((e.status ?? "").toUpperCase()) && e.tran_id === payment.merchantTxnId);
    if (paid) {
      return {
        status: "SUCCEEDED",
        amountMinor: decimalStringToMinor(paid.amount),
        currency: paid.currency_type ?? payment.currency,
        gatewayTxnId: paid.bank_tran_id,
        method: paid.card_type ?? null,
        raw: data,
      };
    }
    const latest = elements[0];
    const status = (latest?.status ?? "").toUpperCase();
    if (status === "CANCELLED") return { status: "CANCELLED", reason: "Cancelled at SSLCommerz", raw: data };
    if (status === "FAILED" || status === "EXPIRED") return { status: "FAILED", reason: latest?.error || status, raw: data };
    return { status: "PENDING", raw: data };
  },

  async refund(payment: PaymentContext, amountMinor: number, reason: string) {
    if (!payment.gatewayTxnId) throw new Error("This payment has no bank transaction id to refund against.");
    const url = new URL(`${base()}/validator/api/merchantTransIDvalidationAPI.php`);
    url.search = new URLSearchParams({
      bank_tran_id: payment.gatewayTxnId,
      refund_amount: minorToDecimalString(amountMinor),
      refund_remarks: reason.slice(0, 100),
      store_id: storeId(),
      store_passwd: storePassword(),
      format: "json",
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = (await response.json()) as { APIConnect?: string; status?: string; refund_ref_id?: string; errorReason?: string };
    if (data.APIConnect !== "DONE" || (data.status !== "success" && data.status !== "processing")) {
      throw new Error(`SSLCommerz refund failed: ${data.errorReason ?? data.status ?? data.APIConnect}`);
    }
    return { status: data.status === "success" ? "COMPLETED" : "PENDING", refundId: data.refund_ref_id, raw: data } as const;
  },
};
