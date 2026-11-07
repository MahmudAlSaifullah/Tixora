import "dotenv/config";

/** Tests always run against the *_test database, never the development one. */
export function testEnv() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("_test")) url.pathname += "_test";
  return {
    DATABASE_URL: url.toString(),
    QR_TOKEN_SECRET: "test-qr-secret-test-qr-secret-test-qr",
    APP_SIGNING_SECRET: "test-signing-secret-test-signing-secret",
    CRON_SECRET: "test-cron-secret-test-cron-secret-test",
    PAYMENT_MODE: "sandbox",
    PAYMENT_TEST_GATEWAY_ENABLED: "true",
    EMAIL_PROVIDER: "none",
    APP_URL: "http://localhost:3000",
    DB_POOL_MAX: "20",
  };
}
