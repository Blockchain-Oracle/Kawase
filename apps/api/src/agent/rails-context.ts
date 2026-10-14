// The money-rails part of the agent's view (builder B1): Kawase Margin markets, positions and orders. Kept apart
// from context.ts so the lanes merge cleanly; context.ts spreads it in.
import { and, eq, inArray } from "drizzle-orm";
import { formatUnits } from "viem";

import type { AgentContext } from "@kawase/agent";
import type { CrossChainIntent, LendIntent, YieldOptionsView, MarginIntent, MarginMarketsView, MarginPositionView, MarginSummary } from "@kawase/api-client";
import { intents, type Db } from "@kawase/db";

import type { MarginService } from "../margin/service";
import type { OnrampService } from "../onramp/service";
import type { CrossChainService } from "../crosschain/service";
import type { LendService } from "../lend/service";
import type { SessionUser } from "../types";

const DRAFTABLE = ["submitted", "working", "input_required", "auth_required", "ready_for_approval"] as const;
const PRICE_DECIMALS = 8;
const PERCENT = 100;
const MONEY_DIGITS = 2;
const RATE_DIGITS = 2;
const USDC_DECIMALS = 6;

const dollars = (value: number) => `$${value.toFixed(MONEY_DIGITS)}`;
const price = (eightDecimals: string | null) => (eightDecimals ? dollars(Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS))) : "unknown");
const pct = (fraction: number) => `${(fraction * PERCENT).toFixed(RATE_DIGITS)}%`;

const REASONS: Record<string, string> = {
  SIGN_IN_REQUIRED: "The person must sign in first.",
  ON_OTHER_NETWORK: "Kawase Margin runs on Arc mainnet only (Aave V4 has no testnet); offer to switch to mainnet.",
  NOT_AVAILABLE_YET: "Kawase Margin is not available right now.",
  PAUSED_ALL: "The person paused all money movement.",
  WALLET_NOT_READY: "The wallet is not set up yet.",
  WALLET_NOT_SET_UP: "The wallet is not set up on this network yet; the card offers to set it up.",
  MARKET_MISSING: "Which market? (get_markets lists them)",
  SIDE_MISSING: "Long or short?",
  MARGIN_MARKET_UNAVAILABLE: "No lending market lists that token, so it cannot be traded long or short here; offer a spot buy or a price alert instead.",
  MARGIN_SIDE_UNAVAILABLE: "That side is not possible on this market (for example EURC cannot be collateral, so it can be shorted but not longed; a long EURC is a spot buy).",
  POSITION_MISSING: "There is no open position like that.",
  AMOUNT_MISSING: "How much margin, in USDC?",
  AMOUNT_INVALID: "The margin amount is not valid.",
  INSUFFICIENT_BALANCE: "Not enough USDC for that margin.",
  INSUFFICIENT_GAS: "A little USDC must stay for the network fee.",
  LEVERAGE_TOO_HIGH: "That leverage is above what the market allows; offer the maximum shown.",
  QUOTE_UNAVAILABLE: "No swap price right now; try again in a moment.",
};

export function summarizeMargin(intent: MarginIntent): MarginSummary {
  const draft = intent.draft;
  const blocking = intent.blocking;
  const moving = intent.state === "executing" || intent.state === "approved" || intent.state === "unknown_outcome";
  const closing = intent.request.action === "close";
  const status: MarginSummary["status"] =
    intent.state === "completed"
      ? "done"
      : moving
        ? closing
          ? "closing"
          : "opening"
        : intent.state === "failed"
          ? "failed"
          : !blocking
            ? "ready"
            : blocking.code === "SIGN_IN_REQUIRED"
              ? "needs_sign_in"
              : blocking.kind === "clarification"
                ? "needs_answer"
                : blocking.kind === "precondition"
                  ? "needs_fix"
                  : blocking.kind === "policy"
                    ? "refused"
                    : "not_possible";
  const text = draft
    ? closing
      ? `Close ${pct(draft.fraction)} of the ${draft.side} ${draft.market} position on ${intent.network}: about ${dollars(draft.notionalUsd)} unwound, at least ${formatUnits(BigInt(draft.returnedMin), USDC_DECIMALS)} USDC back.`
      : `${draft.leverage}× ${draft.side} ${draft.market} with ${formatUnits(BigInt(draft.margin), USDC_DECIMALS)} USDC margin on ${intent.network}: about ${dollars(draft.notionalUsd)} exposure, liquidation at ${price(draft.liquidationPrice)} (now ${price(draft.markPrice)}), borrow rate ${pct(draft.borrowApr)} a year. The person slides to confirm on the card.`
    : "";
  return { intentId: intent.id, network: intent.network, status, text, blocking: blocking ? (REASONS[blocking.code] ?? blocking.code) : null };
}

