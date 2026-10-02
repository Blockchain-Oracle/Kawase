// Drops and recreates the database named in DATABASE_URL, for a builder's own scratch copy only (refuses the shared
// `kawase` database). Run: pnpm --filter @kawase/db exec tsx test/reset-database.ts && pnpm --filter @kawase/db db:migrate
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const name = new URL(url).pathname.replace(/^\//, "");
if (!/^[a-z0-9_]+$/.test(name) || name === "kawase") throw new Error(`refusing to reset ${name}`);
const admin = new URL(url);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`drop database if exists ${name} with (force)`);
await client.query(`create database ${name}`);
await client.end();
console.log(`reset ${name}`);
