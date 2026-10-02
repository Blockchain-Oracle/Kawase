// Incoming payments (C2, C3): reads the chain's Transfer logs to Kawase wallets, per network, from a cursor. USDC is
// read from the system emitter only (`0xffff…FfFE`, 18 decimals), because it reports every USDC movement, native or
// ERC-20, once (an ERC-20 call also logs from 0x3600…, which would double count — context/01-arc/gotchas.md #23);
// EURC from its own contract. Each log becomes one row (unique per chain, tx, log), then an inbox item, and pays an
// open request when it matches one exactly. It runs inside the api for now and moves to apps/chain-watcher when the
// executor lands (Stage 8); the cursor and the unique rows make a repeat or a restart harmless. Money that arrives
// wakes the person's Auto-save (its next check is now), so what lands above their line starts earning within a tick;
// money coming back from their own savings is not money received from someone.
//
// Discovery (R1, G5): the same read has no contract filter, so every ERC-20 Transfer to a Kawase wallet is seen
// (ERC-721 Transfers share the event signature but carry four topics, and are skipped). Each token that arrives is
// recorded in `wallet_tokens`, which the portfolio reads with one multicall; a token is never chosen from a list.
// New wallets are also read backwards from when they were registered (bounded, a few windows per tick), so tokens
// that arrived before Kawase watched are found too. Only USDC and EURC become inbox items and pay requests.
import { and, eq, inArray, sql } from "drizzle-orm";
import { getAddress, parseAbiItem, type Address, type Log } from "viem";

import {
  MS_PER_SECOND,
  TOKEN_BACKFILL_MARGIN_S,
  TOKEN_BACKFILL_MAX_S,
  TOKEN_BACKFILL_WINDOW_BLOCKS,
  TOKEN_BACKFILL_WINDOWS_PER_TICK,
  WATCH_ADDRESS_CHUNK,
  WATCH_BACKFILL_BLOCKS,
  WATCH_HEAD_LAG_BLOCKS,
  WATCH_MAX_BLOCKS,
} from "@kawase/config";
import { randomUUID } from "node:crypto";
import { automationRuns, automations, chainEvents, contacts, contactAddresses, indexerCursors, txAttempts, users, wallets, walletTokens, type AutoSaveAction, type Db, type RuleAction } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { USDC_ERC20_DECIMALS, USDC_NATIVE_DECIMALS, rescale } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import type { InboxService } from "../inbox/service";
import type { RequestService } from "../requests/service";
import type { Chains } from "../wallet/chain";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const STREAM = "incoming_transfers";
const BACKFILL_STREAM = "token_backfill:";
/** A wallet's backfill cursor once it has caught up with the live watcher. */
const BACKFILL_DONE = -1n;
/** An ERC-20 Transfer has three topics (signature, from, to); ERC-721's has a fourth (the token id). */
const ERC20_TRANSFER_TOPICS = 3;
const ONE = 1n;
const ZERO = 0n;
const BLOCK_TIME_SAMPLE = 10_000n;

type TransferLog = Log<bigint, number, false, typeof TRANSFER>;

