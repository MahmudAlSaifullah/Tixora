// Creates the databases named in DATABASE_URL and its _test sibling if they do not exist.
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const db of [name, `${name}_test`]) {
    if (!/^[a-z0-9_]+$/.test(db)) throw new Error(`Refusing unusual database name: ${db}`);
    const found = await client.query("select 1 from pg_database where datname = $1", [db]);
    if (found.rowCount) {
      console.log(`exists: ${db}`);
    } else {
      await client.query(`create database ${db}`);
      console.log(`created: ${db}`);
    }
  }
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
