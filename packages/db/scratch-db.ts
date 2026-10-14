// Scratch helper (not committed): creates kawase_buy_market on the local Postgres and applies the migrations to it.
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });
const url = new URL(process.env.DATABASE_URL!);
const admin = new pg.Pool({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(), max: 1 });
const exists = await admin.query("select 1 from pg_database where datname = 'kawase_buy_market'");
if (exists.rowCount === 0) await admin.query("create database kawase_buy_market");
await admin.end();
const pool = new pg.Pool({ connectionString: Object.assign(new URL(url), { pathname: "/kawase_buy_market" }).toString(), max: 1 });
await migrate(drizzle(pool), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await pool.end();
console.log("kawase_buy_market ready");