export class IncomingWatcher {
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly requests: RequestService,
    private readonly inbox: InboxService,
    private readonly log: Logger,
    /** Read new wallets backwards for tokens that arrived earlier; off when Alchemy does cold start in one call. */
    private readonly options: { backfill: boolean } = { backfill: true },
  ) {}

  start(intervalMs: number) {
    const timer = setInterval(() => void this.tick(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** One pass over every network; overlapping passes are skipped. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (const network of this.chains.available) {
        await this.scan(network).catch((error: unknown) => this.log.warn({ err: error, network }, "incoming watch failed"));
        if (this.options.backfill) await this.backfill(network).catch((error: unknown) => this.log.warn({ err: error, network }, "token backfill failed"));
      }
    } finally {
      this.running = false;
    }
  }

  private async scan(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) return;
    const { client, network: context } = clients;
    const head = (await client.getBlockNumber()) - WATCH_HEAD_LAG_BLOCKS;
    const [cursor] = await this.db
      .select()
      .from(indexerCursors)
      .where(and(eq(indexerCursors.network, network), eq(indexerCursors.stream, STREAM)));
    const fromBlock = cursor ? cursor.lastBlock + ONE : head - WATCH_BACKFILL_BLOCKS;
    if (fromBlock > head) return;
    const toBlock = fromBlock + WATCH_MAX_BLOCKS - ONE < head ? fromBlock + WATCH_MAX_BLOCKS - ONE : head;

    const owners = await this.db
      .select({ userId: wallets.userId, address: wallets.address })
      .from(wallets)
      .where(and(eq(wallets.role, "user"), eq(wallets.status, "active")));
    const ownerOf = new Map(owners.filter((row) => row.userId).map((row) => [row.address.toLowerCase(), row.userId!]));
    const addresses = [...ownerOf.keys()].map((address) => getAddress(address));

    const emitter = context.addresses.nativeUsdcTransferEmitter.toLowerCase();
    const usdcView = context.addresses.usdc.toLowerCase();
    const eurc = context.addresses.eurc.toLowerCase();
    for (let start = 0; start < addresses.length; start += WATCH_ADDRESS_CHUNK) {
      const chunk = addresses.slice(start, start + WATCH_ADDRESS_CHUNK);
      // Every contract's Transfer to these wallets in one read.
      const logs = (await client.getLogs({ event: TRANSFER, args: { to: chunk }, fromBlock, toBlock })) as TransferLog[];
      const found: TransferLog[] = [];
      for (const entry of logs) {
        if (entry.topics.length !== ERC20_TRANSFER_TOPICS) continue;
        const token = entry.address.toLowerCase();
        // USDC is read from the system emitter only; the ERC-20 view's log of the same movement would count it twice.
        if (token === emitter) await this.record(network, context.chainId, "USDC", entry, ownerOf, true);
        else if (token === usdcView) continue;
        else {
          if (token === eurc) await this.record(network, context.chainId, "EURC", entry, ownerOf, false);
          found.push(entry);
        }
      }
      await this.discover(network, context.chainId, found, ownerOf, "transfer");
    }

    await this.db
      .insert(indexerCursors)
      .values({ network, stream: STREAM, lastBlock: toBlock })
      .onConflictDoUpdate({ target: [indexerCursors.network, indexerCursors.stream], set: { lastBlock: toBlock, updatedAt: new Date() } });
  }

  /** Remember which tokens reached which wallet (one row per person and token; the last block moves forward). */
  private async discover(network: NetworkId, chainId: number, entries: TransferLog[], ownerOf: Map<string, string>, source: "transfer" | "backfill") {
    const rows = new Map<string, typeof walletTokens.$inferInsert>();
    for (const entry of entries) {
      const to = entry.args.to?.toLowerCase();
      const userId = to ? ownerOf.get(to) : undefined;
      if (!to || !userId || entry.blockNumber === null || !entry.args.value) continue;
      const tokenAddress = entry.address.toLowerCase();
      const key = `${userId}:${tokenAddress}`;
      const known = rows.get(key);
      rows.set(key, {
        userId,
        network,
        chainId,
        tokenAddress,
        walletAddress: to,
        source,
        firstBlock: known?.firstBlock ?? entry.blockNumber,
        lastBlock: entry.blockNumber,
      });
    }
    if (rows.size === 0) return;
    await this.db
      .insert(walletTokens)
      .values([...rows.values()])
      .onConflictDoUpdate({
        target: [walletTokens.userId, walletTokens.chainId, walletTokens.tokenAddress],
        set: { lastBlock: sql`greatest(${walletTokens.lastBlock}, excluded.last_block)`, updatedAt: new Date() },
      });
  }

  /**
   * Read each wallet's past, from about when it was registered (at most TOKEN_BACKFILL_MAX_S back) up to where the
   * live watcher started, a few windows per tick. Only discovery: past transfers are not news (no inbox items).
   */
  private async backfill(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) return;
    const { client } = clients;
    const [live] = await this.db
      .select()
      .from(indexerCursors)
      .where(and(eq(indexerCursors.network, network), eq(indexerCursors.stream, STREAM)));
    if (!live) return;
    const owners = await this.db
      .select({ userId: wallets.userId, address: wallets.address, createdAt: wallets.createdAt })
      .from(wallets)
      .where(and(eq(wallets.role, "user"), eq(wallets.status, "active")));
    const cursors = await this.db
      .select()
      .from(indexerCursors)
      .where(and(eq(indexerCursors.network, network), sql`${indexerCursors.stream} like ${`${BACKFILL_STREAM}%`}`));
    const cursorOf = new Map(cursors.map((row) => [row.stream, row.lastBlock]));
    let budget = TOKEN_BACKFILL_WINDOWS_PER_TICK;
    let blockMs: number | undefined;
    for (const owner of owners) {
      if (budget <= 0 || !owner.userId) break;
      const stream = `${BACKFILL_STREAM}${owner.address.toLowerCase()}`;
      const stored = cursorOf.get(stream);
      if (stored === BACKFILL_DONE) continue;
      let cursor: bigint;
      if (stored === undefined) {
        blockMs ??= await this.blockMs(client);
        const lookback = Math.min(Date.now() - owner.createdAt.getTime() + TOKEN_BACKFILL_MARGIN_S * MS_PER_SECOND, TOKEN_BACKFILL_MAX_S * MS_PER_SECOND);
        const blocks = BigInt(Math.ceil(lookback / blockMs));
        cursor = live.lastBlock > blocks ? live.lastBlock - blocks : ZERO;
      } else cursor = stored;
      const ownerOf = new Map([[owner.address.toLowerCase(), owner.userId]]);
      while (budget > 0 && cursor < live.lastBlock) {
        const toBlock: bigint = cursor + TOKEN_BACKFILL_WINDOW_BLOCKS < live.lastBlock ? cursor + TOKEN_BACKFILL_WINDOW_BLOCKS : live.lastBlock;
        const logs = (await client.getLogs({ event: TRANSFER, args: { to: [getAddress(owner.address)] }, fromBlock: cursor + ONE, toBlock })) as TransferLog[];
        const usdcView = clients.network.addresses.usdc.toLowerCase();
        const emitter = clients.network.addresses.nativeUsdcTransferEmitter.toLowerCase();
        await this.discover(
          network,
          clients.network.chainId,
          logs.filter((entry) => entry.topics.length === ERC20_TRANSFER_TOPICS && ![usdcView, emitter].includes(entry.address.toLowerCase())),
          ownerOf,
          "backfill",
        );
        cursor = toBlock;
        budget -= 1;
      }
      const lastBlock = cursor >= live.lastBlock ? BACKFILL_DONE : cursor;
      await this.db
        .insert(indexerCursors)
        .values({ network, stream, lastBlock })
        .onConflictDoUpdate({ target: [indexerCursors.network, indexerCursors.stream], set: { lastBlock, updatedAt: new Date() } });
    }
  }

  /** Milliseconds per block, measured over the last BLOCK_TIME_SAMPLE blocks (Arc: ~0.5 s, 2026-10-02). */
  private async blockMs(client: NonNullable<ReturnType<Chains["get"]>>["client"]) {
    const head = await client.getBlock();
    const past = await client.getBlock({ blockNumber: head.number - BLOCK_TIME_SAMPLE });
    return (Number(head.timestamp - past.timestamp) * MS_PER_SECOND) / Number(BLOCK_TIME_SAMPLE);
  }

  private async record(network: NetworkId, chainId: number, asset: "USDC" | "EURC", entry: TransferLog, ownerOf: Map<string, string>, native: boolean) {
    const from = entry.args.from;
    const to = entry.args.to;
    const value = entry.args.value;
    if (!from || !to || value === undefined || !entry.transactionHash || entry.logIndex === null || entry.blockNumber === null) return;
    const userId = ownerOf.get(to.toLowerCase());
    if (!userId || from.toLowerCase() === to.toLowerCase()) return;
    // The system emitter reports USDC at 18 decimals; Kawase counts USDC at its ERC-20 6.
    const amount = native ? rescale(value, USDC_NATIVE_DECIMALS, USDC_ERC20_DECIMALS) : value;
    if (amount <= ZERO) return;

    await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(chainEvents)
        .values({
          userId,
          network,
          chainId,
          blockNumber: entry.blockNumber!,
          txHash: entry.transactionHash!,
          logIndex: entry.logIndex!,
          asset,
          fromAddress: getAddress(from),
          toAddress: getAddress(to),
          amount,
        })
        .onConflictDoNothing({ target: [chainEvents.chainId, chainEvents.txHash, chainEvents.logIndex] })
        .returning({ id: chainEvents.id });
      if (!inserted) return;
      // The person's own transaction (a swap's output coming back) is not money received from someone.
      const [own] = await tx
        .select({ id: txAttempts.id })
        .from(txAttempts)
        .where(and(eq(txAttempts.userId, userId), eq(txAttempts.chainId, chainId), eq(txAttempts.txHash, entry.transactionHash!.toLowerCase())));
      if (own) return;
      const saves = await tx
        .select({ id: automations.id, status: automations.status, action: automations.action })
        .from(automations)
        .where(and(eq(automations.userId, userId), eq(automations.network, network), eq(automations.kind, "auto_save")));
      if (saves.some((save) => (save.action as AutoSaveAction).vault.toLowerCase() === from.toLowerCase())) return;
      const rules = await tx
        .select({ id: automations.id, action: automations.action })
        .from(automations)
        .where(and(eq(automations.userId, userId), eq(automations.network, network), eq(automations.kind, "rule"), eq(automations.status, "active")));
      // Money coming back from a vault a saving rule fills is the person's own, not money received.
      if (rules.some((rule) => { const step = (rule.action as RuleAction).step; return step.type === "save" && step.vault.toLowerCase() === from.toLowerCase(); })) return;
      const name = await this.senderName(tx, userId, from);
      await this.inbox.add(tx, {
        userId,
        network,
        kind: "payment_received",
        params: { amount: amount.toString(), asset, from: getAddress(from), ...(name ? { name } : {}) },
        txHash: entry.transactionHash!,
        dedupeKey: `payment_received:${chainId}:${entry.transactionHash}:${entry.logIndex}`,
      });
      const paid = await this.requests.matchIncoming(tx, { userId, network, asset, amount, txHash: entry.transactionHash!, from: getAddress(from) });
      if (paid) await tx.update(chainEvents).set({ matchedRequestId: paid.id }).where(eq(chainEvents.id, inserted.id));
      const awake = saves.filter((save) => save.status === "active").map((save) => save.id);
      if (asset === "USDC" && awake.length > 0) await tx.update(automations).set({ nextRunAt: new Date() }).where(inArray(automations.id, awake));
      if (asset === "USDC") {
        // Balance rules look again now; each money-in rule this receipt matches gets one run, keyed by the receipt.
        const balanceRules = rules.filter((rule) => (rule.action as RuleAction).trigger.type !== "money_in").map((rule) => rule.id);
        if (balanceRules.length > 0) await tx.update(automations).set({ nextRunAt: new Date() }).where(inArray(automations.id, balanceRules));
        for (const rule of rules) {
          const trigger = (rule.action as RuleAction).trigger;
          if (trigger.type !== "money_in") continue;
          if (trigger.from && trigger.from.toLowerCase() !== from.toLowerCase()) continue;
          if (trigger.minAmount && amount < BigInt(trigger.minAmount)) continue;
          await tx
            .insert(automationRuns)
            .values({
              automationId: rule.id,
              userId,
              scheduledFor: new Date(),
              status: "pending",
              intentId: randomUUID(),
              triggerRef: `${chainId}:${entry.transactionHash}:${entry.logIndex}`,
              trigger: { receipt: amount.toString(), from: getAddress(from), txHash: entry.transactionHash! },
            })
            .onConflictDoNothing();
        }
      }
    });
  }

  /** How the receiver knows the sender: their own contact name, else the sender's Kawase @handle. */
  private async senderName(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], userId: string, from: Address) {
    const [contact] = await tx
      .select({ name: contacts.displayName })
      .from(contactAddresses)
      .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
      .where(and(eq(contactAddresses.userId, userId), inArray(contactAddresses.address, [from, from.toLowerCase(), getAddress(from)])));
    if (contact) return contact.name;
    const [sender] = await tx
      .select({ handle: users.handle })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(and(eq(wallets.role, "user"), inArray(wallets.address, [from, from.toLowerCase(), getAddress(from)])));
    return sender?.handle ? `@${sender.handle}` : undefined;
  }
}
