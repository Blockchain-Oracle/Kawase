// The wallet's life on each network: registration, the relayed 7702 setup, the everyday allowance, and
// transactions the wallet signs itself. Every signature is checked here before anything is broadcast.
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
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
import { grants, newId, txAttempts, userWalletSetup, wallets, type Db } from "@kawase/db";
import {
  buildAllowanceGrant,
  describeGrant,
  encodeRevoke,
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
    const names = await this.contactNames(userId);
    return { ...page, items: page.items.map((item) => ({ ...item, contactName: names.get(item.counterparty.toLowerCase()) ?? null })) };
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

  /** The wallet's state on each available network, for the app's wallet screen. */

  async status(userId: string) {
    const wallet = await this.userWallet(userId);
    if (!wallet) return { address: undefined, networks: {} };
    const address = wallet.address as Address;
    const networks: Record<string, unknown> = {};
    for (const id of this.chains.available) {
      const { client, network } = this.clients(id);
      const balanceOf = (token: Address) =>
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      const [code, usdcBalance, eurcBalance, setup, allowance] = await Promise.all([
        client.getCode({ address }),
        balanceOf(network.addresses.usdc),
        balanceOf(network.addresses.eurc),
        this.db
          .select()
          .from(userWalletSetup)
          .where(and(eq(userWalletSetup.userId, userId), eq(userWalletSetup.network, id))),
        this.db
          .select()
          .from(grants)
          .where(
            and(
              eq(grants.userId, userId),
              eq(grants.network, id),
              eq(grants.kind, "allowance"),
              eq(grants.status, "active"),
            ),
          )
          .orderBy(desc(grants.createdAt))
          .limit(1),
      ]);
      // The chain is the authority on whether the allowance is still on: a revoke whose answer was lost (the app
      // went offline, the api restarted mid-wait) is found here and recorded, so the app never offers a blind second
      // revoke for an allowance that is already off (Codex review R05).
      let live = allowance[0];
      if (live && (await this.disabledOnChain(client, live.delegation))) {
        await this.db.update(grants).set({ status: "revoked" }).where(eq(grants.id, live.id));
        live = undefined;
      }
      networks[id] = {
        setUp: isWalletSetUp(code),
        setupAt: setup[0]?.setupAt ?? null,
        usdcBalance: usdcBalance.toString(),
        eurcBalance: eurcBalance.toString(),
        allowance: live ? { id: live.id, receipt: live.receipt, expiresAt: live.expiresAt } : null,
      };
    }
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

  /** The everyday allowance: the network's default daily amount to our redeemer, any recipient. */
  async allowanceRequest(userId: string, network: NetworkId, periodAmount?: bigint) {
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
      token: context.addresses.usdc,
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

  /** An unsigned transaction that revokes the active allowance; the wallet signs it and sends it back. */
  async revokeRequest(userId: string, network: NetworkId) {
    const [active] = await this.db
      .select()
      .from(grants)
      .where(
        and(
          eq(grants.userId, userId),
          eq(grants.network, network),
          eq(grants.kind, "allowance"),
          eq(grants.status, "active"),
        ),
      )
      .orderBy(desc(grants.createdAt))
      .limit(1);
    if (!active) throw problem(HTTP.notFound, "not_found", "no active allowance");
    const { network: context } = this.clients(network);
    const call = encodeRevoke(context, active.delegation as never);
    return this.unsignedTransaction(userId, network, "revoke_allowance", call.to, call.data, REVOKE_GAS_LIMIT, {
      grantId: active.id,
    });
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
    this.pendingTransactions.set(id, { userId, network, kind, wallet: wallet.address, to, data, nonce });
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
    const matches =
      signer.toLowerCase() === pending.wallet.toLowerCase() &&
      parsed.to?.toLowerCase() === pending.to.toLowerCase() &&
      parsed.data === pending.data &&
      parsed.nonce === pending.nonce &&
      parsed.chainId === context.chainId &&
      (parsed.value ?? ZERO) === ZERO;
    if (!matches) throw problem(HTTP.unprocessable, "transaction_mismatch");
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
