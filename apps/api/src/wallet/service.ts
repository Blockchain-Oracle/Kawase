// The wallet's life on each network: registration, the relayed 7702 setup, the everyday allowance, and
// transactions the wallet signs itself. Every signature is checked here before anything is broadcast.
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  erc20Abi,
  hashTypedData,
  parseTransaction,
  recoverTransactionAddress,
  verifyTypedData,
  type Address,
  type Hex,
  type SignedAuthorization,
  type TypedDataDefinition,
} from "viem";

import type { RevokeRequest } from "@kawase/api-client";
import { DEFAULT_LIMITS, GAS_ESTIMATE_HEADROOM_PERCENT, MIN_MAX_FEE_PER_GAS_GWEI, SECONDS_PER_DAY } from "@kawase/config";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import { automations, grants, intentDrafts, intents, newId, txAttempts, userWalletSetup, wallets, type Db } from "@kawase/db";
import {
  buildAllowanceGrant,
  buildRelayedBatch,
  describeGrant,
  encodeRedeemBatch,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
  type BatchCall,
} from "@kawase/integrations-delegation";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { hashDelegation } from "@metamask/smart-accounts-kit/utils";
import { DELEGATION_FRAMEWORK, type NetworkId } from "@kawase/networks";

import { ContactService } from "../contacts/service";
import { HTTP, ProblemError, problem } from "../http/problem";
import { relayerReady } from "../send/relayed";
import { fetchActivity } from "./activity";
import type { Chains, NetworkClients } from "./chain";

const SALT_BYTES = 32;
const MS_PER_SECOND = 1000;
/** An allowance lives this long before the app asks for a fresh signature. */
const ALLOWANCE_TTL_DAYS = 90;
const REVOKE_GAS_LIMIT = 200_000n;
/** Each further grant revoked in the same batch. */
const REVOKE_EACH_GAS = 120_000n;
const ZERO = 0n;

const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const EMPTY_SIGNATURE = "0x";
/** A delegation the wallet signed; one still waiting for its signature carries "0x". */
const isSigned = (delegation: Record<string, unknown>) => typeof delegation.signature === "string" && delegation.signature.length > EMPTY_SIGNATURE.length;
/** A refusal the api answered with (a problem) means "not this way"; anything else is a real failure. */
const refusedOnly = (error: unknown): undefined => {
  if (error instanceof ProblemError) return undefined;
  throw error;
};

export type PendingTransaction = {
  userId: string;
  network: NetworkId;
  kind: string;
  wallet: Address;
  to: Address;
  data: Hex;
  nonce: number;
  /** For revoking an automation's grants: which. */
  grantIds?: string[] | undefined;
};

/** A batch the relayer will send for the wallet, waiting for the wallet's signature on its one-time delegation. */
export type PendingRelay = { userId: string; network: NetworkId; kind: string; wallet: Address; grant: Delegation; calls: BatchCall[] };

/** The wallet's answer to an on-chain revoke handed to the app with a new grant: signed in the same yes. */
export type SignedRevoke = { requestId: string; signed: Hex };

/** `replacing`: the revoke makes way for a new grant (revokeFirst), so the automation it belonged to carries on. */
type RevokeOptions = { replacing?: boolean };

/** Which grants an on-chain revoke may cover: one kind, one token, everyday or raise. */
export type GrantFilter = { kind?: (typeof grants.$inferSelect)["kind"]; token?: string; boost?: boolean };

/** How long a relayed batch's delegation stays valid (it is also limited to one use). */
const RELAY_TTL_SECONDS = 600;
const GWEI = 1_000_000_000n;
const PERCENT = 100n;

export class WalletService {
  private readonly pendingRelays = new Map<string, PendingRelay>();

  /** Unsigned transactions handed to the wallet, remembered until the signed one comes back. */
  private readonly pendingTransactions = new Map<string, PendingTransaction>();

  /** Relayed revokes waiting for the wallet's signature: which grants each one turns off, until its batch expires. */
  private readonly pendingRevokes = new Map<string, { userId: string; grantIds: string[]; expiresAt: number }>();

