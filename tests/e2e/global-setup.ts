import { execSync } from "node:child_process";
import { Client } from "pg";
import { e2eDatabaseUrl, e2eEnv } from "./e2e-env";

/** A clean, freshly seeded database for each run. */
export default async function globalSetup() {
  const target = new URL(e2eDatabaseUrl());
  const name = target.pathname.slice(1);
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
  if (!exists.rowCount) await client.query(`create database ${name}`);
  await client.end();

  const env = { ...process.env, ...e2eEnv() };
  const db = new Client({ connectionString: target.toString() });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await db.end();
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
