import { numeric, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

import { newId } from "../ids";

/** The two Arc networks. On-chain rows also store `chain_id`. */
export const networkEnum = pgEnum("network", ["mainnet", "testnet"]);

const MONEY_PRECISION = 78;

/** Base units as a bigint; large enough for any 256-bit amount. */
export const money = () => numeric({ precision: MONEY_PRECISION, scale: 0, mode: "bigint" });

export const id = () => uuid().primaryKey().$defaultFn(newId);
export const timestampTz = () => timestamp({ withTimezone: true, mode: "date" });
export const createdAt = () => timestampTz().defaultNow().notNull();
export const updatedAt = () =>
  timestampTz()
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date());
