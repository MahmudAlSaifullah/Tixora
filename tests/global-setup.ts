import { execSync } from "node:child_process";
import { testEnv } from "./test-env";

/** Brings the test database up to the latest migrations before any test runs. */
export default function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...testEnv() }, stdio: "pipe" });
}
