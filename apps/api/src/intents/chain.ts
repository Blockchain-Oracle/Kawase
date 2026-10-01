// Small pieces every intent that ends on chain shares (sends, swaps): attempt numbering, receipts as JSON, the gas
// price a wallet transaction offers, and whether a failed broadcast certainly never left.
import { eq, sql } from "drizzle-orm";
import type { PublicClient, TransactionReceipt } from "viem";

import { MIN_MAX_FEE_PER_GAS_GWEI } from "@kawase/config";
import { intents, txAttempts, type Db } from "@kawase/db";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

const GWEI = 1_000_000_000n;

export const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;

export const receiptSummary = (receipt: TransactionReceipt) => ({
  transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber,
  status: receipt.status,
  gasUsed: receipt.gasUsed,
  effectiveGasPrice: receipt.effectiveGasPrice,
});

/** Whether a money intent with this id exists: an automation run fixes its id before the work, so a retry can tell. */
export async function intentExists(executor: Executor, intentId: string) {
  const [row] = await executor.select({ id: intents.id }).from(intents).where(eq(intents.id, intentId)).limit(1);
  return Boolean(row);
}

export async function nextAttemptNo(executor: Executor, intentId: string) {
  const [row] = await executor
    .select({ last: sql<number>`coalesce(max(${txAttempts.attemptNo}), 0)` })
    .from(txAttempts)
    .where(sql`${txAttempts.intentId} = ${intentId}`);
  return Number(row?.last ?? 0) + 1;
}

/** What a wallet transaction offers per gas: the network's suggestion, never below Arc's floor. */
export async function walletGasPrice(client: PublicClient) {
  const fees = await client.estimateFeesPerGas();
  const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
  const maxFeePerGas = fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : maxFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

/** The node refused the transaction before taking it (bad nonce, no funds for the fee): nothing left the wallet. */
export const refusedBeforeSending = (message: string) =>
  /nonce too low|insufficient funds|intrinsic gas|replacement transaction|exceeds the configured cap/i.test(message);
