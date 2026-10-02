// The data behind the extra generative cards (A5): a price or portfolio chart, why a route / venue / vault was chosen
// (from the draft the person is looking at, never re-asked), and a setting's "now → after". Everything comes from the
// services that made the original numbers, so a card never shows a figure the rest of Kawase would not.
import { and, desc, eq } from "drizzle-orm";

import type { ChartOutput, ChartRangeId, DecisionOption, DecisionView, SettingDiff, SettingId } from "@kawase/api-client";
import { LANGUAGE_NAMES, type CatalogLocale } from "@kawase/i18n";
import { SUPPORTED_LOCALES } from "@kawase/config";
import { intents, type Db } from "@kawase/db";
import { amount, formatAmount } from "@kawase/money";
import { formatUnits } from "viem";

import type { BridgeService } from "../bridge/service";
import type { EarnService } from "../earn/service";
import type { MemoryService } from "../memory/service";
import type { SwapService } from "../swap/service";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";

const DISPLAY_LOCALE = "en";
/** Candle times below this are seconds, not milliseconds. */
const SECONDS_BEFORE = 1e12;
const RANGE_MS: Record<ChartRangeId, number> = { "1D": 86_400_000, "1W": 604_800_000, "1M": 2_592_000_000, "1Y": 31_536_000_000 };
const PERCENT = 100;
const DIGITS = 2;
/** A line needs two points. */
const MIN_POINTS = 2;
const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const USDC_DECIMALS = 6;
const ZERO = 0n;

const usdc = (baseUnits: string) => formatAmount(amount("USDC", BigInt(baseUnits)), DISPLAY_LOCALE);
const change = (first: number, last: number) => (first > 0 ? ((last - first) / first) * PERCENT : null);

/** The person's total over the range (the balance chart's snapshots), or a token's price (its pool's candles). */
export async function chartFor(
  assets: AssetService,
  user: SessionUser,
  input: { token?: string | undefined; range: ChartRangeId },
): Promise<ChartOutput> {
  const network = user.activeNetwork;
  const { range } = input;
  if (!input.token) {
    const portfolio = await assets.portfolio(user);
    const since = Date.now() - RANGE_MS[range];
    const all = portfolio.history.map((point) => ({ t: new Date(point.t).getTime(), v: point.usd }));
    // A young history: everything Kawase has, as the balance chart on Home does.
    const inRange = all.filter((point) => point.t >= since);
    const points = inRange.length >= MIN_POINTS ? inRange : all;
    if (points.length < MIN_POINTS) return { status: "empty", kind: "portfolio", title: "Portfolio", network, range };
    return { status: "ready", kind: "portfolio", network, range, title: "Portfolio", points, last: points.at(-1)!.v, changePct: change(points[0]!.v, points.at(-1)!.v) };
  }
  const query = input.token.trim();
  const address = /^0x[0-9a-fA-F]{40}$/.test(query) ? query : (await assets.search(user, network, query))[0]?.token.address;
  if (!address) return { status: "not_found", query, network };
  const detail = await assets.token(user, network, address);
  const candles = await assets.chart(network, address, range);
  const points = candles.map((candle) => ({ t: candle.t < SECONDS_BEFORE ? candle.t * MS_PER_SECOND : candle.t, v: candle.c }));
  const token = { chainId: detail.token.chainId, address: detail.token.address, symbol: detail.token.symbol, name: detail.token.name, logoUrl: detail.token.logoUrl };
  if (points.length < MIN_POINTS) return { status: "empty", kind: "token", title: detail.token.symbol, network, range };
  return { status: "ready", kind: "token", network, range, title: detail.token.symbol, token, points, last: points.at(-1)!.v, changePct: change(points[0]!.v, points.at(-1)!.v) };
}

const minutes = (seconds: number | null | undefined) => (seconds ? `~${Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE))} min` : null);

