import "dotenv/config";

export const E2E_PORT = 3100;
export const PASSWORD = "Demo@12345";

export function e2eDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("_e2e")) url.pathname = `${url.pathname.replace(/_test$/, "")}_e2e`;
  return url.toString();
}

export function e2eEnv(): Record<string, string> {
  return {
    DATABASE_URL: e2eDatabaseUrl(),
    APP_URL: `http://localhost:${E2E_PORT}`,
    PAYMENT_MODE: "sandbox",
    PAYMENT_TEST_GATEWAY_ENABLED: "true",
    EMAIL_PROVIDER: "log",
    DISABLE_BACKGROUND_JOBS: "true",
    AUTH_SECRET: process.env.AUTH_SECRET!,
    QR_TOKEN_SECRET: process.env.QR_TOKEN_SECRET!,
    APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET!,
    CRON_SECRET: process.env.CRON_SECRET!,
  };
}
