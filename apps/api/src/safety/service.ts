// Wallet & limits, editable (cards/automate-safety.md "Stay in control"; X3, X7, X11, G8). Every change is classified
// by one pure function (`planLimitChange`): a tightening applies at once and is recorded; a loosening waits for the
// person's own signature — a step-up message for what Kawase enforces itself (the per-payment cap, the cooldown, the
// allowlist, the risk dial, practice, resuming), or a new on-chain grant for an allowance or a temporary raise, signed
// together with the revoke of the grant it replaces so the chain never holds both. Pause all is instant and
// server-side; the exit kit is pause → one transaction revoking every grant on this network → move the money out.
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { erc20Abi, getAddress, hashTypedData, isAddress, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import { DEFAULT_LIMITS, MS_PER_SECOND, SECONDS_PER_DAY } from "@kawase/config";
import type { ApiUser, LimitValue, SafetyChange, SafetyChangeResponse, SafetyView, TokenOption } from "@kawase/api-client";
import { contactAddresses, contactAddressTrust, contacts, grants, limitChanges, limits, safetySettings, tokenMetadata, userWalletSetup, users, walletTokens, type Db, type LimitChange } from "@kawase/db";
import { buildAllowanceGrant, describeGrant, grantTypedData, isWalletSetUp, withSignature } from "@kawase/integrations-delegation";
import type { Logger } from "@kawase/log";
import { CANONICAL_TOKENS, type NetworkId } from "@kawase/networks";
import { planLimitChange, type LimitSettings } from "@kawase/policy";

import { publicUser } from "../auth/routes";
import type { AuditWriter } from "../audit/writer";
import { HTTP, problem } from "../http/problem";
import { jsonSafe } from "../intents/chain";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { SignedRevoke, WalletService } from "../wallet/service";
import { activeGrantCounts, allowanceRoom, byToken, liveAllowanceGrants, type AllowanceGrant } from "./allowances";
import { allowlistEntries, safetySettingsOf } from "./settings";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ChangeRow = typeof limitChanges.$inferSelect;
type Via = "app" | "chat" | "voice";

const SALT_BYTES = 32;
/** A new everyday allowance lasts this long before the app asks for a fresh signature. */
const ALLOWANCE_TTL_DAYS = 90;
/** A loosening waiting for its signature is good for this long. */
const CHANGE_TTL_S = 600;
const ZERO = 0n;
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
const STEP_UP_TYPES = {
  LimitChange: [
    { name: "id", type: "string" },
    { name: "network", type: "string" },
    { name: "change", type: "string" },
    { name: "expires", type: "uint256" },
  ],
} as const;
/** Token facts for the two tokens every network has, without a read. */
const KNOWN_DECIMALS = 6;

export class SafetyService {
  private readonly tokenMeta = new Map<string, { symbol: string; decimals: number }>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly audit: AuditWriter,
    private readonly log: Logger,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  /** Symbol and decimals of an ERC-20, read once; an address that is not one is refused. */
  private async meta(network: NetworkId, token: Address) {
    const key = `${network}:${token.toLowerCase()}`;
    const known = this.tokenMeta.get(key);
    if (known) return known;
    const { client, network: context } = this.clients(network);
    const canonical = CANONICAL_TOKENS[network].find((entry) => entry.address.toLowerCase() === token.toLowerCase());
    if (canonical) return { symbol: canonical.symbol, decimals: canonical.decimals };
    const [stored] = await this.db
      .select({ symbol: tokenMetadata.symbol, decimals: tokenMetadata.decimals })
      .from(tokenMetadata)
      .where(and(eq(tokenMetadata.chainId, context.chainId), eq(tokenMetadata.address, token.toLowerCase())));
    if (stored) return stored;
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ]).catch(() => {
      throw problem(HTTP.unprocessable, "token_invalid", "not an ERC-20 token on this network");
    });
    const found = { symbol, decimals };
    this.tokenMeta.set(key, found);
    return found;
  }

  private async person(userId: string): Promise<ApiUser> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    return publicUser(row!) as ApiUser;
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  async view(user: SessionUser): Promise<SafetyView> {
    const network = user.activeNetwork;
    const clients = this.clients(network);
    const wallet = await this.wallets.userWallet(user.id);
    const [settings, live, counts, entries, code] = await Promise.all([
      safetySettingsOf(this.db, user.id, network),
      liveAllowanceGrants(this.db, user.id, network),
      activeGrantCounts(this.db, user.id, network),
      allowlistEntries(this.db, user.id, network),
      wallet ? clients.client.getCode({ address: wallet.address as Address }).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    const allowances = await Promise.all(
      [...byToken(live).entries()].map(async ([token, allowance]) => {
        const [room, meta] = await Promise.all([allowanceRoom(clients, allowance), this.meta(network, token as Address).catch(() => ({ symbol: "?", decimals: KNOWN_DECIMALS }))]);
        const base = room.base?.grant;
        const boost = room.boost;
        return {
          token: getAddress(token),
          symbol: meta.symbol,
          decimals: meta.decimals,
          grantId: base?.id ?? boost!.grant.id,
          perDay: (base?.cap ?? ZERO).toString(),
          signedPerDay: (base?.signed ?? ZERO).toString(),
          leftToday: (room.base?.room ?? ZERO).toString(),
          expiresAt: (base ?? boost!.grant).expiresAt.toISOString(),
          boost: boost ? { grantId: boost.grant.id, extra: boost.grant.cap.toString(), until: boost.grant.expiresAt.toISOString(), leftToday: boost.room.toString() } : null,
        };
      }),
    );
    // USDC first, then by symbol: the list reads the same every time.
    allowances.sort((a, b) => Number(b.symbol === "USDC") - Number(a.symbol === "USDC") || a.symbol.localeCompare(b.symbol));
    return {
      network,
      walletAddress: wallet?.address ?? null,
      setUp: code ? isWalletSetUp(code) : false,
      pausedAt: settings.pausedAt?.toISOString() ?? null,
      riskMode: settings.riskMode,
      practice: settings.practice,
      allowances,
      perPayment: {
        value: settings.perPayment.value.toString(),
        default: settings.perPayment.default.toString(),
        temp: settings.perPayment.temp ? { value: settings.perPayment.temp.value.toString(), until: settings.perPayment.temp.until.toISOString() } : null,
      },
      cooldown: { seconds: settings.cooldown.seconds, cap: settings.cooldown.cap.toString() },
      allowlist: { only: settings.allowlistOnly, entries },
      grants: { allowance: counts.allowance ?? 0, automation: counts.automation ?? 0, marketplace: counts.marketplace ?? 0 },
    };
  }

  /**
   * Tokens an allowance can be added for (R1, every asset first-class): the network's canonical tokens, every token the
   * watcher found in the wallet, any token that already has one, and an address the person pastes (checked on chain to
   * be an ERC-20). Each with the wallet's balance; permissioned tokens (USYC) are display-only and left out.
   */
  async tokens(user: SessionUser, address?: string): Promise<{ tokens: TokenOption[] }> {
    const network = user.activeNetwork;
    const { client, network: context } = this.clients(network);
    const wallet = await this.wallets.userWallet(user.id);
    const live = byToken(await liveAllowanceGrants(this.db, user.id, network));
    const found = await this.db
      .select({ token: walletTokens.tokenAddress })
      .from(walletTokens)
      .where(and(eq(walletTokens.userId, user.id), eq(walletTokens.network, network), eq(walletTokens.chainId, context.chainId)));
    const canonical = CANONICAL_TOKENS[network].filter((entry) => entry.kind !== "permissioned" && entry.kind !== "position");
    const candidates = new Set<string>([...canonical.map((entry) => entry.address.toLowerCase()), ...found.map((row) => row.token.toLowerCase()), ...live.keys()]);
    if (address) {
      if (!isAddress(address, { strict: false })) throw problem(HTTP.unprocessable, "token_invalid");
      candidates.add(address.toLowerCase());
    }
    const tokens = await Promise.all(
      [...candidates].map(async (token): Promise<TokenOption | undefined> => {
        const meta = await this.meta(network, token as Address).catch(() => undefined);
        if (!meta) return undefined;
        const balance = wallet
          ? await client.readContract({ address: token as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address as Address] }).catch(() => ZERO)
          : ZERO;
        return { token: getAddress(token), symbol: meta.symbol, decimals: meta.decimals, balance: balance.toString(), hasAllowance: live.has(token) };
      }),
    );
    const usdc = context.addresses.usdc.toLowerCase();
    const asked = address?.toLowerCase();
    const listed = tokens.filter(
      (entry): entry is TokenOption =>
        entry !== undefined && (BigInt(entry.balance) > ZERO || entry.hasAllowance || entry.token.toLowerCase() === usdc || entry.token.toLowerCase() === asked),
    );
    return { tokens: listed.sort((a, b) => Number(BigInt(b.balance) > BigInt(a.balance)) - Number(BigInt(b.balance) < BigInt(a.balance))) };
  }

  private async settings(userId: string, network: NetworkId): Promise<LimitSettings & { live: AllowanceGrant[] }> {
    const [settings, live, entries] = await Promise.all([
      safetySettingsOf(this.db, userId, network),
      liveAllowanceGrants(this.db, userId, network),
      allowlistEntries(this.db, userId, network),
    ]);
    const allowances: LimitSettings["allowances"] = {};
    for (const [token, entry] of byToken(live)) if (entry.base) allowances[token] = { signed: entry.base.signed, cap: entry.base.cap };
    return {
      live,
      allowances,
      perPayment: settings.perPayment.value,
      cooldown: settings.cooldown,
      allowlistOnly: settings.allowlistOnly,
      allowlisted: new Set(entries.map((entry) => entry.contactId)),
      riskMode: settings.riskMode,
      practice: settings.practice,
      paused: Boolean(settings.pausedAt),
    };
  }

  // ── Changing ────────────────────────────────────────────────────────────────────────────────────────────────

  async change(user: SessionUser, change: SafetyChange, via: Via = "app"): Promise<SafetyChangeResponse> {
    const network = user.activeNetwork;
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in first");
    const current = await this.settings(user.id, network);
    if (change.kind === "allowlist") await this.ownContact(user.id, change.contactId);
    if (change.kind === "allowance" || change.kind === "allowance_off" || change.kind === "boost") await this.meta(network, change.token as Address);
    const plan = planLimitChange(current, change);
    const values = await this.values(user.id, network, change, current);
    if (plan.direction === "same") return { status: "unchanged", safety: await this.view(user), user: await this.person(user.id) };

    if (plan.direction === "tighten") {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(limitChanges)
          .values({ userId: user.id, network, change, direction: "tighten", status: "applied", before: values.before, after: values.after, requestedVia: via, appliedAt: new Date(), expiresAt: new Date() })
          .returning({ id: limitChanges.id });
        await this.apply(tx, user.id, network, change, current);
        return row!.id;
      });
      void this.audit.write({ userId: user.id, actor: via === "app" ? "user" : "agent", action: `limits.${change.kind}`, subjectType: "limit_change", subjectId: id, network, checks: { direction: "tighten" }, decision: "applied" });
      // Turning a token's allowance off: Kawase stopped using it now; the on-chain revoke is offered with it.
      const revoke = change.kind === "allowance_off" ? await this.revokeTokenGrants(user.id, network, change.token) : undefined;
      return { status: "applied", safety: await this.view(user), user: await this.person(user.id), ...(revoke !== undefined ? { revoke } : {}) };
    }

    // A loosening: what the wallet signs.
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const clients = this.clients(network);
    const expiresAt = new Date(Date.now() + CHANGE_TTL_S * MS_PER_SECOND);

    if (plan.approval === "grant") {
      if (!isWalletSetUp(await clients.client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
      const token = getAddress((change as { token: string }).token);
      const replaced = change.kind === "allowance" ? byToken(current.live).get(token.toLowerCase())?.base : undefined;
      // Every everyday allowance for this token the chain still honours (the current one, and any set aside here but never
      // revoked on chain) is revoked in the same yes as the new grant.
      const replacing = change.kind === "allowance" ? await this.wallets.unrevokedGrantIds(user.id, network, { kind: "allowance", token, boost: false }) : [];
      const startsAt = nowSeconds();
      const isBoost = change.kind === "boost";
      const until = isBoost ? Math.floor(Date.parse(change.until) / MS_PER_SECOND) : startsAt + ALLOWANCE_TTL_DAYS * SECONDS_PER_DAY;
      const amount = BigInt(isBoost ? change.extra : (change as { perDay: string }).perDay);
      // A raise is one period that lasts until it ends; an everyday allowance is per day.
      const periodSeconds = isBoost ? until - startsAt : SECONDS_PER_DAY;
      const grant = buildAllowanceGrant({ network: clients.network, wallet: wallet.address as Address, redeemer: clients.ops.address, token, amountPerPeriod: amount, periodSeconds, startsAt, expiresAt: until, salt: salt() });
      const typedData = grantTypedData(clients.network, grant);
      const receipt = describeGrant(clients.network, grant);
      const [row] = await this.db
        .insert(grants)
        .values({
          userId: user.id,
          network,
          kind: "allowance",
          delegatorWalletId: wallet.id,
          delegateAddress: clients.ops.address,
          delegation: jsonSafe(grant),
          delegationHash: hashTypedData(typedData),
          receipt: jsonSafe(receipt),
          periodAmount: amount,
          periodSeconds,
          tokenAddress: token,
          boost: isBoost,
          startsAt: new Date(startsAt * MS_PER_SECOND),
          expiresAt: new Date(until * MS_PER_SECOND),
          status: "pending",
        })
        .returning({ id: grants.id });
      const [pending] = await this.db
        .insert(limitChanges)
        .values({ userId: user.id, network, change, direction: "loosen", before: values.before, after: values.after, grantId: row!.id, replacesGrantId: replaced?.id ?? null, requestedVia: via, expiresAt })
        .returning();
      // The grant it replaces is revoked in the same yes, so the chain never allows both.
      const revoke = await this.wallets.revokeGrantsRequest(user.id, replacing);
      return {
        status: "needs_approval",
        changeId: pending!.id,
        change,
        before: values.before,
        after: values.after,
        expiresAt: expiresAt.toISOString(),
        approval: { kind: "grant", typedData: jsonSafe(typedData), receipt: jsonSafe(receipt), revoke },
      };
    }

    const id = randomUUIDv4();
    const typedData = {
      domain: { name: "Kawase", version: "1", chainId: clients.network.chainId },
      types: STEP_UP_TYPES,
      primaryType: "LimitChange",
      message: { id, network, change: JSON.stringify(change), expires: Math.floor(expiresAt.getTime() / MS_PER_SECOND) },
    } as const;
    await this.db.insert(limitChanges).values({ id, userId: user.id, network, change, direction: "loosen", before: values.before, after: values.after, typedData: jsonSafe(typedData), requestedVia: via, expiresAt });
    return { status: "needs_approval", changeId: id, change, before: values.before, after: values.after, expiresAt: expiresAt.toISOString(), approval: { kind: "message", typedData: jsonSafe(typedData) } };
  }

  /**
   * The wallet signed a loosening: the signature is checked against the wallet, then the change applies. A new allowance
   * that replaces one goes on only after the old one is off on chain (`revoke`, signed in the same yes).
   */
  async approve(user: SessionUser, changeId: string, signature: Hex, revoke?: SignedRevoke): Promise<SafetyChangeResponse> {
    const [row] = await this.db.select().from(limitChanges).where(and(eq(limitChanges.id, changeId), eq(limitChanges.userId, user.id)));
    if (!row || row.status !== "pending") throw problem(HTTP.conflict, "change_not_pending");
    if (row.expiresAt.getTime() < Date.now()) {
      await this.db.update(limitChanges).set({ status: "expired" }).where(eq(limitChanges.id, row.id));
      throw problem(HTTP.conflict, "change_not_pending", "the change expired; ask again");
    }
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const clients = this.clients(row.network);
    const change = row.change;

    if (row.grantId) {
      const [pending] = await this.db.select().from(grants).where(and(eq(grants.id, row.grantId), eq(grants.userId, user.id)));
      if (!pending || pending.status !== "pending") throw problem(HTTP.unprocessable, "grant_not_pending");
      const signed = withSignature(pending.delegation as never, signature);
      const typedData = grantTypedData(clients.network, signed) as TypedDataDefinition;
      const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature }).catch(() => false);
      if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
      if (change.kind === "allowance")
        await this.wallets.revokeFirst(user.id, await this.wallets.unrevokedGrantIds(user.id, row.network, { kind: "allowance", token: change.token, boost: false }), revoke);
      await this.db.transaction(async (tx) => {
        if (row.replacesGrantId) await tx.update(grants).set({ status: "superseded" }).where(and(eq(grants.id, row.replacesGrantId), eq(grants.userId, user.id), eq(grants.status, "active")));
        await tx.update(grants).set({ status: "active", delegation: jsonSafe(signed) }).where(eq(grants.id, pending.id));
        if (!pending.boost && pending.tokenAddress?.toLowerCase() === clients.network.addresses.usdc.toLowerCase())
          await tx.update(userWalletSetup).set({ allowanceGrantId: pending.id }).where(and(eq(userWalletSetup.userId, user.id), eq(userWalletSetup.network, row.network)));
        // One rule (X3): the everyday ceiling on every send is never below an allowance the person signed.
        await this.raiseCeiling(tx, user.id, row.network, pending.periodAmount);
        await tx.update(limitChanges).set({ status: "applied", appliedAt: new Date() }).where(eq(limitChanges.id, row.id));
      });
    } else {
      const typedData = row.typedData as unknown as TypedDataDefinition;
      const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature }).catch(() => false);
      if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
      const current = await this.settings(user.id, row.network);
      await this.db.transaction(async (tx) => {
        await this.apply(tx, user.id, row.network, change, current);
        await tx.update(limitChanges).set({ status: "applied", appliedAt: new Date() }).where(eq(limitChanges.id, row.id));
      });
    }
    void this.audit.write({ userId: user.id, actor: "user", action: `limits.${change.kind}`, subjectType: "limit_change", subjectId: row.id, network: row.network, checks: { direction: "loosen", signedBy: wallet.address }, decision: "applied" });
    this.log.info({ changeId: row.id, kind: change.kind }, "limit loosened with the wallet's signature");
    return { status: "applied", safety: await this.view({ ...user, activeNetwork: row.network }), user: await this.person(user.id) };
  }

  /**
   * The exit kit's first two steps (cards/automate-safety.md): pause everything now, then one transaction (one Face
   * ID) that revokes every grant still on here. Moving the money out is the person's next step (Withdraw or Send).
   */
  async exitKit(user: SessionUser) {
    const network = user.activeNetwork;
    const [person] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, user.id));
    if (!person?.pausedAllAt) {
      await this.db.transaction(async (tx) => {
        await tx.insert(limitChanges).values({ userId: user.id, network, change: { kind: "pause", on: true }, direction: "tighten", status: "applied", requestedVia: "app", appliedAt: new Date(), expiresAt: new Date() });
        await tx.update(users).set({ pausedAllAt: new Date() }).where(eq(users.id, user.id));
      });
      void this.audit.write({ userId: user.id, actor: "user", action: "limits.pause", network, decision: "applied" });
    }
    // Every grant the chain still honours, whatever its status here (one set aside but never revoked on chain included).
    const live = await this.wallets.unrevokedGrantIds(user.id, network);
    const revoke = await this.wallets.revokeGrantsRequest(user.id, live);
    void this.audit.write({ userId: user.id, actor: "user", action: "limits.exit_kit", network, checks: { grants: revoke?.grantIds?.length ?? 0 }, decision: revoke ? "revoke_offered" : "nothing_to_revoke" });
    return { safety: await this.view(user), user: await this.person(user.id), revoke };
  }

  // ── Applying ────────────────────────────────────────────────────────────────────────────────────────────────

  private async apply(tx: Tx, userId: string, network: NetworkId, change: LimitChange, current: LimitSettings & { live: AllowanceGrant[] }) {
    const upsertLimit = async (kind: "per_tx" | "new_recipient_cooldown_s" | "new_recipient_cap", set: { value?: bigint; tempValue?: bigint | null; tempUntil?: Date | null }) => {
      const value = set.value ?? (kind === "per_tx" ? current.perPayment : ZERO);
      await tx
        .insert(limits)
        .values({ userId, network, kind, value, tempValue: set.tempValue ?? null, tempUntil: set.tempUntil ?? null })
        .onConflictDoUpdate({ target: [limits.userId, limits.network, limits.kind], set });
    };
    switch (change.kind) {
      case "allowance": {
        const base = byToken(current.live).get(change.token.toLowerCase())?.base;
        if (!base) return;
        const perDay = BigInt(change.perDay);
        await tx.update(grants).set({ policyCap: perDay >= base.signed ? null : perDay }).where(eq(grants.id, base.id));
        return;
      }
      case "allowance_off": {
        const entry = byToken(current.live).get(change.token.toLowerCase());
        const ids = [entry?.base?.id, entry?.boost?.id].filter((id): id is string => Boolean(id));
        if (ids.length > 0) await tx.update(grants).set({ policyCap: ZERO }).where(inArray(grants.id, ids));
        return;
      }
      case "boost":
        return;
      case "per_payment":
        await upsertLimit("per_tx", { value: BigInt(change.value) });
        return;
      case "per_payment_temp":
        await upsertLimit("per_tx", { tempValue: BigInt(change.value), tempUntil: new Date(change.until) });
        return;
      case "cooldown":
        await upsertLimit("new_recipient_cooldown_s", { value: BigInt(change.seconds) });
        await upsertLimit("new_recipient_cap", { value: BigInt(change.cap) });
        return;
      case "allowlist_only":
        await tx
          .insert(safetySettings)
          .values({ userId, network, allowlistOnly: change.on })
          .onConflictDoUpdate({ target: [safetySettings.userId, safetySettings.network], set: { allowlistOnly: change.on } });
        return;
      case "allowlist": {
        const addresses = await tx
          .select({ id: contactAddresses.id })
          .from(contactAddresses)
          .where(and(eq(contactAddresses.contactId, change.contactId), eq(contactAddresses.userId, userId), eq(contactAddresses.status, "active")));
        for (const address of addresses)
          await tx
            .insert(contactAddressTrust)
            .values({ contactAddressId: address.id, userId, network, allowlistedAt: change.on ? new Date() : null })
            .onConflictDoUpdate({ target: [contactAddressTrust.contactAddressId, contactAddressTrust.network], set: { allowlistedAt: change.on ? new Date() : null } });
        return;
      }
      case "risk_mode":
        await tx.update(users).set({ riskMode: change.mode }).where(eq(users.id, userId));
        return;
      case "practice":
        await tx.update(users).set({ practiceMode: change.on }).where(eq(users.id, userId));
        return;
      case "pause":
        await tx.update(users).set({ pausedAllAt: change.on ? new Date() : null }).where(eq(users.id, userId));
        return;
    }
  }

  /** The everyday ceiling on sends (limits.daily) follows a larger signed allowance up, never down. */
  private async raiseCeiling(tx: Tx, userId: string, network: NetworkId, perDay: bigint) {
    const [row] = await tx.select().from(limits).where(and(eq(limits.userId, userId), eq(limits.network, network), eq(limits.kind, "daily")));
    const daily = row?.value ?? DEFAULT_LIMITS[network].daily;
    if (perDay <= daily) return;
    await tx
      .insert(limits)
      .values({ userId, network, kind: "daily", value: perDay })
      .onConflictDoUpdate({ target: [limits.userId, limits.network, limits.kind], set: { value: perDay } });
  }

  /** Every allowance for this token the chain still honours (the everyday one and any raise). */
  private async revokeTokenGrants(userId: string, network: NetworkId, token: string) {
    return this.wallets.revokeGrantsRequest(userId, await this.wallets.unrevokedGrantIds(userId, network, { kind: "allowance", token }));
  }

  private async ownContact(userId: string, contactId: string) {
    const [row] = await this.db.select({ id: contacts.id, name: contacts.displayName }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such contact");
    return row;
  }

  /** Now → After, in display parts. */
  private async values(userId: string, network: NetworkId, change: LimitChange, current: LimitSettings): Promise<{ before: LimitValue; after: LimitValue }> {
    const usdc = { decimals: KNOWN_DECIMALS, symbol: "USDC" };
    switch (change.kind) {
      case "allowance":
      case "allowance_off":
      case "boost": {
        const meta = await this.meta(network, change.token as Address);
        const now = current.allowances[change.token.toLowerCase()];
        const before = { amount: (now?.cap ?? ZERO).toString(), ...meta };
        if (change.kind === "allowance") return { before, after: { amount: change.perDay, ...meta } };
        if (change.kind === "allowance_off") return { before, after: { amount: "0", ...meta } };
        return { before, after: { amount: ((now?.cap ?? ZERO) + BigInt(change.extra)).toString(), until: change.until, ...meta } };
      }
      case "per_payment":
        return { before: { amount: current.perPayment.toString(), ...usdc }, after: { amount: change.value, ...usdc } };
      case "per_payment_temp":
        return { before: { amount: current.perPayment.toString(), ...usdc }, after: { amount: change.value, until: change.until, ...usdc } };
      case "cooldown":
        return { before: { seconds: current.cooldown.seconds, amount: current.cooldown.cap.toString(), ...usdc }, after: { seconds: change.seconds, amount: change.cap, ...usdc } };
      case "allowlist_only":
        return { before: { on: current.allowlistOnly }, after: { on: change.on } };
      case "allowlist": {
        const contact = await this.ownContact(userId, change.contactId);
        return { before: { on: current.allowlisted.has(change.contactId), name: contact.name }, after: { on: change.on, name: contact.name } };
      }
      case "risk_mode":
        return { before: { mode: current.riskMode }, after: { mode: change.mode } };
      case "practice":
        return { before: { on: current.practice }, after: { on: change.on } };
      case "pause":
        return { before: { on: current.paused }, after: { on: change.on } };
    }
  }
}

/** Change ids double as the step-up message's id, so a signature can only ever approve its own change. */
function randomUUIDv4(): string {
  return globalThis.crypto.randomUUID();
}

export type { ChangeRow };
