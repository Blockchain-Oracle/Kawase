import type { AssetId } from "./assets";
import { ASSETS } from "./assets";

const TEN = 10n;

/** Integer base units of a specific asset. Branded so amounts of different assets can't be mixed by accident. */
export type Amount<A extends AssetId = AssetId> = { readonly asset: A; readonly baseUnits: bigint };

export function amount<A extends AssetId>(asset: A, baseUnits: bigint): Amount<A> {
  return { asset, baseUnits };
}

/** Change decimal scale, named explicitly (e.g. native 18 → ERC-20 6). Truncates toward zero when narrowing. */
export function rescale(value: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return value;
  return fromDecimals > toDecimals
    ? value / TEN ** BigInt(fromDecimals - toDecimals)
    : value * TEN ** BigInt(toDecimals - fromDecimals);
}

function assertSameAsset(a: Amount, b: Amount): void {
  if (a.asset !== b.asset) throw new Error(`Cannot combine ${a.asset} with ${b.asset}`);
}

export function add<A extends AssetId>(a: Amount<A>, b: Amount<A>): Amount<A> {
  assertSameAsset(a, b);
  return amount(a.asset, a.baseUnits + b.baseUnits);
}

export function subtract<A extends AssetId>(a: Amount<A>, b: Amount<A>): Amount<A> {
  assertSameAsset(a, b);
  return amount(a.asset, a.baseUnits - b.baseUnits);
}

export function compare(a: Amount, b: Amount): -1 | 0 | 1 {
  assertSameAsset(a, b);
  if (a.baseUnits === b.baseUnits) return 0;
  return a.baseUnits < b.baseUnits ? -1 : 1;
}

export function decimalsOf(asset: AssetId): number {
  return ASSETS[asset].decimals;
}
