// LIFT (lift.fun), the launchpad on Arc: a token starts on its bonding curve and "graduates" to a regular pool when the
// curve fills. Its public api (read 2026-10-03): GET api.lift.fun/api/v1/tokens/{address} → `progress_bps` (0–10000),
// `graduated`, `graduated_at`, `market_cap_e6` and `pool_quote_balance_e6` in the quote (USDC, 6 decimals), and the
// fees a trade pays on the curve (`total_fee_buy_bps`, `total_fee_sell_bps`, of which `creator_tax_*_bps` go to the
// creator); `{"error":{"code":"not_found"}}` for a token LIFT did not launch. LIFT's tokens end in …0087.
const API = "https://api.lift.fun/api/v1";
const TIMEOUT_MS = 8_000;
const BPS = 10_000;
const USDC_E6 = 1_000_000;

export type LiftToken = {
  address: string;
  symbol: string;
  name: string;
  graduated: boolean;
  graduatedAt: string | null;
  /** 0 to 1: how full the bonding curve is. */
  progress: number;
  marketCapUsd: number | null;
  curveUsd: number | null;
  buyFeeBps: number;
  sellFeeBps: number;
  creatorBuyBps: number;
  creatorSellBps: number;
};

const num = (value: unknown) => (typeof value === "string" || typeof value === "number" ? Number(value) : NaN);

/** The token as LIFT reports it; undefined when LIFT did not launch it (or does not answer). */
export async function liftToken(address: string): Promise<LiftToken | undefined> {
  try {
    const response = await fetch(`${API}/tokens/${address.toLowerCase()}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.address !== "string") return undefined;
    const usd = (key: string) => (Number.isFinite(num(body[key])) ? num(body[key]) / USDC_E6 : null);
    return {
      address: body.address,
      symbol: String(body.symbol ?? ""),
      name: String(body.name ?? ""),
      graduated: body.graduated === true,
      graduatedAt: typeof body.graduated_at === "string" ? body.graduated_at : null,
      progress: Math.min(1, Math.max(0, (Number.isFinite(num(body.progress_bps)) ? num(body.progress_bps) : 0) / BPS)),
      marketCapUsd: usd("market_cap_e6"),
      curveUsd: usd("pool_quote_balance_e6"),
      buyFeeBps: num(body.total_fee_buy_bps) || 0,
      sellFeeBps: num(body.total_fee_sell_bps) || 0,
      creatorBuyBps: num(body.creator_tax_buy_bps) || 0,
      creatorSellBps: num(body.creator_tax_sell_bps) || 0,
    };
  } catch {
    return undefined;
  }
}
