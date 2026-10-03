// Runs a command against a private database (kawase_b1) on the local Postgres, so B1's migrations never touch the
// shared dev database. Never prints the URL. Usage: tsx .spike/with-b1-db.ts <command> [args...]
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const shared = new URL(process.env.DATABASE_URL!);
const admin = new pg.Client({ connectionString: shared.toString() });
await admin.connect();
if (process.env.RESET_B1) await admin.query("drop database if exists kawase_b1");
const exists = await admin.query("select 1 from pg_database where datname = 'kawase_b1'");
if (exists.rowCount === 0) await admin.query("create database kawase_b1");
await admin.end();
const own = new URL(shared.toString());
own.pathname = "/kawase_b1";
const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command!, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: own.toString() } });
process.exit(result.status ?? 1);
