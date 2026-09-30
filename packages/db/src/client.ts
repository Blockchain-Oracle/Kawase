import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index";

export type Db = NodePgDatabase<typeof schema>;

const DEFAULT_POOL_SIZE = 10;

/** One pool per process. Callers close it with `pool.end()` on shutdown. */
export function createDb(url: string, options: { poolSize?: number } = {}): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max: options.poolSize ?? DEFAULT_POOL_SIZE });
  return { db: drizzle(pool, { schema, casing: "snake_case" }), pool };
}
