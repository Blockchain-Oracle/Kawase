// The user's wallet is one Turnkey-held address used on both networks; the agent's wallets are Circle
// developer-controlled wallets per network; the relayer is a plain key on the server (spikes 15 and 16).
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const walletRoleEnum = pgEnum("wallet_role", [
  "user",
  "marketplace",
  "external",
  "ops_redeemer",
  "relayer",
  "faucet_drip",
]);
export const custodyEnum = pgEnum("custody", ["turnkey", "circle_dcw", "external"]);
export const walletStatusEnum = pgEnum("wallet_status", ["active", "retired"]);

export const wallets = pgTable(
  "wallets",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    /** Null for the user's wallet: one address on both networks. */
    network: networkEnum(),
    role: walletRoleEnum().notNull(),
    custody: custodyEnum().notNull(),
    address: text().notNull(),
    /** Turnkey: `{ subOrganizationId, walletId }`; Circle: `{ walletId }`. */
    providerRef: jsonb().$type<Record<string, string>>().notNull().default({}),
    status: walletStatusEnum().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("wallets_role_network_address_idx").on(table.role, table.network, sql`lower(${table.address})`),
    index("wallets_user_idx").on(table.userId),
    uniqueIndex("wallets_one_user_wallet_idx")
      .on(table.userId)
      .where(sql`${table.role} = 'user'`),
  ],
);

/** Per network: whether the user's address carries the 7702 code and which allowance is current. */
export const userWalletSetup = pgTable(
  "user_wallet_setup",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    delegatorImpl: text().notNull(),
    setupTxAttemptId: uuid(),
    setupAt: timestampTz(),
    allowanceGrantId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("user_wallet_setup_pk").on(table.userId, table.network)],
);

export const grantKindEnum = pgEnum("grant_kind", ["allowance", "automation", "marketplace", "margin_protection"]);
export const grantStatusEnum = pgEnum("grant_status", ["pending", "active", "revoked", "expired", "superseded"]);

/** A signed delegation (ERC-7710) from the user's wallet to one of our redeemers, with its caveats. */
export const grants = pgTable(
  "grants",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: grantKindEnum().notNull(),
    automationId: uuid(),
    delegatorWalletId: uuid()
      .notNull()
      .references(() => wallets.id),
    delegateAddress: text().notNull(),
    /** The delegation as signed (bigints as decimal strings). */
    delegation: jsonb().$type<Record<string, unknown>>().notNull(),
    delegationHash: text().notNull(),
    /** What the caveats mean, decoded once for display (`describeGrant`). */
    receipt: jsonb().$type<Record<string, unknown>>().notNull(),
    periodAmount: money().notNull(),
    periodSeconds: integer().notNull(),
    recipientAddress: text(),
    /** An allowance's token (one allowance per token, cards/automate-safety.md). */
    tokenAddress: text(),
    /**
     * The server's own, tighter cap on an allowance (tightening is instant, X7): at most this per period is used, even
     * though the signed grant allows `periodAmount`. Null = the signed amount.
     */
    policyCap: money(),
    /** A temporary raise: an extra allowance for one token that ends by itself (its Timestamp caveat). */
    boost: boolean().notNull().default(false),
    startsAt: timestampTz().notNull(),
    expiresAt: timestampTz().notNull(),
    status: grantStatusEnum().notNull().default("pending"),
    revokeTxAttemptId: uuid(),
    approvalId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("grants_network_hash_idx").on(table.network, table.delegationHash),
    index("grants_user_network_status_idx").on(table.userId, table.network, table.status),
  ],
);

export const txAttemptStatusEnum = pgEnum("tx_attempt_status", [
  "prepared",
  "signature_pending",
  "submitted",
  "pending_chain",
  "confirmed",
  "reverted",
  "dropped",
  "not_sent",
  "unknown",
]);
export const txProviderEnum = pgEnum("tx_provider", ["relayer", "circle_dcw", "user_wallet"]);

/** Every attempt to put something on chain, whoever sends it. One row per attempt, never reused. */
export const txAttempts = pgTable(
  "tx_attempts",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    intentId: uuid(),
    occurrenceId: uuid(),
    network: networkEnum().notNull(),
    chainId: integer().notNull(),
    attemptNo: integer().notNull().default(1),
    /** setup_7702, allowance_redeem, revoke, transfer, … */
    kind: text().notNull(),
    provider: txProviderEnum().notNull(),
    idempotencyKey: uuid().notNull(),
    providerRef: text(),
    fromAddress: text().notNull(),
    toAddress: text(),
    nonce: integer(),
    txHash: text(),
    status: txAttemptStatusEnum().notNull().default("prepared"),
    receipt: jsonb().$type<Record<string, unknown>>(),
    errorCode: text(),
    lastReconciledAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("tx_attempts_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("tx_attempts_intent_attempt_idx")
      .on(table.intentId, table.attemptNo)
      .where(sql`${table.intentId} is not null`),
    // One transaction per intent; a batch (one EIP-7702 transaction carrying several intents) records it on each.
    uniqueIndex("tx_attempts_chain_hash_intent_idx")
      .on(table.chainId, table.txHash, sql`coalesce(${table.intentId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${table.txHash} is not null`),
    uniqueIndex("tx_attempts_from_nonce_idx")
      .on(table.network, sql`lower(${table.fromAddress})`, table.nonce)
      .where(sql`${table.nonce} is not null and ${table.provider} = 'user_wallet'`),
    index("tx_attempts_status_idx").on(table.status),
  ],
);

export const limitKindEnum = pgEnum("limit_kind", [
  "per_tx",
  "daily",
  "weekly",
  "approval_threshold",
  "new_recipient_cooldown_s",
  "new_recipient_cap",
  "gas_float",
]);

/** The user's own limits per network; absent rows mean the defaults in @kawase/config. */
export const limits = pgTable(
  "limits",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: limitKindEnum().notNull(),
    value: money().notNull(),
    tempValue: money(),
    tempUntil: timestampTz(),
    approvalId: uuid(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("limits_pk").on(table.userId, table.network, table.kind)],
);

/** Runtime overrides of the capability registry (a capability can be switched off per network without a deploy). */
export const capabilityOverrides = pgTable(
  "capability_overrides",
  {
    capability: text().notNull(),
    network: networkEnum().notNull(),
    enabled: boolean().notNull(),
    reason: text(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("capability_overrides_pk").on(table.capability, table.network)],
);

export const faucetStatusEnum = pgEnum("faucet_status", ["sent", "failed"]);

/**
 * Test-money claims from the in-app faucet (S2, testnet only). One successful claim per user per day, checked
 * against this table; the drip itself is Circle's testnet faucet sending to the user's own address.
 */
export const faucetClaims = pgTable(
  "faucet_claims",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    address: text().notNull(),
    /** What was asked for, in base units per asset: `{ USDC: "20000000", EURC: "20000000" }`. */
    amounts: jsonb().$type<Record<string, string>>().notNull(),
    status: faucetStatusEnum().notNull(),
    /** The provider's error, when it refused. */
    failure: text(),
    createdAt: createdAt(),
  },
  (table) => [index("faucet_claims_user_created_idx").on(table.userId, table.createdAt)],
);
