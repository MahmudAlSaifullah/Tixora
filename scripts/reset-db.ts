// Development only: wipes every table, then reseeds the demo data.
import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  const url = process.env.DATABASE_URL!;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
