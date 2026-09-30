import { config } from "dotenv";

import { createDb, type Db } from "../src/index";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

/** The local development database (deploy/compose.dev.yaml). Tests clean up the rows they create. */
export function testDb(): { db: Db; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url, { poolSize: 2 });
  return { db, close: () => pool.end() };
}
