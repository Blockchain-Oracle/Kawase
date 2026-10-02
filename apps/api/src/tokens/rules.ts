// Token rules (D12; cards/automate-safety.md "Token rules", trade.md): per person and network, what buys of tokens
// Kawase does not vouch for may be — the access level, the per-trade and per-day caps for unverified tokens, and the
// highest price impact a non-stable swap may take. Copycats and high-risk tokens stay blocked whatever these say.
// Every buy reads them (screen, chat, voice, automations: the swap engine is the one place). Tightening applies at
// once; a loosening returns a step-up message (EIP-712) the wallet signs after Face ID, checked here against the
// person's wallet before it applies — the same yes as Wallet & limits (X7).
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import type { TokenRulesChange, TokenRulesChangeResponse, TokenRulesValuesView, TokenRulesView } from "@kawase/api-client";
import { MS_PER_SECOND, TOKEN_RULE_CHOICES, TOKEN_RULES, TOKEN_RULES_CHANGE_TTL_S } from "@kawase/config";
import { tokenRules, type Db, type TokenRulesValues } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import type { AuditWriter } from "../audit/writer";
import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

export const DEFAULT_TOKEN_RULES: TokenRulesValues = {
  access: "warned",
  unverifiedPerTradeUsd: TOKEN_RULES.unverifiedPerTradeUsd,
  unverifiedPerDayUsd: TOKEN_RULES.unverifiedPerDayUsd,
  maxPriceImpactBps: TOKEN_RULES.maxPriceImpactBps,
};

const STEP_UP_TYPES = {
  TokenRules: [
    { name: "id", type: "string" },
    { name: "network", type: "string" },
    { name: "access", type: "string" },
    { name: "unverifiedPerTradeUsd", type: "uint256" },
    { name: "unverifiedPerDayUsd", type: "uint256" },
    { name: "maxPriceImpactBps", type: "uint256" },
    { name: "expires", type: "uint256" },
  ],
} as const;

/** The rules in force for one person on one network (the defaults until they change one). */
export async function tokenRulesOf(db: Db, userId: string, network: NetworkId): Promise<TokenRulesValues> {
  const [row] = await db.select().from(tokenRules).where(and(eq(tokenRules.userId, userId), eq(tokenRules.network, network)));
  if (!row) return DEFAULT_TOKEN_RULES;
  return { access: row.access, unverifiedPerTradeUsd: row.unverifiedPerTradeUsd, unverifiedPerDayUsd: row.unverifiedPerDayUsd, maxPriceImpactBps: row.maxPriceImpactBps };
}

/** Each rule's own direction; the change as a whole loosens when any one rule does. */
export function tokenRulesDirection(current: TokenRulesValues, next: TokenRulesValues): "same" | "tighten" | "loosen" {
  const looser = [
    current.access === "verified" && next.access === "warned",
    next.unverifiedPerTradeUsd > current.unverifiedPerTradeUsd,
    next.unverifiedPerDayUsd > current.unverifiedPerDayUsd,
    next.maxPriceImpactBps > current.maxPriceImpactBps,
  ].some(Boolean);
  if (looser) return "loosen";
  const same =
    current.access === next.access &&
    current.unverifiedPerTradeUsd === next.unverifiedPerTradeUsd &&
    current.unverifiedPerDayUsd === next.unverifiedPerDayUsd &&
    current.maxPriceImpactBps === next.maxPriceImpactBps;
  return same ? "same" : "tighten";
}

const allowed = (value: number, choices: readonly number[]) => choices.includes(value);

