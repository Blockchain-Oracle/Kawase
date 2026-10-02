// Money out (builder A2, money-out.md "Withdraw (any asset, anywhere)"): My places, the exchange table, and the
// withdrawal plan: one line per asset with its route (transfer on Arc, a bridge, or convert first), what arrives
// and why a line cannot go. Kept apart from types.ts so the lanes merge cleanly; the client spreads
// `withdrawEndpoints` into its routes.
import type { TokenView } from "./assets";
import type { NetworkId } from "./types";

type Call = <T>(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string | undefined }) => Promise<T>;

export type ExchangeSupportView = "live" | "likely" | "limited" | "unclear";

/** An exchange Kawase knows, with the network it uses for USDC in each direction (money-in.md table). */
export type ExchangeView = {
  slug: string;
  name: string;
  /** "arc" or a chain key ("base"), with its display name. */
  chain: { key: string; name: string; chainId: number | null };
  asset: "USDC";
  deposit: ExchangeSupportView;
  withdraw: ExchangeSupportView;
  networkLabel: string;
  /** Exchanges hold real money: on testnet this is "mainnet_only" and the row is shown, not usable. */
  unavailable: "mainnet_only" | null;
};

export type PlaceKind = "exchange" | "wallet";

/** A saved destination ("My places"). */
export type PlaceView = {
  id: string;
  network: NetworkId;
  kind: PlaceKind;
  /** The person's own name for it; null = the app names it (the exchange's name, "My wallet on Base"). */
  label: string | null;
  /** The exchange slug or wallet brand, for its mark. */
  brand: string | null;
  chain: { key: string; name: string; chainId: number | null };
  address: string;
  lastUsedAt: string | null;
};

export type PlaceInput = { kind: PlaceKind; label?: string | null | undefined; brand?: string | null | undefined; chain: string; address: string };

/** What to take out: one asset (address or symbol), how much ("max" or a decimal), and in what form. */
export type WithdrawAssetInput = { asset: string; amount?: string | null | undefined; as?: "itself" | "cash" | null | undefined };

export type WithdrawPlanInput = {
  assets?: WithdrawAssetInput[] | undefined;
  /** Every visible holding on Arc (dust left out). */
  everything?: boolean | undefined;
  /** A saved place, or an exchange (slug or name), or a chain + address for the person's own wallet. */
  place?: string | null | undefined;
  exchange?: string | null | undefined;
  chain?: string | null | undefined;
  address?: string | null | undefined;
};

export type WithdrawStep = "swap" | "transfer" | "bridge";

/**
 * Why a line cannot go as planned (R2), as codes the app and the agent both word:
 * - blocking: no_balance, insufficient, cannot_convert, convert_first, mainnet_only, exchange_mainnet_only, needs_address, bad_address, no_destination, unknown_chain;
 * - warnings: exchange_not_accepted (the exchange does not credit it there: may be lost), exchange_unconfirmed, exchange_limited.
 */
export type WithdrawReason =
  | "no_balance"
  | "insufficient"
  | "cannot_convert"
  | "convert_first"
  | "mainnet_only"
  | "exchange_mainnet_only"
  | "needs_address"
  | "bad_address"
  | "no_destination"
  | "unknown_chain"
  | "exchange_not_accepted"
  | "exchange_unconfirmed"
  | "exchange_limited";

export type WithdrawLegView = {
  token: TokenView;
  /** Base units of the token to take out. */
  amount: string;
  /** Decimal string of the same. */
  amountText: string;
  /** Whether "max" was asked (the amount is the balance, net of the fee reserve for USDC). */
  max: boolean;
  balance: string;
  valueUsd: number | null;
  as: "itself" | "cash";
  steps: WithdrawStep[];
  /** What arrives, and where. For a conversion this is an estimate from prices (the swap quotes it at review). */
  receive: { symbol: string; amountText: string | null; chain: string };
  status: "ready" | "warning" | "blocked";
  reason: WithdrawReason | null;
  /** The line could go as cash instead (convert to USDC on Arc first). */
  canGoAsCash: boolean;
};

export type WithdrawDestinationView = {
  kind: PlaceKind;
  /** As PlaceView.label: null = the app names it. */
  label: string | null;
  brand: string | null;
  chain: { key: string; name: string; chainId: number | null };
  address: string | null;
  placeId: string | null;
  exchange: ExchangeView | null;
};

export type WithdrawPlanView = {
  network: NetworkId;
  destination: WithdrawDestinationView | null;
  legs: WithdrawLegView[];
  /** A reason that stops every line (no destination, exchanges on testnet). */
  blocking: WithdrawReason | null;
  /** Approximate USD that leaves, for the review's total. */
  totalUsd: number | null;
};

/** What propose_withdraw returns: the plan, and the card opens the Withdraw screen with it prefilled. */
export type WithdrawProposalOutput = { withdraw: true; plan: WithdrawPlanView; input: WithdrawPlanInput; summary: string };

export function withdrawEndpoints(call: Call) {
  return {
    places: {
      list: () => call<{ places: PlaceView[] }>("GET", "/places"),
      create: (input: PlaceInput) => call<{ place: PlaceView }>("POST", "/places", input),
      rename: (id: string, label: string) => call<{ place: PlaceView }>("PATCH", `/places/${id}`, { label }),
      remove: (id: string) => call<{ ok: true }>("DELETE", `/places/${id}`),
    },
    withdrawals: {
      /** The exchange table (money-in.md), for both Withdraw and Add money. */
      exchanges: () => call<{ exchanges: ExchangeView[] }>("GET", "/withdrawals/exchanges"),
      /** Bridge destinations for "my other wallet", with Arc first. */
      chains: () => call<{ chains: { key: string; name: string; chainId: number | null }[] }>("GET", "/withdrawals/chains"),
      plan: (input: WithdrawPlanInput) => call<{ plan: WithdrawPlanView }>("POST", "/withdrawals/plan", input),
    },
  };
}
