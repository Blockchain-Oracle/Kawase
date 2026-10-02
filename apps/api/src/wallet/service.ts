// The wallet's life on each network: registration, the relayed 7702 setup, the everyday allowance, and
// transactions the wallet signs itself. Every signature is checked here before anything is broadcast.
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

import { DEFAULT_LIMITS, SECONDS_PER_DAY } from "@kawase/config";
import { automations, grants, intentDrafts, intents, newId, txAttempts, userWalletSetup, wallets, type Db } from "@kawase/db";
import {
  buildAllowanceGrant,
  describeGrant,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
} from "@kawase/integrations-delegation";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { hashDelegation } from "@metamask/smart-accounts-kit/utils";
import { DELEGATION_FRAMEWORK, type NetworkId } from "@kawase/networks";

import { ContactService } from "../contacts/service";
import { HTTP, problem } from "../http/problem";
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

export class WalletService {
  /** Unsigned transactions handed to the wallet, remembered until the signed one comes back. */
  private readonly pendingTransactions = new Map<string, PendingTransaction>();

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
    const { client, network: context } = this.clients(network);
    const code = await client.getCode({ address: wallet.address });
    if (isWalletSetUp(code)) return { alreadySetUp: true as const };
    const nonce = await client.getTransactionCount({ address: wallet.address });
    return { alreadySetUp: false as const, authorization: setupAuthorizationRequest(context, nonce) };
  }

  /** The relayer sends the type-4 transaction and pays for it (spike 15). */
  async setupSubmit(userId: string, network: NetworkId, authorization: SignedAuthorization) {
    const wallet = await this.requireWallet(userId);
    const { client, relayer, relayerAddress, network: context } = this.clients(network);
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
    const startsAt = nowSeconds();
    const expiresAt = startsAt + ALLOWANCE_TTL_DAYS * SECONDS_PER_DAY;
    const grant = buildAllowanceGrant({
      network: context,
      wallet: wallet.address,
      redeemer: ops.address,
      token: token ?? context.addresses.usdc,
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
        tokenAddress: token ?? context.addresses.usdc,
        startsAt: new Date(startsAt * MS_PER_SECOND),
        expiresAt: new Date(expiresAt * MS_PER_SECOND),
        status: "pending",
      })
      .returning({ id: grants.id });
    return { grantId: row!.id, typedData: jsonSafe(typedData), receipt: jsonSafe(receipt) };
  }

  async allowanceSubmit(userId: string, grantId: string, signature: Hex) {
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

  /** An unsigned transaction that revokes every allowance on this network (each token's, and any raise); one Face ID. */
  async revokeRequest(userId: string, network: NetworkId) {
    const active = await this.db
      .select({ id: grants.id })
      .from(grants)
      .where(and(eq(grants.userId, userId), eq(grants.network, network), eq(grants.kind, "allowance"), eq(grants.status, "active")));
    const request = await this.revokeGrantsRequest(userId, active.map((row) => row.id));
    if (!request) throw problem(HTTP.notFound, "not_found", "no active allowance");
    return request;
  }

  /** An unsigned transaction that revokes one grant (an automation's) on chain; the wallet signs it. */
  /**
   * Revoking an automation's grants: one grant is one `disableDelegation`; several (Auto-save's three) go as one batch
   * the wallet sends to itself, so it is still one transaction and one Face ID.
   */
  async revokeGrantsRequest(userId: string, grantIds: string[]) {
    if (grantIds.length === 0) return null;
    const rows = await this.db
      .select()
      .from(grants)
      .where(and(inArray(grants.id, grantIds), eq(grants.userId, userId), eq(grants.status, "active")));
    const [first] = rows;
    if (!first) return null;
    const { network: context } = this.clients(first.network);
    const ids = rows.map((row) => row.id);
    const calls = rows.map((row) => encodeRevoke(context, row.delegation as never));
    if (calls.length === 1) return this.unsignedTransaction(userId, first.network, "revoke_grant", calls[0]!.to, calls[0]!.data, REVOKE_GAS_LIMIT, { grantIds: ids });
    const wallet = await this.requireWallet(userId);
    const data = encodeSelfBatch(calls.map((call) => ({ ...call, value: ZERO })));
    const gas = REVOKE_GAS_LIMIT + REVOKE_EACH_GAS * BigInt(calls.length - 1);
    return this.unsignedTransaction(userId, first.network, "revoke_grant", wallet.address, data, gas, { grantIds: ids });
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
        type: "eip1559",
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
  async submitTransaction(userId: string, requestId: string, signedTransaction: Hex) {
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
    if (pending.kind === "revoke_grant" && pending.grantIds?.length && status === "confirmed") {
      const revoked = await this.db
        .update(grants)
        .set({ status: "revoked", revokeTxAttemptId: attemptId })
        .where(and(inArray(grants.id, pending.grantIds), eq(grants.userId, userId)))
        .returning({ automationId: grants.automationId });
      // An automation whose grant is gone can never run again: it ends now, said plainly (the exit kit, a cancel).
      const ids = [...new Set(revoked.map((row) => row.automationId).filter((id): id is string => Boolean(id)))];
      if (ids.length > 0)
        await this.db
          .update(automations)
          .set({ status: "canceled", nextRunAt: null })
          .where(and(inArray(automations.id, ids), eq(automations.userId, userId), inArray(automations.status, ["active", "paused", "draft"])));
    }
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
