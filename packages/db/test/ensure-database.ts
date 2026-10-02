// Creates the database named in DATABASE_URL when it does not exist yet (a builder's own copy on the shared local
// server, so its migrations never interleave with another worktree's). Run: pnpm --filter @kawase/db exec tsx test/ensure-database.ts
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const target = new URL(url);
const name = target.pathname.replace(/^\//, "");
if (!/^[a-z0-9_]+$/.test(name)) throw new Error("unexpected database name");
const admin = new URL(url);
admin.pathname = "/postgres";

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const found = await client.query("select 1 from pg_database where datname = $1", [name]);
if (found.rowCount === 0) await client.query(`create database ${name}`);
await client.end();
console.log(found.rowCount === 0 ? `created ${name}` : `${name} exists`);