const marketsSummary = (view: MarginMarketsView) =>
  view.available
    ? view.markets
        .map((m) => `${m.market} ${price(m.price)}: long ${m.long.available ? `up to ${m.long.maxLeverage.toFixed(1)}×` : "not possible"}, short ${m.short.available ? `up to ${m.short.maxLeverage.toFixed(1)}×` : "not possible"}`)
        .join("; ")
    : "Kawase Margin is on Arc mainnet only (Aave V4 has no testnet); offer to switch.";

const positionSummary = (p: MarginPositionView) =>
  `${p.side} ${p.market} ${p.leverage.toFixed(1)}×: P&L ${dollars(p.pnlUsd)} (${pct(p.pnlPercent)}), liquidation ${price(p.liquidationPrice)}, mark ${price(p.markPrice)}, id ${p.id}`;

const MOVE_REASONS: Record<string, string> = {
  SIGN_IN_REQUIRED: "The person must sign in first.",
  ON_OTHER_NETWORK: "This works on the other network; offer to switch.",
  WALLET_NOT_READY: "The wallet is not set up yet.",
  WALLET_NOT_SET_UP: "The wallet is not set up on this network yet; the card offers to set it up.",
  DESTINATION_MISSING: "Which chain?",
  RECIPIENT_INVALID: "That address is not valid.",
  RECIPIENT_UNKNOWN: "Kawase does not know who that is; ask for a saved contact, a @handle or an address.",
  RECIPIENT_NO_WALLET: "That person has no Kawase wallet yet.",
  RECIPIENT_BLOCKED: "The person blocked them, so Kawase will not pay them.",
  ADDRESS_CHANGE_HOLD: "Their address there was added or changed recently, so payments wait out a safety hold.",
  AMOUNT_MISSING: "How much?",
  AMOUNT_INVALID: "The amount is not valid.",
  INSUFFICIENT_BALANCE: "Not enough of that asset there.",
  INSUFFICIENT_GAS: "A little must stay for the network fee (USDC on Arc, or the coin itself on the other chain).",
  MOVE_ASSET_UNKNOWN: "Kawase cannot find that asset on that chain; ask which one they mean.",
  TOKEN_BLOCKED: "That token imitates another one; Kawase will not move it.",
  QUOTE_UNAVAILABLE: "No route can carry it right now; try again in a moment or a different amount.",
};

function summarizeCrossChain(intent: CrossChainIntent): string {
  const draft = intent.draft;
  const blocking = intent.blocking;
  if (!draft) return blocking ? (MOVE_REASONS[blocking.code] ?? blocking.code) : "Needs more details.";
  // Drafts from before any-asset moves carry no input/output: USDC both sides.
  const money = (base: string | null, asset: { symbol: string; decimals: number } | undefined) => (base ? `${formatUnits(BigInt(base), asset?.decimals ?? USDC_DECIMALS)} ${asset?.symbol ?? "USDC"}` : "unknown");
  const who = draft.recipient.own ? "their own address" : (draft.recipient.label ?? draft.recipient.address);
  const options = draft.routes
    .map((route) => `${route.provider}${route.via ? ` via ${route.via}` : ""}${route.convertFirst ? ` (swapped to USDC on ${route.convertFirst.venue} first)` : ""}: ${route.executable ? money(route.received, route.output) : (route.reason ?? "not available")}`)
    .join("; ");
  const line = `${money(draft.amount, draft.input)} from ${draft.source.name} to ${who} on ${draft.destination.name}; best route ${draft.chosen}, at least ${money(draft.minReceived, draft.output)} arrives. Options: ${options}. The person picks and confirms on the card.`;
  return blocking ? `${line} Blocked: ${MOVE_REASONS[blocking.code] ?? blocking.code}` : line;
}

