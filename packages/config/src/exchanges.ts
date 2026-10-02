// Exchanges people withdraw to and fund from (money-out.md Withdraw, money-in.md "From an exchange"). Product data,
// not flow logic: which asset each exchange credits on which network, in each direction. Facts as of 2026-10-02
// from the exchanges' own announcements (Kraken blog, Bybit announcement, OKX/Binance/KuCoin reports, Bitget's
// "USDC-ARC" listing), recorded in money-in.md. No exchange credits EURC on Arc; EVM addresses need no memo.

/**
 * - live: announced and working;
 * - likely: reported but not confirmed by the exchange;
 * - limited: open but paused at times (Binance gates withdrawals to Arc on liquidity);
 * - unclear: no confirmation either way, so a test amount comes first.
 */
export type ExchangeSupport = "live" | "likely" | "limited" | "unclear";

export type ExchangeRail = {
  /** "arc", or a chain key Kawase bridges to ("base"). */
  chain: string;
  asset: "USDC";
  /** Sending to the exchange (Kawase → exchange: Withdraw). */
  deposit: ExchangeSupport;
  /** The exchange sending here (exchange → Kawase: Add money). */
  withdraw: ExchangeSupport;
  /** What the exchange's own menu calls the network, when it is not the chain's plain name. */
  networkLabel?: string;
};

export type Exchange = {
  slug: string;
  name: string;
  /** Best first: the planner takes the first rail whose direction is not unclear, else the first. */
  rails: readonly ExchangeRail[];
};

export const EXCHANGES: readonly Exchange[] = [
  { slug: "kraken", name: "Kraken", rails: [{ chain: "arc", asset: "USDC", deposit: "live", withdraw: "live", networkLabel: "Arc" }] },
  { slug: "bybit", name: "Bybit", rails: [{ chain: "arc", asset: "USDC", deposit: "live", withdraw: "live" }] },
  { slug: "okx", name: "OKX", rails: [{ chain: "arc", asset: "USDC", deposit: "likely", withdraw: "likely" }] },
  { slug: "binance", name: "Binance", rails: [{ chain: "arc", asset: "USDC", deposit: "live", withdraw: "limited" }] },
  { slug: "bitget", name: "Bitget", rails: [{ chain: "arc", asset: "USDC", deposit: "live", withdraw: "live", networkLabel: "USDC-ARC" }] },
  { slug: "kucoin", name: "KuCoin", rails: [{ chain: "arc", asset: "USDC", deposit: "unclear", withdraw: "unclear" }] },
  // Coinbase does not list Arc: USDC goes on Base to the same address (out: a bridge; in: Bring to Arc).
  { slug: "coinbase", name: "Coinbase", rails: [{ chain: "base", asset: "USDC", deposit: "live", withdraw: "live" }] },
];

/** An exchange by slug or by name as people say it ("kraken", "Kraken", "KuCoin"). */
export const findExchange = (text: string | null | undefined): Exchange | undefined => {
  const wanted = (text ?? "").trim().toLowerCase();
  if (!wanted) return undefined;
  return EXCHANGES.find((exchange) => exchange.slug === wanted || exchange.name.toLowerCase() === wanted);
};

/** The rail used in one direction: the first one that is not unclear, else the first. */
export const exchangeRail = (exchange: Exchange, direction: "deposit" | "withdraw"): ExchangeRail =>
  exchange.rails.find((rail) => rail[direction] !== "unclear") ?? exchange.rails[0]!;

/** Exchanges hold real money only: on testnet they are shown with this reason (money-out.md "Who / when"). */
export const EXCHANGE_NETWORK = "mainnet" as const;

/** Withdraw (money-out.md): a holding worth less than this (USD) is left out of "everything". */
export const WITHDRAW_DUST_USD = 0.01;
