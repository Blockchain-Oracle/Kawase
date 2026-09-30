// Applies the committed migrations. Run: pnpm --filter @kawase/db db:migrate (reads DATABASE_URL from the root .env).
import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "./client";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { db, pool } = createDb(url, { poolSize: 1 });
await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await pool.end();
console.log("migrations applied");
