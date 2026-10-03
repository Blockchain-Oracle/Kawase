// Batch payouts (cards/agent-business.md "Payouts (batch, from a CSV or contacts)"): every line is resolved and checked
// like a send's recipient (R6: a contact, an @handle or a typed address; never yourself, never a token contract, never a
// look-alike of a saved contact, never an address on hold), then one transaction the wallet sends to itself pays them all
// through its 7702 DeleGator, all or nothing: one Face ID. Its receipt shows one transfer per line. Any token the
// registry knows (R1): USDC, EURC, cirBTC, a listed token or an address; amounts in that token's decimals.
import { and, desc, eq } from "drizzle-orm";
import { erc20Abi, encodeFunctionData, getAddress, parseUnits, type Address, type Hex } from "viem";

import type { PayoutCreateResult, PayoutLineInput, PayoutProblem, PayoutView } from "@kawase/api-client";
import { PAYOUT_GAS_BASE, PAYOUT_GAS_PER_LINE, PAYOUT_LINES_MAX } from "@kawase/config";
import { payoutBatches, type Db, type PayoutLine } from "@kawase/db";

import type { AuditWriter } from "../audit/writer";
import { HTTP, problem } from "../http/problem";
import type { Recipients } from "../send/recipients";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { businessToken, type TokenResolver } from "./tokens";

const ZERO = 0n;

type BatchRow = typeof payoutBatches.$inferSelect;

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

export class PayoutService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly audit: AuditWriter,
    /** Any Arc token by symbol or address (A's registry); USDC and EURC only without it. */
    private readonly resolveToken?: TokenResolver | undefined,
  ) {}

  private token(row: BatchRow): Address {
    if (row.tokenAddress) return getAddress(row.tokenAddress);
    const clients = this.chains.get(row.network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    return row.asset === "EURC" ? clients.network.addresses.eurc : clients.network.addresses.usdc;
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
      const resolved = await this.recipients.resolve({ id: user.id, walletAddress: wallet.address }, user.activeNetwork, line.recipient);
      const facts = resolved.facts as { status: string; address?: string; lookalikeOf?: string };
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
      lines.push({ name: resolved.view?.name ?? (resolved.view?.handle ? `@${resolved.view.handle}` : null), address: getAddress(facts.address), amount: amount.toString() });
    }
    if (problems.length > 0) return { payout: null, problems };
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

  /** The one transaction to sign (the wallet to itself, every transfer inside). Checked against the balance first. */
  async signRequest(user: SessionUser, id: string) {
    const row = await this.own(user, id);
    if (row.status !== "ready") throw problem(HTTP.conflict, "intent_final");
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

  async submit(user: SessionUser, id: string, input: { requestId: string; signedTransaction: Hex; kind?: "transaction" | "typed" | undefined }) {
    const row = await this.own(user, id);
    if (row.status !== "ready") throw problem(HTTP.conflict, "intent_final");
    await this.db.update(payoutBatches).set({ status: "submitted" }).where(eq(payoutBatches.id, id));
    const send = input.kind === "typed" ? this.wallets.submitRelayedBatch(user.id, input.requestId, input.signedTransaction) : this.wallets.submitTransaction(user.id, input.requestId, input.signedTransaction);
    const sent = await send.catch(async (error: unknown) => {
      await this.db.update(payoutBatches).set({ status: "ready" }).where(eq(payoutBatches.id, id));
      throw error;
    });
    const [updated] = await this.db
      .update(payoutBatches)
      .set({ status: sent.status === "confirmed" ? "confirmed" : "failed", txHash: sent.tx })
      .where(eq(payoutBatches.id, id))
      .returning();
    await this.audit.write({ userId: user.id, actor: "user", action: "payout.sent", subjectType: "payout", subjectId: id, network: row.network, decision: sent.status, checks: { lines: row.lines.length, total: row.total.toString(), tx: sent.tx } });
    return view(updated!);
  }
}
