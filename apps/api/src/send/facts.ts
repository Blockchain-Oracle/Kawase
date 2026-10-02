// Gathers what the policy needs for one send of any asset (R1), fresh each time: the token, balances, the 7702 code
// and what is left of the token's allowance from the chain; limits and what was already spent from the database; who
// the recipient is, and what that address is on chain (R6: a token contract, a smart wallet, another contract, blocked
// by the token's issuer, a Kawase user).
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";

import {
  DEFAULT_LIMITS,
  GAS_FLOAT_USDC_BASE_UNITS,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_WEEK,
} from "@kawase/config";
import { limits as limitsTable, spendLedger, type Db } from "@kawase/db";
import { isWalletSetUp } from "@kawase/integrations-delegation";
import { AmountParseError, decimalsOf, parseAmount, type AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";
import type { AmountFacts, SendFacts } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { allowanceRoom, tokenAllowance, type AllowanceRoom } from "../safety/allowances";
import { recipientTrust, safetySettingsOf } from "../safety/settings";
import type { Chains } from "../wallet/chain";
import { inspectRecipient, type Resolution, type RecipientInspection } from "./recipients";

export type StoredRequest = {
  recipient: string | null;
  amount: string | null;
  /** "USDC"/"EURC", a verified symbol, or a lower-case token address on the network. */
  asset: string | null;
  note: string | null;
};

/** What a send needs to know about its token. */
export type SendToken = { address: Address; symbol: string; decimals: number; priceUsd: number | null };
/** Turns what was asked ("USDC", "cirBTC", "0x…") into the token on this network; undefined when it is not one. */
export type TokenLookup = (network: NetworkId, value: string) => Promise<SendToken | undefined>;

const DECIMAL = /^\d+(\.\d+)?$/;
/** Limits for tokens other than USDC and EURC are kept in US dollars, in USDC base units, under this ledger label. */
export const USD_LEDGER_ASSET = "USD";
const USD_DECIMALS = 6;

/** "10.5" in any token's own decimals. */
export function parseTokenAmount(text: string | null, decimals: number): AmountFacts {
  if (!text || !text.trim()) return { status: "missing" };
  const value = text.trim();
  if (!DECIMAL.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) return { status: "invalid" };
  return { status: "ok", baseUnits: parseUnits(value, decimals) };
}

/** The ledger bucket a send's limits count in: USDC and EURC in their own units, every other token in dollars. */
export const ledgerAsset = (symbol: string): string => (symbol === "USDC" || symbol === "EURC" ? symbol : USD_LEDGER_ASSET);

export type ActiveAllowance = { id: string; delegation: Record<string, unknown>; perPeriod: bigint };
export const assetToken = (network: { addresses: { usdc: Address; eurc: Address } }, asset: AssetId) => (asset === "USDC" ? network.addresses.usdc : network.addresses.eurc);

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The pool or one transaction's connection: checks made under a lock must use the locked connection. */
export type Executor = Db | Tx;

const ZERO = 0n;
/** Amounts reach the api as canonical decimals ("10.5"); the app and the agent normalise what people type. */
const CANONICAL_LOCALE = "en";

export function parseRequestAmount(text: string | null, asset: AssetId | undefined): AmountFacts {
  if (!text || !text.trim()) return { status: "missing" };
  try {
    return { status: "ok", baseUnits: parseAmount(text, asset ?? "USDC", CANONICAL_LOCALE).baseUnits };
  } catch (error) {
    if (error instanceof AmountParseError) return { status: "invalid" };
    throw error;
  }
}

/**
 * The allowance for one token on one network, with what is left of it now (the chain's room under the person's own
 * cap). Sends of USDC and EURC each use their own token's allowance (cards/automate-safety.md).
 */
export async function activeAllowance(db: Db, chains: Chains, userId: string, network: NetworkId, token: Address): Promise<AllowanceRoom | undefined> {
  const clients = chains.get(network);
  if (!clients) return undefined;
  const allowance = await tokenAllowance(db, userId, network, token);
  if (!allowance.base && !allowance.boost) return undefined;
  return allowanceRoom(clients, allowance);
}

/** Reserved and committed spend of one ledger asset in the last day and week, leaving out one intent (the one being checked). */
export async function spent(db: Executor, userId: string, network: NetworkId, asset: string, exceptIntentId: string | undefined) {
  const since = (seconds: number) => new Date(Date.now() - seconds * MS_PER_SECOND);
  const sum = async (seconds: number) => {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${spendLedger.amount}), 0)` })
      .from(spendLedger)
      .where(
        and(
          eq(spendLedger.userId, userId),
          eq(spendLedger.network, network),
          eq(spendLedger.asset, asset),
          inArray(spendLedger.state, ["reserved", "committed"]),
          gt(spendLedger.createdAt, since(seconds)),
          ...(exceptIntentId ? [ne(spendLedger.intentId, exceptIntentId)] : []),
        ),
      );
    return BigInt(row?.total ?? "0");
  };
  // One after the other: inside a transaction both run on the same connection.
  const day = await sum(SECONDS_PER_DAY);
  const week = await sum(SECONDS_PER_WEEK);
  return { day, week };
}

export async function userLimits(db: Executor, userId: string, network: NetworkId) {
  const defaults = DEFAULT_LIMITS[network];
  const rows = await db
    .select()
    .from(limitsTable)
    .where(and(eq(limitsTable.userId, userId), eq(limitsTable.network, network)));
  const now = Date.now();
  const value = (kind: "per_tx" | "daily" | "weekly", fallback: bigint) => {
    const row = rows.find((entry) => entry.kind === kind);
    if (!row) return fallback;
    return row.tempValue !== null && row.tempUntil && row.tempUntil.getTime() > now ? row.tempValue : row.value;
  };
  return {
    perTx: value("per_tx", defaults.perTransaction),
    daily: value("daily", defaults.daily),
    weekly: value("weekly", defaults.weekly),
  };
}

/** The app limits again, under the approval lock: true when this amount still fits. */
export async function fitsLimits(executor: Executor, userId: string, network: NetworkId, asset: string, amount: bigint, exceptIntentId: string) {
  const limitValues = await userLimits(executor, userId, network);
  const used = await spent(executor, userId, network, asset, exceptIntentId);
  return amount <= limitValues.perTx && used.day + amount <= limitValues.daily && used.week + amount <= limitValues.weekly;
}

export type GatheredFacts = {
  facts: SendFacts;
  allowance: ActiveAllowance | undefined;
  practice: boolean;
  /** The token the send uses, once known. */
  token: SendToken | undefined;
  /** The amount in the ledger's units (see `ledgerAsset`), for reserving the spend; null when unpriced. */
  ledger: { asset: string; amount: bigint | null } | undefined;
  /** What the recipient's address is on chain (R6), when it resolved. */
  inspection: RecipientInspection | undefined;
};

export async function gatherFacts(input: {
  db: Db;
  chains: Chains;
  userId: string;
  signedIn: boolean;
  pausedAll: boolean;
  network: NetworkId;
  wallet: Address | undefined;
  request: StoredRequest;
  resolution: Resolution;
  exceptIntentId?: string | undefined;
  /** Any token beyond USDC and EURC (the asset registry); without it only those two are known. */
  lookup?: TokenLookup | undefined;
}): Promise<GatheredFacts> {
  const { db, chains, userId, network, wallet, request } = input;
  const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
  const view = await capabilityView(db, chains.available);
  const clients = chains.get(network);
  const named = request.asset ?? undefined;

  const empty = { USDC: ZERO, EURC: ZERO } satisfies Record<AssetId, bigint>;
  let balances: Record<AssetId, bigint> = empty;
  let setUp = false;
  if (clients && wallet) {
    const balanceOf = (token: Address) =>
      clients.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
    const [usdc, eurc, code] = await Promise.all([
      balanceOf(clients.network.addresses.usdc),
      balanceOf(clients.network.addresses.eurc),
      clients.client.getCode({ address: wallet }),
    ]);
    balances = { USDC: usdc, EURC: eurc };
    setUp = isWalletSetUp(code);
  }

  // The token: the one named, else the stablecoin held (both held and none named: ask which).
  const assetUnclear = !named && balances.USDC > ZERO && balances.EURC > ZERO;
  const chosen = named ?? (balances.EURC > ZERO && balances.USDC === ZERO ? "EURC" : "USDC");
  const stable = (symbol: AssetId): SendToken | undefined => (clients ? { address: assetToken(clients.network, symbol), symbol, decimals: decimalsOf(symbol), priceUsd: null } : undefined);
  const upper = chosen.toUpperCase();
  const token: SendToken | undefined =
    upper === "USDC" || upper === "EURC" ? stable(upper) : input.lookup ? await input.lookup(network, chosen).catch(() => undefined) : undefined;
  const same = (address: Address) => Boolean(token && token.address.toLowerCase() === address.toLowerCase());
  const isUsdc = Boolean(clients && same(clients.network.addresses.usdc));
  const isEurc = Boolean(clients && same(clients.network.addresses.eurc));
  const stableSymbol: AssetId | undefined = isUsdc ? "USDC" : isEurc ? "EURC" : undefined;
  const balance =
    !token || !clients || !wallet
      ? ZERO
      : stableSymbol
        ? balances[stableSymbol]
        : await clients.client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }).catch(() => ZERO);
  const amount: AmountFacts = token ? parseTokenAmount(request.amount, token.decimals) : parseRequestAmount(request.amount, undefined);

  // Limits: USDC and EURC in their own units; any other token by its value in dollars (none when it has no price).
  const ledgerSymbol = token ? ledgerAsset(stableSymbol ?? token.symbol) : "USDC";
  const valued =
    amount.status === "ok" && token && ledgerSymbol === USD_LEDGER_ASSET
      ? token.priceUsd !== null
        ? parseUnits((Number(formatUnits(amount.baseUnits, token.decimals)) * token.priceUsd).toFixed(USD_DECIMALS), USD_DECIMALS)
        : null
      : undefined;
  const recipientAddress = input.resolution.facts.status === "resolved" ? input.resolution.facts.address : undefined;
  const [limitValues, spentValues, settings, room, trust, inspection] = await Promise.all([
    userLimits(db, userId, network),
    spent(db, userId, network, ledgerSymbol, input.exceptIntentId),
    safetySettingsOf(db, userId, network),
    // The chosen token's own allowance (USDC and EURC each); without a wallet set up there is nothing to spend from.
    clients && wallet && setUp && stableSymbol ? activeAllowance(db, chains, userId, network, assetToken(clients.network, stableSymbol)) : Promise.resolve(undefined),
    recipientAddress ? recipientTrust(db, userId, network, recipientAddress) : Promise.resolve(undefined),
    clients && recipientAddress ? inspectRecipient(db, clients.client, recipientAddress as Address, stableSymbol && token ? token.address : undefined) : Promise.resolve(undefined),
  ]);
  const grant = room?.base?.grant ?? room?.boost?.grant;
  const allowance: ActiveAllowance | undefined = grant && room ? { id: grant.id, delegation: grant.delegation, perPeriod: room.perPeriod } : undefined;
  const recipient =
    input.resolution.facts.status === "resolved"
      ? {
          ...input.resolution.facts,
          ...(trust ? { knownSince: trust.knownSince, allowlisted: trust.allowlisted } : {}),
          ...(inspection ? { contract: inspection.contract ?? undefined, issuerBlocked: inspection.issuerBlocked } : {}),
        }
      : input.resolution.facts;

  return {
    allowance,
    practice: settings.practice,
    token,
    ledger: amount.status === "ok" ? { asset: ledgerSymbol, amount: valued === undefined ? amount.baseUnits : valued } : undefined,
    inspection,
    facts: {
      network,
      capability: { here: view.send[network].state, other: view.send[other].state },
      signedIn: input.signedIn,
      pausedAll: input.pausedAll || Boolean(settings.pausedAt),
      wallet: { registered: Boolean(wallet), setUp, balance, usdc: balances.USDC },
      recipient,
      asset: token?.symbol ?? (named || undefined),
      assetUnclear,
      isUsdc,
      allowable: Boolean(stableSymbol),
      decimals: token?.decimals,
      amount,
      limitAmount: valued,
      allowance: { active: Boolean(room?.active), available: room?.available ?? ZERO },
      riskMode: settings.riskMode,
      cooldown: { seconds: settings.cooldown.seconds, cap: settings.cooldown.cap, now: new Date().toISOString() },
      allowlistOnly: settings.allowlistOnly,
      limits: limitValues,
      spent: spentValues,
      thresholds: {
        firstTimeStepUp: DEFAULT_LIMITS[network].firstTimeRecipientApprovalThreshold,
        testAmount: DEFAULT_LIMITS[network].testAmount,
        gasFloat: GAS_FLOAT_USDC_BASE_UNITS,
      },
    },
  };
}
