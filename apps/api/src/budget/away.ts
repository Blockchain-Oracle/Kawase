// The away pack (D38): the standing grants signed in the same approval as the weekly budget, so Kawase can act inside
// it while the phone is closed. One per saved contact (USDC `transfer` only to them, capped a week), three per vault in
// the budget (approve, deposit and withdraw, the receiver pinned to the wallet), and a CCTP move to the wallet's own
// address. Built here in code (never by the model), checked again on the phone (@kawase/wallet `checkAwayPack`).
//
// The kill-switch nonce does the rotation: a new pack is signed for the wallet's NEXT nonce, and the same approval
// signs `incrementNonce`, which turns the old pack (and every leaf in flight) off and the new one on in one transaction.
// Revoke-all increments twice, so a pack signed for the next nonce but never rotated in can never come alive.
import { randomUUID } from "node:crypto";

import { hashDelegation } from "@metamask/smart-accounts-kit/utils";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";

import { contactAddresses, contacts, type Db } from "@kawase/db";
import { buildAwayPack, describeGrant, grantTypedData, readGrantNonce, type AwayPurpose } from "@kawase/integrations-delegation";
import type { NetworkId } from "@kawase/networks";
import { APP_KIT_BRIDGES, type BudgetPolicy } from "@kawase/wallet";

import { HTTP, problem } from "../http/problem";
import type { Chains } from "../wallet/chain";
import { budgetGrants } from "./schema";

/** How long a pack lives before the person signs a new one (re-signing the budget renews it). */
export const AWAY_PACK_DAYS = 30;
const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1000;
/** The most saved contacts one pack covers (newest first): one signature each, all under the one approval. */
export const AWAY_MAX_CONTACTS = 20;
/** CCTP's domain for Base (mainnet and Base Sepolia): the one destination a move to the wallet's own address goes to. */
const BASE_CCTP_DOMAIN = 6;
const ONE = 1n;
const NONE = 0n;
/** ERC20PeriodTransfer terms: token (20 bytes) then amount, period and start (32 each); in hex characters. */
const HEX_PREFIX = 2;
const TOKEN_HEX = 40;
const WORD_HEX = 64;
const PERIOD_WORDS = 3;
const PERIOD_TERMS_HEX = TOKEN_HEX + PERIOD_WORDS * WORD_HEX;

/** One grant of a proposed pack, as the phone receives it: what it is for, the typed data, the receipt decoded from it. */
export type AwayOffer = { purpose: AwayPurpose; subject: string; typedData: Record<string, unknown>; receipt: Record<string, unknown> };

export type AwayProposal = {
  proposalId: string;
  /** The nonce the pack is bound to: the wallet's current one plus one (it goes live when the rotation lands). */
  nonce: string;
  expiresAt: number;
  perContactPerWeek: string;
  offers: AwayOffer[];
};

/** What the budget screen says about the pack. */
export type AwaySummary = { state: "live" | "pending" | "none"; contacts: number; vaults: number; moves: number; perContactPerWeek: string | null; expiresAt: string | null };

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_, entry) => (typeof entry === "bigint" ? entry.toString() : entry))) as T;
/** A stored delegation as the kit takes it (its salt and signature are already hex). */
const revive = (stored: Record<string, unknown>): Delegation => stored as unknown as Delegation;