export class TokenRulesService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly audit: AuditWriter | undefined,
    /** What was bought today in unverified tokens (USD), for the daily cap's meter. */
    private readonly spentToday?: (userId: string, network: NetworkId) => Promise<number>,
  ) {}

  async view(user: SessionUser): Promise<TokenRulesView> {
    const network = user.activeNetwork;
    const [values, spent] = await Promise.all([tokenRulesOf(this.db, user.id, network), this.spentToday ? this.spentToday(user.id, network).catch(() => 0) : Promise.resolve(0)]);
    return {
      network,
      ...values,
      defaults: DEFAULT_TOKEN_RULES,
      choices: {
        unverifiedPerTradeUsd: [...TOKEN_RULE_CHOICES.unverifiedPerTradeUsd],
        unverifiedPerDayUsd: [...TOKEN_RULE_CHOICES.unverifiedPerDayUsd],
        maxPriceImpactBps: [...TOKEN_RULE_CHOICES.maxPriceImpactBps],
      },
      spentTodayUsd: spent,
    };
  }

  private async write(userId: string, network: NetworkId, values: TokenRulesValues) {
    await this.db
      .insert(tokenRules)
      .values({ userId, network, ...values, pending: null, pendingExpiresAt: null })
      .onConflictDoUpdate({ target: [tokenRules.userId, tokenRules.network], set: { ...values, pending: null, pendingExpiresAt: null } });
  }

  async change(user: SessionUser, change: TokenRulesChange, via: "app" | "chat" | "voice" = "app"): Promise<TokenRulesChangeResponse> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in first");
    const network = user.activeNetwork;
    const current = await tokenRulesOf(this.db, user.id, network);
    const next: TokenRulesValues = { ...current, ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)) };
    if (!allowed(next.unverifiedPerTradeUsd, TOKEN_RULE_CHOICES.unverifiedPerTradeUsd) || !allowed(next.unverifiedPerDayUsd, TOKEN_RULE_CHOICES.unverifiedPerDayUsd) || !allowed(next.maxPriceImpactBps, TOKEN_RULE_CHOICES.maxPriceImpactBps))
      throw problem(HTTP.unprocessable, "validation", "not one of the steps");
    const direction = tokenRulesDirection(current, next);
    if (direction === "same") return { status: "unchanged", rules: await this.view(user) };
    if (direction === "tighten") {
      await this.write(user.id, network, next);
      void this.audit?.write({ userId: user.id, actor: via === "app" ? "user" : "agent", action: "token_rules.change", subjectType: "token_rules", subjectId: user.id, network, checks: { direction }, decision: "applied" });
      return { status: "applied", rules: await this.view(user) };
    }

    // A loosening: the wallet signs the exact values asked, within ten minutes.
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_RULES_CHANGE_TTL_S * MS_PER_SECOND);
    const typedData = {
      domain: { name: "Kawase", version: "1", chainId: clients.network.chainId },
      types: STEP_UP_TYPES,
      primaryType: "TokenRules",
      message: { id, network, ...next, expires: Math.floor(expiresAt.getTime() / MS_PER_SECOND) },
    } as const;
    const pending = { id, values: next, typedData: JSON.parse(JSON.stringify(typedData)) as Record<string, unknown> };
    await this.db
      .insert(tokenRules)
      .values({ userId: user.id, network, ...current, pending, pendingExpiresAt: expiresAt })
      .onConflictDoUpdate({ target: [tokenRules.userId, tokenRules.network], set: { pending, pendingExpiresAt: expiresAt } });
    return { status: "needs_approval", changeId: id, before: current as TokenRulesValuesView, after: next as TokenRulesValuesView, expiresAt: expiresAt.toISOString(), typedData: pending.typedData as never };
  }

  async approve(user: SessionUser, changeId: string, signature: Hex): Promise<TokenRulesChangeResponse> {
    const network = user.activeNetwork;
    const [row] = await this.db.select().from(tokenRules).where(and(eq(tokenRules.userId, user.id), eq(tokenRules.network, network)));
    if (!row?.pending || row.pending.id !== changeId) throw problem(HTTP.conflict, "conflict", "no such change waiting");
    if (!row.pendingExpiresAt || row.pendingExpiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "conflict", "the change expired; ask again");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const typedData = row.pending.typedData as unknown as TypedDataDefinition;
    const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
    await this.write(user.id, network, row.pending.values);
    void this.audit?.write({ userId: user.id, actor: "user", action: "token_rules.change", subjectType: "token_rules", subjectId: user.id, network, checks: { direction: "loosen", signedBy: wallet.address }, decision: "applied" });
    return { status: "applied", rules: await this.view(user) };
  }
}