/** Why the latest bridge, swap or vault in this conversation (or else the person's latest) was chosen. */
export async function decisionFor(
  services: { db: Db; swaps: SwapService; bridges: BridgeService; earn: EarnService },
  user: SessionUser,
  threadId: string,
  about: "bridge" | "swap" | "earn",
): Promise<DecisionView> {
  const network = user.activeNetwork;
  const latest = async (inThread: boolean) =>
    (
      await services.db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.userId, user.id), eq(intents.network, network), eq(intents.kind, about), ...(inThread ? [eq(intents.threadId, threadId)] : [])))
        .orderBy(desc(intents.createdAt))
        .limit(1)
    )[0];
  const found = (await latest(true)) ?? (await latest(false));
  if (!found) return { status: "none", about, network };

  if (about === "bridge") {
    const intent = await services.bridges.view(user.id, found.id);
    const draft = intent.draft;
    if (!draft) return { status: "none", about, network };
    const options: DecisionOption[] = draft.routes.map((route) => ({
      name: route.provider,
      status: route.status,
      value: route.received ? usdc(route.received) : null,
      fee: route.extraCost && BigInt(route.extraCost) > ZERO ? usdc(route.extraCost) : null,
      eta: minutes(route.etaSeconds),
      reason: route.status === "chosen" ? null : (route.reason ?? "lower_out"),
    }));
    return { status: "ready", about, network, subject: `${usdc(draft.amount)} → ${draft.destination}`, basis: "most_received", options, quotedAt: draft.quotedAt };
  }

  if (about === "swap") {
    const intent = await services.swaps.view(user.id, found.id);
    const draft = intent.draft;
    if (!draft) return { status: "none", about, network };
    const decimals = draft.tokens?.out.decimals ?? USDC_DECIMALS;
    const out = (baseUnits: string | null) => (baseUnits ? `${Number(formatUnits(BigInt(baseUnits), decimals)).toFixed(DIGITS)} ${draft.tokenOut}` : null);
    const routes = draft.routes?.length
      ? draft.routes
      : [{ venue: draft.provider, label: draft.provider, status: "chosen" as const, estimatedOut: draft.estimatedOut, minOut: draft.minOut, via: [], feeUsd: null, reason: null }];
    const options: DecisionOption[] = routes.map((route) => ({
      name: route.label,
      status: route.status,
      value: out(route.estimatedOut),
      fee: route.feeUsd !== null ? `$${route.feeUsd.toFixed(DIGITS)}` : null,
      eta: null,
      reason: route.status === "chosen" ? null : (route.reason ?? "lower_out"),
    }));
    const amountIn = draft.tokens ? Number(formatUnits(BigInt(draft.amountIn), draft.tokens.in.decimals)).toFixed(DIGITS) : usdc(draft.amountIn);
    return { status: "ready", about, network, subject: `${amountIn} ${draft.tokens ? draft.tokenIn : ""} → ${draft.tokenOut}`.replace(/\s+/g, " "), basis: "most_received", options, quotedAt: draft.quotedAt };
  }

  const intent = await services.earn.view(user.id, found.id);
  const draft = intent.draft;
  if (!draft) return { status: "none", about, network };
  const { vaults } = await services.earn.overview(user);
  const options: DecisionOption[] = vaults.map((vault) => {
    const chosen = vault.address.toLowerCase() === draft.vault.address.toLowerCase();
    const active = /active/i.test(vault.status);
    return {
      name: vault.name,
      status: chosen ? "chosen" : active ? "quoted" : "unavailable",
      value: `${(vault.apy * PERCENT).toFixed(DIGITS)}% a year`,
      fee: null,
      eta: `${vault.available} USDC withdrawable now`,
      reason: chosen ? null : active ? "lower_yield" : "not_active",
    };
  });
  if (!options.some((option) => option.status === "chosen"))
    options.unshift({ name: draft.vault.name, status: "chosen", value: `${(draft.vault.apy * PERCENT).toFixed(DIGITS)}% a year`, fee: null, eta: null, reason: null });
  return { status: "ready", about, network, subject: `${draft.action === "deposit" ? "Deposit" : "Withdraw"} ${usdc(draft.amount)}`, basis: "highest_yield", options, quotedAt: draft.quotedAt };
}

const THEMES = ["system", "dark", "light"] as const;

/** A preference now and as asked; nothing changes until the person taps Apply on the card. */
export async function settingDiff(memory: MemoryService, user: SessionUser, setting: SettingId, value: string, reason: string | null): Promise<SettingDiff> {
  if (setting === "memory") {
    if (user.isAnonymous) return { status: "needs_sign_in", setting };
    const now = (await memory.enabled(user.id)) ? "on" : "off";
    const after = /^(on|true|yes|enable)/i.test(value) ? "on" : "off";
    return now === after ? { status: "unchanged", setting, now } : { status: "proposed", setting, now, after, reason };
  }
  if (setting === "theme") {
    const after = THEMES.find((theme) => value.toLowerCase().includes(theme)) ?? "system";
    return user.theme === after ? { status: "unchanged", setting, now: user.theme } : { status: "proposed", setting, now: user.theme, after, reason };
  }
  // The language replies come in: a supported locale code, or "same" (the app's language).
  const wanted = value.trim().toLowerCase();
  const match =
    SUPPORTED_LOCALES.find((locale) => locale === wanted || LANGUAGE_NAMES[locale as CatalogLocale].toLowerCase() === wanted) ??
    (/(same|app|default|auto)/.test(wanted) ? "same" : undefined);
  const now = user.replyLanguage ?? "same";
  if (!match) return { status: "unchanged", setting, now };
  return now === match ? { status: "unchanged", setting, now } : { status: "proposed", setting, now, after: match, reason };
}