  /** The person's address book, to put their own names on counterparties in the history. */
  private readonly contacts: ContactService;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    contacts?: ContactService,
  ) {
    this.contacts = contacts ?? new ContactService(db);
  }

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  async userWallet(userId: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.role, "user"), eq(wallets.status, "active")));
    return wallet;
  }

  private async requireWallet(userId: string) {
    const wallet = await this.userWallet(userId);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    return { ...wallet, address: wallet.address as Address };
  }

  /** Registers the Turnkey wallet the app created; the address must exist in the user's sub-organization. */
  async register(userId: string, input: { address: Address; walletId: string; subOrganizationId: string }) {
    const existing = await this.userWallet(userId);
    if (existing) {
      if (existing.address.toLowerCase() === input.address.toLowerCase()) return existing;
      throw problem(HTTP.conflict, "conflict", "This account already has a wallet");
    }
    const [wallet] = await this.db
      .insert(wallets)
      .values({
        userId,
        role: "user",
        custody: "turnkey",
        address: input.address,
        providerRef: { subOrganizationId: input.subOrganizationId, walletId: input.walletId },
      })
      .returning();
    return wallet;
  }

  /**
   * USDC and EURC transfers in and out of the user's wallet on one network, newest first (the chain's explorer),
   * with the person's own contact name on a counterparty whose address is in their book (any version of it, so an
   * old address still reads as the person it belonged to). Names are added after the explorer cache: a contact
   * saved a second ago shows at once.
   */
  async activity(userId: string, network: NetworkId) {
    const wallet = await this.userWallet(userId);
    if (!wallet) return { items: [], more: false, historyUrl: null };
    const { network: context, ops, relayerAddress } = this.clients(network);
    let page;
    try {
      page = await fetchActivity(context, wallet.address as Address, { agent: ops.address, relayer: relayerAddress });
    } catch {
      throw problem(HTTP.badGateway, "upstream", "the explorer did not answer");
    }
    const [names, own] = await Promise.all([this.contactNames(userId), this.ownIntents(userId, page.items.map((item) => item.txHash))]);
    return {
      ...page,
      items: page.items.map((item) => {
        const mine = own.get(item.txHash.toLowerCase());
        if (mine?.kind === "bridge") return { ...item, counterpartyLabel: "bridge" as const, bridge: { chainId: mine.chainId }, contactName: null };
        if (mine?.kind === "earn") return { ...item, counterpartyLabel: "earn" as const, earn: { action: mine.action, vault: mine.vault }, contactName: null };
        return { ...item, contactName: names.get(item.counterparty.toLowerCase()) ?? null };
      }),
    };
  }

  /** Transactions that were the person's own bridges or earn moves → what each was (from the intent's draft). */
  private async ownIntents(userId: string, hashes: string[]) {
    type Own = { kind: "bridge"; chainId: number } | { kind: "earn"; action: "deposit" | "withdraw"; vault: string };
    const lower = [...new Set(hashes.map((hash) => hash.toLowerCase()))];
    const out = new Map<string, Own>();
    if (lower.length === 0) return out;
    const rows = await this.db
      .select({ txHash: txAttempts.txHash, kind: intents.kind, payload: intentDrafts.payload })
      .from(txAttempts)
      .innerJoin(intents, eq(intents.id, txAttempts.intentId))
      .innerJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
      .where(and(eq(txAttempts.userId, userId), inArray(intents.kind, ["bridge", "earn"]), inArray(sql`lower(${txAttempts.txHash})`, lower)));
    for (const row of rows) {
      if (!row.txHash) continue;
      const view = (row.payload as { view?: { chainId?: number; action?: "deposit" | "withdraw"; vault?: { name?: string } } } | null)?.view;
      if (row.kind === "bridge" && view?.chainId) out.set(row.txHash.toLowerCase(), { kind: "bridge", chainId: view.chainId });
      if (row.kind === "earn" && view?.action && view.vault?.name) out.set(row.txHash.toLowerCase(), { kind: "earn", action: view.action, vault: view.vault.name });
    }
    return out;
  }

  /** Lower-cased address → the contact's name; the current address of a contact wins over its older ones. */
  private async contactNames(userId: string) {
    const book = await this.contacts.addressBook(userId);
    const names = new Map<string, string>();
    const ranked = [...book].sort((a, b) => Number(b.status === "active" && b.isPreferred) - Number(a.status === "active" && a.isPreferred));
    for (const entry of ranked) {
      const key = entry.address.toLowerCase();
      if (!names.has(key)) names.set(key, entry.name);
    }
    return names;
  }

  /**
   * The wallet's state on each available network (the app's wallet screen), or on the ones asked for (the agent reads
   * only the active one). Networks are read in parallel: a turn waits for the slowest chain, not the sum.
   */
  async status(userId: string, only?: readonly NetworkId[]) {
    const wallet = await this.userWallet(userId);
    if (!wallet) return { address: undefined, networks: {} };
    const address = wallet.address as Address;
    const ids = this.chains.available.filter((id) => !only || only.includes(id));
    const read = async (id: NetworkId) => {
      const { client, network } = this.clients(id);
      const balanceOf = (token: Address) =>
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      // The chain is the authority on whether the allowance is still on: a revoke whose answer was lost (the app
      // went offline, the api restarted mid-wait) is found here and recorded, so the app never offers a blind second
      // revoke for an allowance that is already off (Codex review R05). The check runs alongside the balance reads.
      const liveAllowance = async () => {
        const [row] = await this.db
          .select()
          .from(grants)
          .where(
            and(
              eq(grants.userId, userId),
              eq(grants.network, id),
              eq(grants.kind, "allowance"),
              eq(grants.status, "active"),
              eq(grants.boost, false),
              sql`lower(coalesce(${grants.tokenAddress}, ${grants.receipt}->>'token')) = ${network.addresses.usdc.toLowerCase()}`,
            ),
          )
          .orderBy(desc(grants.createdAt))
          .limit(1);
        if (!row || !(await this.disabledOnChain(client, row.delegation))) return row;
        await this.db.update(grants).set({ status: "revoked" }).where(eq(grants.id, row.id));
        return undefined;
      };
      const [code, usdcBalance, eurcBalance, setup, live] = await Promise.all([
        client.getCode({ address }),
        balanceOf(network.addresses.usdc),
        balanceOf(network.addresses.eurc),
        this.db
          .select()
          .from(userWalletSetup)
          .where(and(eq(userWalletSetup.userId, userId), eq(userWalletSetup.network, id))),
        liveAllowance(),
      ]);
      return [
        id,
        {
          setUp: isWalletSetUp(code),
          setupAt: setup[0]?.setupAt ?? null,
          usdcBalance: usdcBalance.toString(),
          eurcBalance: eurcBalance.toString(),
          allowance: live ? { id: live.id, receipt: live.receipt, expiresAt: live.expiresAt } : null,
        },
      ] as const;
    };
    const networks: Record<string, unknown> = Object.fromEntries(await Promise.all(ids.map(read)));
    return { address, networks };
  }

  /** True when the DelegationManager has disabled this grant. A failed read is not proof of anything: it says no. */
  private async disabledOnChain(client: NetworkClients["client"], delegation: Record<string, unknown>) {
    return DelegationManager.read
      .disabledDelegations({
        client,
        contractAddress: DELEGATION_FRAMEWORK.delegationManager,
        delegationHash: hashDelegation(delegation as never),
      })
      .catch(() => false);
  }

  async setupRequest(userId: string, network: NetworkId) {
    const wallet = await this.requireWallet(userId);
    const clients = this.clients(network);
    const { client, network: context } = clients;
    const code = await client.getCode({ address: wallet.address });
    if (isWalletSetUp(code)) return { alreadySetUp: true as const };
    // The relayer pays for the setup; until it holds gas on this network, say so plainly (no signature is asked).
    if (!(await relayerReady(clients))) throw problem(HTTP.serviceUnavailable, "network_not_ready", `Kawase is getting ${network} ready`);
    const nonce = await client.getTransactionCount({ address: wallet.address });
    return { alreadySetUp: false as const, authorization: setupAuthorizationRequest(context, nonce) };
  }

  /** The relayer sends the type-4 transaction and pays for it (spike 15). */
  async setupSubmit(userId: string, network: NetworkId, authorization: SignedAuthorization) {
    const wallet = await this.requireWallet(userId);
    const clients = this.clients(network);
    const { client, relayer, relayerAddress, network: context } = clients;
    if (!(await relayerReady(clients))) throw problem(HTTP.serviceUnavailable, "network_not_ready", `Kawase is getting ${network} ready`);
    if (authorization.chainId !== context.chainId)
      throw problem(HTTP.unprocessable, "validation", "authorization is for another chain");
    if (authorization.address.toLowerCase() !== DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.toLowerCase()) {
      throw problem(HTTP.unprocessable, "validation", "authorization does not name the expected delegator");
    }
    const attemptId = newId();
    await this.db.insert(txAttempts).values({
      id: attemptId,
      userId,
      network,
      chainId: context.chainId,
      kind: "setup_7702",
      provider: "relayer",
      idempotencyKey: randomUUID(),
      fromAddress: relayerAddress,
      toAddress: wallet.address,
      status: "submitted",
    });
    const hash = await relayer.sendTransaction({
      account: relayer.account!,
      chain: context.viemChain,
      authorizationList: [authorization],
      to: wallet.address,
      data: "0x",
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const setUp = isWalletSetUp(await client.getCode({ address: wallet.address }));
    await this.db
      .update(txAttempts)
      .set({
        txHash: hash,
        status: receipt.status === "success" ? "confirmed" : "reverted",
        receipt: jsonSafe(receipt),
      })
      .where(eq(txAttempts.id, attemptId));
    if (!setUp) throw problem(HTTP.badGateway, "upstream", "the setup transaction did not take", { tx: hash });
    await this.db
      .insert(userWalletSetup)
      .values({
        userId,
        network,
        delegatorImpl: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator,
        setupTxAttemptId: attemptId,
        setupAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userWalletSetup.userId, userWalletSetup.network],
        set: {
          delegatorImpl: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator,
          setupTxAttemptId: attemptId,
          setupAt: new Date(),
        },
      });
    return { tx: hash, setUp };
  }

  /**
   * The everyday allowance for one token (USDC unless another is named): the network's default daily amount to our
   * redeemer, any recipient. Each token has its own (cards/automate-safety.md); changing one later goes through
   * Wallet & limits (/safety), where loosening replaces the grant and revokes the old one.
   */
  async allowanceRequest(userId: string, network: NetworkId, periodAmount?: bigint, token?: Address) {
    const wallet = await this.requireWallet(userId);
    const { client, ops, network: context } = this.clients(network);
    if (!isWalletSetUp(await client.getCode({ address: wallet.address })))
      throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const tokenAddress = token ?? context.addresses.usdc;
    // A new allowance for a token that already has one replaces it: the old one's revoke is signed in the same yes.
    const revoke = await this.revokeGrantsRequest(userId, await this.unrevokedGrantIds(userId, network, { kind: "allowance", token: tokenAddress, boost: false }));
    const startsAt = nowSeconds();
    const expiresAt = startsAt + ALLOWANCE_TTL_DAYS * SECONDS_PER_DAY;
    const grant = buildAllowanceGrant({
      network: context,
      wallet: wallet.address,
      redeemer: ops.address,
      token: tokenAddress,
      amountPerPeriod: periodAmount ?? DEFAULT_LIMITS[network].daily,
      periodSeconds: SECONDS_PER_DAY,
      startsAt,
      expiresAt,
      salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`,
    });
    const typedData = grantTypedData(context, grant);
    const receipt = describeGrant(context, grant);
    const [row] = await this.db
      .insert(grants)
      .values({
        userId,
        network,
        kind: "allowance",
        delegatorWalletId: wallet.id,
        delegateAddress: ops.address,
        delegation: jsonSafe(grant),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: receipt.amountPerPeriod ?? ZERO,
        periodSeconds: SECONDS_PER_DAY,
        tokenAddress,
        startsAt: new Date(startsAt * MS_PER_SECOND),
        expiresAt: new Date(expiresAt * MS_PER_SECOND),
        status: "pending",
      })
      .returning({ id: grants.id });
    return { grantId: row!.id, typedData: jsonSafe(typedData), receipt: jsonSafe(receipt), revoke };
  }

  /**
   * The wallet signed the allowance. When it replaces one the chain still honours, the old one's revoke (signed in the
   * same yes) goes first, and the new one is turned on only once the chain shows the old one off.
   */
  async allowanceSubmit(userId: string, grantId: string, signature: Hex, revoke?: SignedRevoke) {
    const [pending] = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.id, grantId), eq(grants.userId, userId)));
    if (!pending || pending.status !== "pending") throw problem(HTTP.unprocessable, "grant_not_pending");
    const wallet = await this.requireWallet(userId);
    const { network: context } = this.clients(pending.network);
    const grant = withSignature(pending.delegation as never, signature);
    const typedData = grantTypedData(context, grant) as TypedDataDefinition;
    // A malformed signature (wrong length, impossible v) is just an invalid one.
    const valid = await verifyTypedData({ address: wallet.address, ...typedData, signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
    const token = (pending.tokenAddress ?? (pending.receipt as { token?: string }).token ?? "").toLowerCase();
    await this.revokeFirst(userId, await this.unrevokedGrantIds(userId, pending.network, { kind: "allowance", token, boost: false }), revoke);
    await this.db.transaction(async (tx) => {
      await tx
        .update(grants)
        .set({ status: "superseded" })
        .where(
          and(
            eq(grants.userId, userId),
            eq(grants.network, pending.network),
            eq(grants.kind, "allowance"),
            eq(grants.status, "active"),
            eq(grants.boost, false),
            sql`lower(coalesce(${grants.tokenAddress}, ${grants.receipt}->>'token')) = ${token}`,
          ),
        );
      await tx
        .update(grants)
        .set({ status: "active", delegation: jsonSafe(grant) })
        .where(eq(grants.id, grantId));
      await tx
        .update(userWalletSetup)
        .set({ allowanceGrantId: grantId })
        .where(and(eq(userWalletSetup.userId, userId), eq(userWalletSetup.network, pending.network)));
    });
    return { grantId, receipt: pending.receipt, expiresAt: pending.expiresAt };
  }

  /** The revoke of every allowance the chain still honours on this network (each token's, and any raise); one Face ID. */
  async revokeRequest(userId: string, network: NetworkId) {
    const request = await this.revokeGrantsRequest(userId, await this.unrevokedGrantIds(userId, network, { kind: "allowance" }));
    if (!request) throw problem(HTTP.notFound, "not_found", "no active allowance");
    return request;
  }

  /**
   * Every grant on this network the chain would still honour, whatever its status here: signed, not expired, and never
   * revoked on chain. A grant set aside only in the database (superseded, revoked, turned off) is still redeemable until
   * the wallet disables it, so revoke-all, the exit kit and a replacement cover these too.
   */
  async unrevokedGrantIds(userId: string, network: NetworkId, only: GrantFilter = {}): Promise<string[]> {
    const rows = await this.db
      .select({ id: grants.id, delegation: grants.delegation })
      .from(grants)
      .where(
        and(
          eq(grants.userId, userId),
          eq(grants.network, network),
          isNull(grants.revokeTxAttemptId),
          gt(grants.expiresAt, new Date()),
          only.kind ? eq(grants.kind, only.kind) : undefined,
          only.boost === undefined ? undefined : eq(grants.boost, only.boost),
          only.token ? sql`lower(coalesce(${grants.tokenAddress}, ${grants.receipt}->>'token')) = ${only.token.toLowerCase()}` : undefined,
        ),
      );
    return rows.filter((row) => isSigned(row.delegation)).map((row) => row.id);
  }

  /**
   * The on-chain revoke (`DelegationManager.disableDelegation`) of these grants, for the wallet to sign: B1, B2 and A3
   * all turn a grant off through here. Covers each one that is signed, not expired and still honoured on chain, whatever
   * its status here; the rest are skipped (disabling one twice would revert the whole batch). Several go as one batch,
   * still one signature. Kawase's relayer sends it and pays (a one-time delegation for exactly these calls), so a wallet
   * with no USDC can still turn its grants off; until the relayer has gas, the wallet sends it itself. Null when nothing
   * is left to revoke. The app signs it and posts it to /wallet/transactions/submit; the grants are recorded revoked
   * once it confirms.
   */
  async revokeGrantsRequest(userId: string, grantIds: string[]): Promise<RevokeRequest | null> {
    const rows = await this.revocable(userId, grantIds);
    const [first] = rows;
    if (!first) return null;
    const clients = this.clients(first.network);
    const ids = rows.map((row) => row.id);
    const calls = rows.map((row) => encodeRevoke(clients.network, row.delegation as never));
    // The relayer may refuse (its daily share or budget is spent): the wallet then sends the revoke itself.
    const relayed = (await relayerReady(clients)) ? await this.relayedBatchRequest(userId, first.network, "revoke_grant", calls).catch(refusedOnly) : undefined;
    if (relayed) {
      const now = Date.now();
      for (const [id, entry] of this.pendingRevokes) if (entry.expiresAt < now) this.pendingRevokes.delete(id);
      this.pendingRevokes.set(relayed.requestId, { userId, grantIds: ids, expiresAt: now + RELAY_TTL_SECONDS * MS_PER_SECOND });
      return { ...relayed, grantIds: ids };
    }
    if (calls.length === 1) return this.unsignedTransaction(userId, first.network, "revoke_grant", calls[0]!.to, calls[0]!.data, REVOKE_GAS_LIMIT, { grantIds: ids });
    const wallet = await this.requireWallet(userId);
    const data = encodeSelfBatch(calls.map((call) => ({ ...call, value: ZERO })));
    const gas = REVOKE_GAS_LIMIT + REVOKE_EACH_GAS * BigInt(calls.length - 1);
    return this.unsignedTransaction(userId, first.network, "revoke_grant", wallet.address, data, gas, { grantIds: ids });
  }

  /**
   * Of these grants, the ones a revoke must still cover (one network: the first's), checked against the chain. One the
   * chain already disabled (a revoke whose answer was lost) is recorded here as revoked and left out.
   */
  private async revocable(userId: string, grantIds: string[]) {
    if (grantIds.length === 0) return [];
    const rows = (
      await this.db
        .select()
        .from(grants)
        .where(and(inArray(grants.id, grantIds), eq(grants.userId, userId), isNull(grants.revokeTxAttemptId), gt(grants.expiresAt, new Date())))
    ).filter((row) => isSigned(row.delegation));
    const [first] = rows;
    if (!first) return [];
    const { client } = this.clients(first.network);
    const sameNetwork = rows.filter((row) => row.network === first.network);
    const disabled = await Promise.all(sameNetwork.map((row) => this.disabledOnChain(client, row.delegation)));
    const gone = sameNetwork.filter((_, index) => disabled[index]).map((row) => row.id);
    if (gone.length > 0) await this.db.update(grants).set({ status: "revoked" }).where(inArray(grants.id, gone));
    return sameNetwork.filter((_, index) => !disabled[index]);
  }

  /**
   * Before a new grant replaces old ones: every one of them still honoured on chain is turned off first, with the
   * revoke the wallet signed in the same yes as the new grant. Refused when the revoke is missing or does not land, so
   * the chain never holds the old grant and its replacement together.
   */
  async revokeFirst(userId: string, grantIds: string[], revoke: SignedRevoke | undefined): Promise<void> {
    if ((await this.revocable(userId, grantIds)).length === 0) return;
    if (!revoke) throw problem(HTTP.unprocessable, "revoke_required", "the grant this replaces must be revoked in the same approval");
    const sent = await this.submitSigned(userId, revoke.requestId, revoke.signed, { replacing: true });
    if (sent.status !== "confirmed") throw problem(HTTP.badGateway, "revoke_failed", "the old grant's revoke did not land; nothing changed", { tx: sent.tx });
    if ((await this.revocable(userId, grantIds)).length > 0) throw problem(HTTP.unprocessable, "revoke_required", "the revoke signed does not cover every grant this replaces");
  }

  /**
   * The wallet's answer to a request handed out here: its signature on a relayed batch, or a signed transaction.
   * `replacing`: the revoke makes way for a new grant, so an automation losing its old grant carries on.
   */
  async submitSigned(userId: string, requestId: string, signed: Hex, options: RevokeOptions = {}) {
    const revoking = this.pendingRevokes.get(requestId);
    if (!revoking) return this.submitTransaction(userId, requestId, signed, options);
    if (revoking.userId !== userId) throw problem(HTTP.notFound, "not_found", "no such transaction request");
    const sent = await this.submitRelayedBatch(userId, requestId, signed);
    this.pendingRevokes.delete(requestId);
    if (sent.status === "confirmed") {
      const [attempt] = await this.db.select({ id: txAttempts.id }).from(txAttempts).where(eq(txAttempts.txHash, sent.tx));
      await this.recordRevoked(userId, revoking.grantIds, attempt?.id ?? null, options);
    }
    return sent;
  }

  /**
   * Grants the chain confirmed revoked. An automation left with no grant can never run again: it ends now (the exit kit,
   * a cancel). One that still holds another, or whose replacement is about to go on (a widened edit), carries on.
   */
  private async recordRevoked(userId: string, grantIds: string[], attemptId: string | null, options: RevokeOptions = {}) {
    const revoked = await this.db
      .update(grants)
      .set({ status: "revoked", revokeTxAttemptId: attemptId })
      .where(and(inArray(grants.id, grantIds), eq(grants.userId, userId)))
      .returning({ automationId: grants.automationId });
    if (options.replacing) return;
    const touched = [...new Set(revoked.map((row) => row.automationId).filter((id): id is string => Boolean(id)))];
    const stillHeld = touched.length
      ? new Set((await this.db.select({ id: grants.automationId }).from(grants).where(and(inArray(grants.automationId, touched), eq(grants.status, "active")))).map((row) => row.id))
      : new Set<string | null>();
    const ids = touched.filter((id) => !stillHeld.has(id));
    if (ids.length > 0)
      await this.db
        .update(automations)
        .set({ status: "canceled", nextRunAt: null })
        .where(and(inArray(automations.id, ids), eq(automations.userId, userId), inArray(automations.status, ["active", "paused", "draft"])));
  }

  /**
   * Several calls from the wallet in one transaction the wallet sends to itself (its 7702 DeleGator runs them in order,
   * all or nothing): one signature, one Face ID. Used by batch payouts.
   */
  async selfBatchRequest(userId: string, network: NetworkId, kind: string, calls: readonly { to: Address; data: Hex }[], gas: bigint) {
    const wallet = await this.requireWallet(userId);
    const data = encodeSelfBatch(calls.map((call) => ({ ...call, value: ZERO })));
    return this.unsignedTransaction(userId, network, kind, wallet.address, data, gas);
  }

  /**
   * Whether the wallet can pay a batch's fee itself once `spendUsdc` has left it (Arc gas is USDC). When it can't,
   * the batch goes through the relayer instead (relayedBatchRequest): no out-of-gas dead end.
   */
  async canPayFee(userId: string, network: NetworkId, spendUsdc: bigint, gas: bigint): Promise<boolean> {
    const wallet = await this.requireWallet(userId);
    const { client, network: context } = this.clients(network);
    const [usdc, fees] = await Promise.all([
      client.readContract({ address: context.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address as Address] }),
      client.estimateFeesPerGas(),
    ]);
    const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
    const perGas = fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
    const fee = rescale((gas * GAS_ESTIMATE_HEADROOM_PERCENT * perGas) / PERCENT, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
    return usdc - spendUsdc >= fee;
  }

  /**
   * The same batch, sent by Kawase's relayer: the wallet signs a one-time delegation that allows exactly these calls,
   * once, for ten minutes, redeemable only by the relayer (integrations-delegation relayed-batch.ts). The relayer pays.
   */
  async relayedBatchRequest(userId: string, network: NetworkId, kind: string, calls: readonly { to: Address; data: Hex; value?: bigint | undefined }[]) {
    const wallet = await this.requireWallet(userId);
    const clients = this.clients(network);
    if (!isWalletSetUp(await clients.client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.conflict, "wallet_not_set_up");
    // A call's value (Arc's native USDC, e.g. a bridge's flat fee) comes from the wallet's own balance, pinned like the rest.
    const batch = calls.map((call) => ({ ...call, value: call.value ?? ZERO }));
    const grant = buildRelayedBatch({
      network: clients.network,
      wallet: wallet.address as Address,
      relayer: clients.relayerAddress,
      calls: batch,
      expiresAt: Math.floor(Date.now() / MS_PER_SECOND) + RELAY_TTL_SECONDS,
      salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`,
    });
    const id = newId();
    this.pendingRelays.set(id, { userId, network, kind, wallet: wallet.address as Address, grant, calls: batch });
    // JSON for the app: uint256 fields as decimal strings (the signer reads them back as numbers).
    return { requestId: id, relayed: true as const, typedData: jsonSafe(grantTypedData(clients.network, grant)) as Record<string, unknown> };
  }

  /** The wallet signed the one-time delegation: checked, then the relayer redeems it with exactly that batch. */
  async submitRelayedBatch(userId: string, requestId: string, signature: Hex) {
    const pending = this.pendingRelays.get(requestId);
    if (!pending || pending.userId !== userId) throw problem(HTTP.notFound, "not_found", "no such transaction request");
    const clients = this.clients(pending.network);
    const valid = await verifyTypedData({ address: pending.wallet, ...(grantTypedData(clients.network, pending.grant) as TypedDataDefinition), signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch", "the delegation is not signed by this wallet");
    this.pendingRelays.delete(requestId);
    const call = encodeRedeemBatch(clients.network, withSignature(pending.grant, signature), pending.calls);
    const attemptId = newId();
    await this.db.insert(txAttempts).values({
      id: attemptId,
      userId,
      network: pending.network,
      chainId: clients.network.chainId,
      kind: `${pending.kind}_relayed`,
      provider: "relayer",
      idempotencyKey: randomUUID(),
      fromAddress: clients.relayerAddress,
      toAddress: call.to,
      status: "submitted",
    });
    const hash = await clients.relayer.sendTransaction({ to: call.to, data: call.data, chain: clients.network.viemChain, account: clients.relayer.account! });
    const receipt = await clients.client.waitForTransactionReceipt({ hash });
    const status = receipt.status === "success" ? "confirmed" : "reverted";
    await this.db.update(txAttempts).set({ txHash: hash, status, receipt: jsonSafe(receipt) }).where(eq(txAttempts.id, attemptId));
    return { tx: hash, status };
  }

  private async unsignedTransaction(
    userId: string,
    network: NetworkId,
    kind: string,
    to: Address,
    data: Hex,
    gas: bigint,
    extra: Record<string, unknown> = {},
  ) {
    const wallet = await this.requireWallet(userId);
    const { client, network: context } = this.clients(network);
    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: wallet.address }),
      client.estimateFeesPerGas(),
    ]);
    const id = newId();
    const grantIds = Array.isArray(extra.grantIds) ? (extra.grantIds as string[]) : undefined;
    this.pendingTransactions.set(id, { userId, network, kind, wallet: wallet.address, to, data, nonce, grantIds });
    return {
      requestId: id,
      ...extra,
      transaction: {
        type: "eip1559" as const,
        chainId: context.chainId,
        nonce,
        to,
        data,
        value: "0",
        gas: gas.toString(),
        maxFeePerGas: fees.maxFeePerGas.toString(),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      },
    };
  }

  /** Checks a wallet-signed transaction against what was requested, then broadcasts it. */
  async submitTransaction(userId: string, requestId: string, signedTransaction: Hex, options: RevokeOptions = {}) {
    const pending = this.pendingTransactions.get(requestId);
    if (!pending || pending.userId !== userId) throw problem(HTTP.notFound, "not_found", "no such transaction request");
    const { client, network: context } = this.clients(pending.network);
    const parsed = parseTransaction(signedTransaction);
    const signer = await recoverTransactionAddress({ serializedTransaction: signedTransaction as never }).catch(
      () => undefined,
    );
    if (!signer) throw problem(HTTP.unprocessable, "transaction_mismatch", "the transaction is not signed");
    const checks = {
      signer: signer.toLowerCase() === pending.wallet.toLowerCase(),
      to: parsed.to?.toLowerCase() === pending.to.toLowerCase(),
      // Hex compared without regard to case: a parsed signed transaction reads lower-case.
      data: parsed.data?.toLowerCase() === pending.data.toLowerCase(),
      nonce: parsed.nonce === pending.nonce,
      chain: parsed.chainId === context.chainId,
      value: (parsed.value ?? ZERO) === ZERO,
    };
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length > 0) throw problem(HTTP.unprocessable, "transaction_mismatch", `differs in: ${failed.join(", ")}`);
    this.pendingTransactions.delete(requestId);

    const attemptId = newId();
    await this.db.insert(txAttempts).values({
      id: attemptId,
      userId,
      network: pending.network,
      chainId: context.chainId,
      kind: pending.kind,
      provider: "user_wallet",
      idempotencyKey: randomUUID(),
      fromAddress: pending.wallet,
      toAddress: pending.to,
      nonce: pending.nonce,
      status: "submitted",
    });
    const hash = await client.sendRawTransaction({ serializedTransaction: signedTransaction });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const status = receipt.status === "success" ? "confirmed" : "reverted";
    await this.db
      .update(txAttempts)
      .set({ txHash: hash, status, receipt: jsonSafe(receipt) })
      .where(eq(txAttempts.id, attemptId));
    if (pending.kind === "revoke_grant" && pending.grantIds?.length && status === "confirmed") await this.recordRevoked(userId, pending.grantIds, attemptId, options);
    if (pending.kind === "revoke_allowance" && status === "confirmed") {
      await this.db
        .update(grants)
        .set({ status: "revoked", revokeTxAttemptId: attemptId })
        .where(
          and(
            eq(grants.userId, userId),
            eq(grants.network, pending.network),
            eq(grants.kind, "allowance"),
            eq(grants.status, "active"),
          ),
        );
    }
    return { tx: hash, status };
  }
}