function summarizeOptions(view: YieldOptionsView): string {
  if (view.options.length === 0) return `Nothing to earn on ${view.asset} here right now.`;
  return view.options
    .map((option) => `${option.name} (${option.protocol}): ${pct(option.rate)} ${option.rateKind}${option.withdrawableUsd !== null ? `, ${dollars(option.withdrawableUsd)} withdrawable now` : ""}${option.note ? ` [${option.note}]` : ""}${option.executable ? "" : " (shown only)"}`)
    .join("; ")
    .concat(view.best ? `. Best liquid: ${view.options.find((option) => option.id === view.best)?.name}.` : ".");
}

const LEND_REASONS: Record<string, string> = {
  SIGN_IN_REQUIRED: "The person must sign in first.",
  ON_OTHER_NETWORK: "Aave V4 is on Arc mainnet only; offer to switch.",
  ASSET_UNCLEAR: "Which asset?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 does not list that asset here (or not for borrowing).",
  LEND_NOT_COLLATERAL: "That asset cannot back a loan (EURC's collateral factor is 0); suggest cirBTC, WETH or USDC.",
  LEND_NOTHING_OWED: "There is nothing owed in that asset.",
  AMOUNT_MISSING: "How much?",
  INSUFFICIENT_BALANCE: "Not enough in the wallet for that.",
  OVER_POSITION: "That is more than what is supplied.",
  HEALTH_TOO_LOW: "That would put the account too close to liquidation; suggest less, or more collateral.",
};

function summarizeLend(intent: LendIntent): string {
  const draft = intent.draft;
  const blocking = intent.blocking ? (LEND_REASONS[intent.blocking.code] ?? intent.blocking.code) : null;
  if (!draft) return blocking ?? "Needs more details.";
  const amount = `${formatUnits(BigInt(draft.amount), draft.decimals)} ${draft.asset}`;
  const extra = draft.collateral ? ` with ${formatUnits(BigInt(draft.collateral.amount), draft.collateral.decimals)} ${draft.collateral.asset} as collateral` : "";
  const liquidation = draft.liquidation ? ` (liquidated if ${draft.liquidation.asset} falls to ${price(draft.liquidation.price)})` : "";
  const health = draft.healthAfter !== null ? `, health after ${draft.healthAfter.toFixed(MONEY_DIGITS)}${liquidation}` : "";
  const line = `${draft.action} ${draft.all ? `all (${amount})` : amount}${extra} on Aave V4 at ${pct(draft.rate)} a year${health}. The person confirms on the card.`;
  return blocking ? `${line} Blocked: ${blocking}` : line;
}

const BUY_REASONS = {
  sign_in: "The person must sign in first; the card opens sign-in and comes back.",
  no_wallet: "The wallet is not set up yet.",
  not_configured: "Buying is not set up on this network.",
} as const;

