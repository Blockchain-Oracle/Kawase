// Batch payouts (cards/agent-business.md "Payouts (batch, from a CSV or contacts)"): every line is resolved and checked
// like a send's recipient (R6: a contact, an @handle or a typed address; never yourself, never a token contract, never a
// look-alike of a saved contact, never an address on hold), then one transaction the wallet sends to itself pays them all
// through its 7702 DeleGator, all or nothing: one Face ID. Its receipt shows one transfer per line. Any token the
// registry knows (R1): USDC, EURC, cirBTC, a listed token or an address; amounts in that token's decimals.
//
// Every line goes through the same send rules as a single send (security review M7): `evaluateSend` on fresh facts
// when the payout is made and again before it is signed (a changed address on hold, a blocked recipient, the person's
// limits with each line counted on top of the ones before it), and the batch's spend is reserved in the ledger under
// the person's lock when the signed batch comes back, so a send at the same moment cannot push both over a limit.
import { and, desc, eq } from "drizzle-orm";
import { erc20Abi, encodeFunctionData, formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";

import type { PayoutCreateResult, PayoutLineInput, PayoutProblem, PayoutView } from "@kawase/api-client";
import { PAYOUT_GAS_BASE, PAYOUT_GAS_PER_LINE, PAYOUT_LINES_MAX } from "@kawase/config";
import { payoutBatches, spendLedger, users, type Db, type PayoutLine } from "@kawase/db";
import { blockingResult, evaluateSend, type ReasonCode } from "@kawase/policy";

import type { AuditWriter } from "../audit/writer";
import { HTTP, problem } from "../http/problem";
import { gatherFacts, ledgerAsset, spent, usdValue, userLimits, type GatheredFacts, type TokenLookup } from "../send/facts";
import type { Recipients } from "../send/recipients";
import { lockPerson } from "../send/relayed";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { businessToken, type TokenResolver } from "./tokens";

const ZERO = 0n;
/** Lines whose facts are read at once (each reads balances, limits and the recipient's address on chain). */
const FACTS_AT_ONCE = 5;
const LEDGER_CATEGORY = "payout";

type BatchRow = typeof payoutBatches.$inferSelect;
type Token = { address: Address; symbol: string; decimals: number };

/**
 * The send rules' answer for one line, as the payout's line problem. Fees and the balance are the batch's (checked
 * when it is signed, and carried by the relayer when the wallet cannot pay), so they are not a line's problem.
 */
const LINE_PROBLEMS: Partial<Record<ReasonCode, string>> = {
  ADDRESS_CHANGE_HOLD: "hold",
  RECIPIENT_BLOCKED: "blocked",
  RECIPIENT_ISSUER_BLOCKED: "blocked",
  RECIPIENT_TOKEN_CONTRACT: "token_contract",
  LOOKALIKE_ADDRESS: "lookalike",
  OVER_PER_TX_LIMIT: "limit",
  OVER_DAILY_LIMIT: "limit",
  OVER_WEEKLY_LIMIT: "limit",
};
const BATCH_LEVEL = new Set<ReasonCode>(["INSUFFICIENT_BALANCE", "INSUFFICIENT_GAS", "GAS_RELAY_LIMIT", "GAS_RELAY_BUDGET_SPENT"]);

const view = (row: BatchRow): PayoutView => ({
  id: row.id,
  network: row.network,
  asset: row.asset,
  tokenAddress: row.tokenAddress,
  decimals: row.decimals,
  lines: row.lines,
  total: row.total.toString(),
  status: row.status,
  txHash: row.txHash,
  createdAt: row.createdAt.toISOString(),
});

/** At most `limit` at once, in order. */
async function inChunks<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; start < items.length; start += limit) out.push(...(await Promise.all(items.slice(start, start + limit).map(run))));
  return out;
}