export class AwayPacks {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
  ) {}

  private clients(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  /** The person's saved contacts with a payable Arc address (active, not blocked, the contact not deleted), newest first. */
  async contactAddresses(userId: string): Promise<Address[]> {
    const rows = await this.db
      .select({ address: contactAddresses.address })
      .from(contactAddresses)
      .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
      .where(and(eq(contactAddresses.userId, userId), eq(contactAddresses.chainKey, "arc"), eq(contactAddresses.status, "active"), eq(contactAddresses.isPreferred, true), isNull(contacts.deletedAt)))
      .orderBy(desc(contactAddresses.createdAt));
    const seen = new Set<string>();
    const out: Address[] = [];
    for (const row of rows) {
      const key = row.address.toLowerCase();
      if (seen.has(key) || !/^0x[0-9a-fA-F]{40}$/.test(row.address)) continue;
      seen.add(key);
      out.push(getAddress(row.address));
      if (out.length === AWAY_MAX_CONTACTS) break;
    }
    return out;
  }

  /**
   * A new pack for these terms, stored as proposed: every grant for the wallet's next nonce. The per-contact cap is the
   * budget's per-action cap (a week), sends only when the budget covers them; vaults are the budget's vault venues;
   * the CCTP move to the wallet's own address only when the budget covers moves.
   */
  async propose(userId: string, network: NetworkId, policy: BudgetPolicy): Promise<AwayProposal> {
    const clients = this.clients(network);
    const { client, network: context, ops } = clients;
    const current = await readGrantNonce(client, context, policy.wallet);
    const nonce = current + ONE;
    const now = Math.floor(Date.now() / MS_PER_SECOND);
    const expiresAt = now + AWAY_PACK_DAYS * SECONDS_PER_DAY;
    const sends = policy.categories.includes("send") && policy.perActionCap > NONE;
    const vaults = policy.categories.includes("earn") ? policy.venues.filter((venue) => /^0x[0-9a-f]{40}$/.test(venue)).map((venue) => getAddress(venue)) : [];
    const bridge = APP_KIT_BRIDGES[context.chainId];
    const moves = policy.categories.includes("bridge") && policy.venues.includes("cctp") && bridge !== undefined;
    const pack = buildAwayPack({
      network: context,
      wallet: policy.wallet,
      ops: ops.address,
      nonce,
      now,
      expiresAt,
      usdc: context.addresses.usdc,
      contacts: sends ? await this.contactAddresses(userId) : [],
      perContactPerWeek: policy.perActionCap,
      vaults,
      bridge: moves ? { contract: bridge!, domains: [BASE_CCTP_DOMAIN] } : undefined,
    });
    const proposalId = randomUUID();
    if (pack.length > 0)
      await this.db.insert(budgetGrants).values(
        pack.map((entry) => ({
          userId,
          network,
          proposalId,
          purpose: entry.purpose,
          subject: entry.subject.toLowerCase(),
          delegation: json(entry.grant) as unknown as Record<string, unknown>,
          delegationHash: hashDelegation(entry.grant),
          nonce,
          expiresAt: new Date(expiresAt * MS_PER_SECOND),
        })),
      );
    return {
      proposalId,
      nonce: nonce.toString(),
      expiresAt,
      perContactPerWeek: policy.perActionCap.toString(),
      offers: pack.map((entry) => json({ purpose: entry.purpose, subject: entry.subject, typedData: grantTypedData(context, entry.grant) as unknown as Record<string, unknown>, receipt: describeGrant(context, entry.grant) as unknown as Record<string, unknown> })),
    };
  }

  /**
   * The wallet signed the pack: one signature per grant, each named by the grant's own salt (unique per grant), each
   * over exactly the stored grant. All or nothing: a pack with one grant unsigned or signed by anyone else is refused.
   */
  async sign(userId: string, network: NetworkId, wallet: Address, proposalId: string, signed: readonly { salt: string; signature: Hex }[], budgetId: string) {
    const { network: context } = this.clients(network);
    const rows = await this.db
      .select()
      .from(budgetGrants)
      .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), eq(budgetGrants.proposalId, proposalId), eq(budgetGrants.status, "proposed")));
    if (rows.length !== signed.length) throw problem(HTTP.unprocessable, "signature_mismatch", "one signature per grant of the pack");
    const bySalt = new Map(signed.map((entry) => [BigInt(entry.salt).toString(), entry.signature]));
    const signatures: Hex[] = [];
    for (const row of rows) {
      const grant = revive(row.delegation);
      const signature = bySalt.get(BigInt(grant.salt).toString());
      const signer = signature ? await recoverTypedDataAddress({ ...grantTypedData(context, grant), signature } as never).catch(() => undefined) : undefined;
      if (!signer || signer.toLowerCase() !== wallet.toLowerCase()) throw problem(HTTP.unprocessable, "signature_mismatch", "a grant of the pack was not signed by this wallet");
      signatures.push(signature!);
    }
    await this.db.transaction(async (tx) => {
      for (const [index, row] of rows.entries())
        await tx
          .update(budgetGrants)
          .set({ status: "signed", budgetId, delegation: { ...row.delegation, signature: signatures[index]! } })
          .where(eq(budgetGrants.id, row.id));
    });
    return rows.length;
  }

  /**
   * After the rotation: the pack whose nonce is now the wallet's own goes live, every older one is superseded. Read
   * from the chain, so a rotation whose answer was lost settles the next time anyone looks.
   */
  async settle(userId: string, network: NetworkId, wallet: Address) {
    const { client, network: context } = this.clients(network);
    const nonce = await readGrantNonce(client, context, wallet);
    await this.db.transaction(async (tx) => {
      await tx
        .update(budgetGrants)
        .set({ status: "active" })
        .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), eq(budgetGrants.status, "signed"), sql`${budgetGrants.nonce} = ${nonce.toString()}`));
      await tx
        .update(budgetGrants)
        .set({ status: "superseded" })
        .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), inArray(budgetGrants.status, ["active", "signed", "proposed"]), sql`${budgetGrants.nonce} < ${nonce.toString()}`));
    });
    return nonce;
  }

  /** The kill-switch landed: nothing in any pack can come alive again. */
  async revokeAll(userId: string, network: NetworkId) {
    await this.db
      .update(budgetGrants)
      .set({ status: "revoked" })
      .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), inArray(budgetGrants.status, ["active", "signed", "proposed"])));
  }

  async summary(userId: string, network: NetworkId): Promise<AwaySummary> {
    const rows = await this.db
      .select({ purpose: budgetGrants.purpose, status: budgetGrants.status, delegation: budgetGrants.delegation, expiresAt: budgetGrants.expiresAt, proposalId: budgetGrants.proposalId })
      .from(budgetGrants)
      .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), inArray(budgetGrants.status, ["active", "signed"])))
      .orderBy(desc(budgetGrants.createdAt));
    const live = rows.filter((row) => row.status === "active");
    const shown = live.length > 0 ? live : rows.filter((row) => row.proposalId === rows[0]?.proposalId);
    if (shown.length === 0) return { state: "none", contacts: 0, vaults: 0, moves: 0, perContactPerWeek: null, expiresAt: null };
    const send = shown.find((row) => row.purpose === "contact_send");
    const cap = send ? describeCap(send.delegation) : null;
    return {
      state: live.length > 0 ? "live" : "pending",
      contacts: shown.filter((row) => row.purpose === "contact_send").length,
      vaults: shown.filter((row) => row.purpose === "vault_deposit").length,
      moves: shown.filter((row) => row.purpose === "bridge_burn").length,
      perContactPerWeek: cap,
      expiresAt: shown[0]!.expiresAt.toISOString(),
    };
  }

  /**
   * The live send grant for one saved contact, signed, for the ops wallet to redeem (`encodeRedeemTransfer`). The send
   * service uses it in place of the retired any-recipient allowance (the hookup is the lead's: see the lane notes).
   */
  async contactGrant(userId: string, network: NetworkId, recipient: Address): Promise<Delegation | undefined> {
    const [row] = await this.db
      .select({ delegation: budgetGrants.delegation })
      .from(budgetGrants)
      .where(and(eq(budgetGrants.userId, userId), eq(budgetGrants.network, network), eq(budgetGrants.status, "active"), eq(budgetGrants.purpose, "contact_send"), eq(budgetGrants.subject, recipient.toLowerCase())))
      .orderBy(desc(budgetGrants.createdAt))
      .limit(1);
    return row ? revive(row.delegation) : undefined;
  }
}

/** The weekly cap a stored send grant carries (its ERC20PeriodTransfer terms), as base units. */
function describeCap(stored: Record<string, unknown>): string | null {
  const caveats = (stored.caveats ?? []) as { terms?: string }[];
  const period = caveats.find((caveat) => typeof caveat.terms === "string" && caveat.terms.length === HEX_PREFIX + PERIOD_TERMS_HEX);
  if (!period?.terms) return null;
  const amountAt = HEX_PREFIX + TOKEN_HEX;
  return BigInt(`0x${period.terms.slice(amountAt, amountAt + WORD_HEX)}`).toString();
}
