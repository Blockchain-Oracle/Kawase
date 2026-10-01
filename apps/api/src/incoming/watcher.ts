// Incoming payments (C2, C3): reads the chain's Transfer logs to Kawase wallets, per network, from a cursor. USDC is
// read from the system emitter only (`0xffff…FfFE`, 18 decimals), because it reports every USDC movement, native or
// ERC-20, once (an ERC-20 call also logs from 0x3600…, which would double count — context/01-arc/gotchas.md #23);
// EURC from its own contract. Each log becomes one row (unique per chain, tx, log), then an inbox item, and pays an
// open request when it matches one exactly. It runs inside the api for now and moves to apps/chain-watcher when the
// executor lands (Stage 8); the cursor and the unique rows make a repeat or a restart harmless.
import { and, eq, inArray } from "drizzle-orm";
import { getAddress, parseAbiItem, type Address, type Log } from "viem";

import {
  WATCH_ADDRESS_CHUNK,
  WATCH_BACKFILL_BLOCKS,
  WATCH_HEAD_LAG_BLOCKS,
  WATCH_MAX_BLOCKS,
} from "@kawase/config";
import { chainEvents, contacts, contactAddresses, indexerCursors, txAttempts, users, wallets, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { USDC_ERC20_DECIMALS, USDC_NATIVE_DECIMALS, rescale } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import type { InboxService } from "../inbox/service";
import type { RequestService } from "../requests/service";
import type { Chains } from "../wallet/chain";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const STREAM = "incoming_transfers";
const ONE = 1n;
const ZERO = 0n;

type TransferLog = Log<bigint, number, false, typeof TRANSFER>;

export class IncomingWatcher {
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly requests: RequestService,
    private readonly inbox: InboxService,
    private readonly log: Logger,
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

    for (let start = 0; start < addresses.length; start += WATCH_ADDRESS_CHUNK) {
      const chunk = addresses.slice(start, start + WATCH_ADDRESS_CHUNK);
      const [usdc, eurc] = await Promise.all([
        client.getLogs({ address: context.addresses.nativeUsdcTransferEmitter, event: TRANSFER, args: { to: chunk }, fromBlock, toBlock }),
        client.getLogs({ address: context.addresses.eurc, event: TRANSFER, args: { to: chunk }, fromBlock, toBlock }),
      ]);
      for (const entry of usdc) await this.record(network, context.chainId, "USDC", entry as TransferLog, ownerOf, true);
      for (const entry of eurc) await this.record(network, context.chainId, "EURC", entry as TransferLog, ownerOf, false);
    }

    await this.db
      .insert(indexerCursors)
      .values({ network, stream: STREAM, lastBlock: toBlock })
      .onConflictDoUpdate({ target: [indexerCursors.network, indexerCursors.stream], set: { lastBlock: toBlock, updatedAt: new Date() } });
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