export class PayoutService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly audit: AuditWriter,
    /** Any Arc token by symbol or address (A's registry); USDC and EURC only without it. */
    private readonly resolveToken?: TokenResolver | undefined,
    /** Tokens with their price, for limits on tokens other than USDC and EURC (the same lookup sends use). */
    private readonly lookup?: TokenLookup | undefined,
  ) {}

  private token(row: BatchRow): Address {
    if (row.tokenAddress) return getAddress(row.tokenAddress);
    const clients = this.chains.get(row.network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    return row.asset === "EURC" ? clients.network.addresses.eurc : clients.network.addresses.usdc;
  }

  /**
   * Each resolved line through `evaluateSend` on fresh facts, the person's limits counting every line before it. The
   * person signs the batch themselves (Face ID), so pause holds nothing back here, as for any send of their own; the
   * real pause state still goes into the facts. Returns the first problem per line, and the batch's spend in the
   * ledger's units (null when the token has no price).
   */
  private async checkLines(user: SessionUser, wallet: Address, token: Token, lines: { index: number; recipient: string; line: PayoutLine; resolution: Awaited<ReturnType<Recipients["resolve"]>> }[]) {
    const network = user.activeNetwork;
    const [person] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, user.id));
    const stable = token.symbol === "USDC" || token.symbol === "EURC";
    const gathered = await inChunks(lines, FACTS_AT_ONCE, (entry) =>
      gatherFacts({
        db: this.db,
        chains: this.chains,
        userId: user.id,
        signedIn: true,
        pausedAll: Boolean(person?.pausedAllAt),
        network,
        wallet,
        request: { recipient: entry.recipient, amount: formatUnits(BigInt(entry.line.amount), token.decimals), asset: stable ? token.symbol : token.address.toLowerCase(), note: null },
        resolution: entry.resolution,
        lookup: this.lookup,
      }),
    );
    const problems: PayoutProblem[] = [];
    let before = ZERO;
    for (const [position, entry] of lines.entries()) {
      const facts: GatheredFacts["facts"] = { ...gathered[position]!.facts };
      facts.spent = { day: facts.spent.day + before, week: facts.spent.week + before };
      const blocking = blockingResult(evaluateSend(facts).results.filter((result) => !BATCH_LEVEL.has(result.code)));
      if (blocking) problems.push({ index: entry.index, recipient: entry.recipient, problem: LINE_PROBLEMS[blocking.code] ?? "rules" });
      before += gathered[position]!.ledger?.amount ?? ZERO;
    }
    return { problems, ledger: { asset: ledgerAsset(stable ? token.symbol : (gathered[0]?.token?.symbol ?? token.symbol)), amount: before } };
  }

  async create(user: SessionUser, input: { asset: string; lines: PayoutLineInput[] }): Promise<PayoutCreateResult> {
    if (input.lines.length === 0 || input.lines.length > PAYOUT_LINES_MAX) throw problem(HTTP.unprocessable, "validation", `1 to ${PAYOUT_LINES_MAX} lines`);
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const clients = this.chains.get(user.activeNetwork);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    const token = await businessToken(this.chains, this.resolveToken, user, input.asset);
    const tokens = new Set([clients.network.addresses.usdc.toLowerCase(), clients.network.addresses.eurc.toLowerCase(), token.address.toLowerCase()]);
    const lines: PayoutLine[] = [];
    const resolved: Parameters<PayoutService["checkLines"]>[3] = [];
    const problems: PayoutProblem[] = [];
    for (const [index, line] of input.lines.entries()) {
      let amount: bigint;
      try {
        amount = parseUnits(line.amount.trim().replace(/,/g, ""), token.decimals);
      } catch {
        problems.push({ index, recipient: line.recipient, problem: "amount" });
        continue;
      }
      if (amount <= ZERO) {
        problems.push({ index, recipient: line.recipient, problem: "amount" });
        continue;
      }
      const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet.address }, user.activeNetwork, line.recipient);
      const facts = resolution.facts as { status: string; address?: string; lookalikeOf?: string };
      if (facts.status !== "resolved" || !facts.address) {
        problems.push({ index, recipient: line.recipient, problem: facts.status });
        continue;
      }
      if (tokens.has(facts.address.toLowerCase())) {
        problems.push({ index, recipient: line.recipient, problem: "token_contract" });
        continue;
      }
      if (facts.lookalikeOf) {
        problems.push({ index, recipient: line.recipient, problem: "lookalike" });
        continue;
      }
      const checked: PayoutLine = {
        name: resolution.view?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : null),
        address: getAddress(facts.address),
        amount: amount.toString(),
        recipient: line.recipient.trim(),
      };
      lines.push(checked);
      resolved.push({ index, recipient: line.recipient, line: checked, resolution });
    }
    if (resolved.length > 0) problems.push(...(await this.checkLines(user, wallet.address as Address, token, resolved)).problems);
    if (problems.length > 0) return { payout: null, problems: problems.sort((a, b) => a.index - b.index) };
    const total = lines.reduce((sum, line) => sum + BigInt(line.amount), ZERO);
    const [row] = await this.db.insert(payoutBatches).values({ userId: user.id, network: user.activeNetwork, asset: token.symbol, tokenAddress: token.address, decimals: token.decimals, lines, total }).returning();
    return { payout: view(row!), problems: [] };
  }

  async list(user: SessionUser): Promise<PayoutView[]> {
    const rows = await this.db
      .select()
      .from(payoutBatches)
      .where(and(eq(payoutBatches.userId, user.id), eq(payoutBatches.network, user.activeNetwork)))
      .orderBy(desc(payoutBatches.createdAt));
    return rows.map(view);
  }

  private async own(user: SessionUser, id: string) {
    const [row] = await this.db.select().from(payoutBatches).where(and(eq(payoutBatches.id, id), eq(payoutBatches.userId, user.id)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    return row;
  }

  /**
   * Every line again on fresh facts, right before signing: each still resolves to the address it was made with (a
   * contact whose address changed since is on hold, not silently paid at the new one), and the rules still pass.
   * Returns the batch's spend in the ledger's units.
   */
  private async recheck(user: SessionUser, row: BatchRow) {
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const token: Token = { address: this.token(row), symbol: row.asset, decimals: row.decimals };
    const problems: PayoutProblem[] = [];
    const lines: Parameters<PayoutService["checkLines"]>[3] = [];
    for (const [index, line] of row.lines.entries()) {
      const recipient = line.recipient ?? line.address;
      const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet.address }, row.network, recipient);
      const facts = resolution.facts as { status: string; address?: string };
      if (facts.status !== "resolved" || facts.address?.toLowerCase() !== line.address.toLowerCase()) {
        problems.push({ index, recipient, problem: facts.status === "resolved" ? "changed" : facts.status });
        continue;
      }
      lines.push({ index, recipient, line, resolution });
    }
    const checked = await this.checkLines({ ...user, activeNetwork: row.network }, wallet.address as Address, token, lines);
    problems.push(...checked.problems);
    if (problems.length > 0) throw problem(HTTP.conflict, "intent_stale", "a payout line no longer passes; check it again", { problems });
    return checked.ledger;
  }

  /** The one transaction to sign (the wallet to itself, every transfer inside). Checked against the rules and the balance first. */
  async signRequest(user: SessionUser, id: string) {
    const row = await this.own(user, id);
    if (row.status !== "ready") throw problem(HTTP.conflict, "intent_final");
    await this.recheck(user, row);
    const token = this.token(row);
    const wallet = await this.wallets.userWallet(user.id);
    const clients = this.chains.get(row.network)!;
    const balance = await clients.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet!.address as Address] });
    if (balance < row.total) throw problem(HTTP.unprocessable, "validation", "not enough in the wallet for this payout");
    const calls = row.lines.map((line) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [line.address as Address, BigInt(line.amount)] }) as Hex }));
    const gas = PAYOUT_GAS_BASE + PAYOUT_GAS_PER_LINE * BigInt(calls.length);
    // No gas dead end: when the USDC left after the payout cannot pay the fee, Kawase's relayer sends the batch.
    const spendsUsdc = token.toLowerCase() === clients.network.addresses.usdc.toLowerCase() ? row.total : BigInt(0);
    if (!(await this.wallets.canPayFee(user.id, row.network, spendsUsdc, gas))) return this.wallets.relayedBatchRequest(user.id, row.network, "payout", calls);
    return this.wallets.selfBatchRequest(user.id, row.network, "payout", calls, gas);
  }

  /** What the batch counts against the limits: its total and its largest line, in the ledger's units (null without a price). */
  private async spendOf(row: BatchRow) {
    const largest = row.lines.reduce((max, line) => (BigInt(line.amount) > max ? BigInt(line.amount) : max), ZERO);
    if (row.asset === "USDC" || row.asset === "EURC") return { asset: row.asset, total: row.total, largest };
    const token = this.lookup ? await this.lookup(row.network, this.token(row).toLowerCase()).catch(() => undefined) : undefined;
    if (!token || token.priceUsd === null) return null;
    return { asset: ledgerAsset(token.symbol), total: usdValue(row.total, row.decimals, token.priceUsd), largest: usdValue(largest, row.decimals, token.priceUsd) };
  }

  async submit(user: SessionUser, id: string, input: { requestId: string; signedTransaction: Hex; kind?: "transaction" | "typed" | undefined }) {
    const row = await this.own(user, id);
    if (row.status !== "ready") throw problem(HTTP.conflict, "intent_final");
    const spend = await this.spendOf(row);
    // The limits again and the spend reserved, under the person's lock (the one sends take), with the status change.
    const reserved = await this.db.transaction(async (tx) => {
      await lockPerson(tx, user.id, row.network);
      const [current] = await tx.select().from(payoutBatches).where(eq(payoutBatches.id, id)).for("update");
      if (current?.status !== "ready") return "final" as const;
      if (spend) {
        const limits = await userLimits(tx, user.id, row.network);
        const used = await spent(tx, user.id, row.network, spend.asset, undefined);
        if (spend.largest > limits.perTx || used.day + spend.total > limits.daily || used.week + spend.total > limits.weekly) return "over_limit" as const;
        await tx.insert(spendLedger).values({ userId: user.id, network: row.network, payoutId: id, category: LEDGER_CATEGORY, asset: spend.asset, amount: spend.total });
      }
      await tx.update(payoutBatches).set({ status: "submitted" }).where(eq(payoutBatches.id, id));
      return "reserved" as const;
    });
    if (reserved === "final") throw problem(HTTP.conflict, "intent_final");
    if (reserved === "over_limit") throw problem(HTTP.unprocessable, "intent_blocked", "this payout is over your limits now", { problem: "limit" });
    const send = input.kind === "typed" ? this.wallets.submitRelayedBatch(user.id, input.requestId, input.signedTransaction) : this.wallets.submitTransaction(user.id, input.requestId, input.signedTransaction);
    const sent = await send.catch(async (error: unknown) => {
      // Refused before anything was sent: back to ready, and its spend no longer counts.
      await this.db.transaction(async (tx) => {
        await tx.delete(spendLedger).where(eq(spendLedger.payoutId, id));
        await tx.update(payoutBatches).set({ status: "ready" }).where(eq(payoutBatches.id, id));
      });
      throw error;
    });
    const confirmed = sent.status === "confirmed";
    const [updated] = await this.db.transaction(async (tx) => {
      await tx.update(spendLedger).set({ state: confirmed ? "committed" : "released" }).where(eq(spendLedger.payoutId, id));
      return tx
        .update(payoutBatches)
        .set({ status: confirmed ? "confirmed" : "failed", txHash: sent.tx })
        .where(eq(payoutBatches.id, id))
        .returning();
    });
    await this.audit.write({ userId: user.id, actor: "user", action: "payout.sent", subjectType: "payout", subjectId: id, network: row.network, decision: sent.status, checks: { lines: row.lines.length, total: row.total.toString(), tx: sent.tx } });
    return view(updated!);
  }
}
