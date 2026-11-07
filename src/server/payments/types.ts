// Contract every payment gateway implements. Only the server talks to gateways, and a booking is
// confirmed solely from verify(): an authenticated server-to-server status check. Browser
// redirects and callbacks merely prompt that check; their claims are never believed.

export interface PaymentContext {
  merchantTxnId: string;
  gatewayPaymentId: string | null;
  gatewayTxnId: string | null;
  amountMinor: number;
  currency: string;
}

export interface InitiateContext extends PaymentContext {
  bookingReference: string;
  eventTitle: string;
  customer: { name: string; email: string; phone: string };
  /** The gateway returns the browser and posts events to these. */
  urls: { success: string; fail: string; cancel: string; webhook: string };
}

export interface InitiateResult {
  redirectUrl: string;
  gatewayPaymentId?: string;
  raw?: unknown;
}

export interface ParsedCallback {
  merchantTxnId: string | null;
  gatewayPaymentId?: string | null;
  /** What the sender claims happened. Only used to decide whether to run a capture step. */
  claimedStatus: "SUCCESS" | "FAILED" | "CANCELLED" | "UNKNOWN";
  /** True/false when the gateway signs callbacks; null when it has no signature scheme. */
  signatureValid: boolean | null;
  /** Identifies this exact gateway event, so replays collapse onto one log row. */
  dedupeKey: string;
  raw: unknown;
}

export interface VerifiedPayment {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "PENDING";
  amountMinor?: number;
  currency?: string;
  gatewayTxnId?: string | null;
  method?: string | null;
  reason?: string;
  raw?: unknown;
}

export interface RefundResult {
  status: "COMPLETED" | "PENDING";
  refundId?: string | null;
  raw?: unknown;
}

export interface CallbackRequest {
  query: Record<string, string>;
  body: Record<string, string>;
}

export interface PaymentGateway {
  code: string;
  label: string;
  description: string;
  /** Instruments shown at checkout, e.g. ["Visa", "Mastercard"]. */
  instruments: string[];
  /** True for adapters that move no real money. Rendered with a visible TEST label. */
  isTestOnly: boolean;
  isAvailable(): boolean;
  initiate(ctx: InitiateContext): Promise<InitiateResult>;
  parseCallback(request: CallbackRequest): ParsedCallback;
  verify(payment: PaymentContext, callback?: ParsedCallback): Promise<VerifiedPayment>;
  refund(payment: PaymentContext, amountMinor: number, reason: string): Promise<RefundResult>;
}

/** The gateway offers no refund API: staff must refund in its portal, then record it here. */
export class ManualRefundRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualRefundRequired";
  }
}

const SENSITIVE_KEY = /(pass|secret|pin|otp|cvv|cvc|card_?no|card_?num|pan|token|authorization|private)/i;

/** Removes anything credential-shaped before a gateway payload is written to the log. */
export function scrubPayload(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => scrubPayload(entry, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, entry]) => [key, scrubPayload(entry, depth + 1)]),
  );
}

export const minorToDecimalString = (minor: number) => (minor / 100).toFixed(2);

export const decimalStringToMinor = (value: string | number | undefined | null): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};