export function railsContext(input: {
  user: SessionUser;
  db: Db;
  margin: MarginService | undefined;
  onramp: OnrampService | undefined;
  crosschain: CrossChainService | undefined;
  lend: LendService | undefined;
  threadId: string;
}): Partial<AgentContext> {
  const { user, db, margin, onramp, crosschain, lend, threadId } = input;
  const network = user.activeNetwork;
  const buy: Partial<AgentContext> = onramp
    ? {
        async proposeBuy(request) {
          const availability = await onramp.availability(user);
          const deliverable = availability.deliverable as readonly string[];
          const then = request.then?.trim() || null;
          const asset = request.asset && deliverable.includes(request.asset.toUpperCase()) ? request.asset.toUpperCase() : then && deliverable.includes(then.toUpperCase()) ? then.toUpperCase() : deliverable[0]!;
          const amount = request.amount ?? availability.defaultAmount;
          const currency = asset === "EURC" ? "EUR" : "USD";
          const extra = then && then.toUpperCase() !== asset ? `, then swap it to ${then} (one more approval; both fees shown)` : "";
          const where = availability.sandbox ? " in Circle's sandbox (test cards, test money)" : " with real money";
          const summary = availability.available
            ? `Ready: buy about ${amount} ${currency} of ${asset} with Apple Pay, Google Pay or a debit card${where}${extra}. The person taps the card to open Circle's checkout; the money is confirmed when it arrives on chain.`
            : BUY_REASONS[availability.reason ?? "not_configured"];
          return { ...availability, asset, amount, currency, then: then && then.toUpperCase() !== asset ? then : null, summary };
        },
      }
    : {};
  const moves: Partial<AgentContext> = crosschain
    ? {
        async proposeCrossChain(request) {
          // One open cross-chain move per conversation.
          await db
            .update(intents)
            .set({ state: "canceled" })
            .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "crosschain"), inArray(intents.state, [...DRAFTABLE])));
          const intent = await crosschain.create(user, request, { surface: "chat", threadId });
          return { crosschain: true as const, intent, summary: summarizeCrossChain(intent) };
        },
      }
    : {};
  const lending: Partial<AgentContext> = lend
    ? {
        async compareYield(request) {
          const view = await lend.options(user, request.asset, request.amount);
          return { ...view, summary: summarizeOptions(view) };
        },
        async proposeLend(request) {
          await db
            .update(intents)
            .set({ state: "canceled" })
            .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "lend"), inArray(intents.state, [...DRAFTABLE])));
          const intent = await lend.create(user, request, { surface: "chat", threadId });
          return { intent, summary: summarizeLend(intent) };
        },
      }
    : {};
  if (!margin) return { ...buy, ...moves, ...lending };
  return {
    ...buy,
    ...moves,
    ...lending,
    async marginMarkets() {
      const view = await margin.markets(network);
      return { ...view, summary: marketsSummary(view) };
    },
    async marginPositions() {
      const positions = user.isAnonymous ? [] : await margin.positions(user);
      return { network, positions, summary: positions.length ? positions.map(positionSummary).join("; ") : "No open positions." };
    },
    async proposeMargin(request) {
      // One open order per conversation: a newer proposal replaces an earlier one still waiting.
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "margin"), inArray(intents.state, [...DRAFTABLE])));
      const intent = await margin.create(user, request, { surface: "chat", threadId });
      return { intent, summary: summarizeMargin(intent) };
    },
    async protectPosition(request) {
      const positions = user.isAnonymous ? [] : await margin.positions(user);
      const wanted = request.market?.trim().toLowerCase();
      const position = request.positionId
        ? positions.find((entry) => entry.id === request.positionId)
        : positions.find((entry) => (!wanted || entry.market.toLowerCase() === wanted) && (!request.side || entry.side === request.side));
      if (!margin.protection || network !== "mainnet") return { network, result: null, refused: "protection_unavailable", summary: PROTECT_REASONS.protection_unavailable };
      if (!position) return { network, result: null, refused: "not_found", summary: "No open position like that; get_positions lists them." };
      try {
        const result = await margin.protection.protect(user, position.id, { takeProfit: request.takeProfit, stopLoss: request.stopLoss });
        const targets = [result.position.takeProfit ? `take-profit ${price(result.position.takeProfit)}` : null, result.position.stopLoss ? `stop-loss ${price(result.position.stopLoss)}` : null].filter(Boolean).join(", ") || "no targets";
        const summary = `${position.market} ${position.side}: ${targets} saved.${result.needsGrant ? " The person still has to let Kawase close positions for them: the card asks (one Face ID)." : " Kawase watches it and closes the whole position when the price gets there."}`;
        return { network, result, refused: null, summary };
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "failed";
        return { network, result: null, refused: code, summary: PROTECT_REASONS[code as keyof typeof PROTECT_REASONS] ?? "Could not save the targets." };
      }
    },
  };
}

const PROTECT_REASONS = {
  take_profit_wrong_side: "A take-profit must be past today's price (above it for a long, below for a short).",
  stop_loss_wrong_side: "A stop-loss must be before today's price (below it for a long, above for a short).",
  stop_loss_past_liquidation: "That stop-loss is past the liquidation price; it has to come before it.",
  protection_unavailable: "Take-profit and stop-loss work on Arc mainnet, for sizes Uniswap on Arc can close now.",
} as const;
