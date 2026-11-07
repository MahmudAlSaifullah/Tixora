// Server-side configuration. Secrets are read lazily and fail loudly when missing.

function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error(`${name} must be at least 32 characters in production.`);
  }
  return value;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get qrSecret() {
    return secret("QR_TOKEN_SECRET");
  },
  get signingSecret() {
    return secret("APP_SIGNING_SECRET");
  },
  get cronSecret() {
    return secret("CRON_SECRET");
  },
  get paymentMode(): "sandbox" | "live" {
    return process.env.PAYMENT_MODE === "live" ? "live" : "sandbox";
  },
  /** The test gateway can never be enabled in live mode. */
  get testGatewayEnabled() {
    return this.paymentMode === "sandbox" && process.env.PAYMENT_TEST_GATEWAY_ENABLED === "true";
  },
  get googleEnabled() {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  },
};
