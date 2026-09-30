/**
 * Asset definitions. Arc USDC is ONE asset with TWO interfaces (context/01-arc/gotchas.md):
 * native balance / gas / msg.value = 18 decimals; the ERC-20 view at 0x3600… = 6 decimals.
 * Never add or compare raw amounts across the two views; convert with rescale().
 */
export const USDC_NATIVE_DECIMALS = 18;
export const USDC_ERC20_DECIMALS = 6;
export const EURC_DECIMALS = 6;

export type AssetId = "USDC" | "EURC";

export type AssetDefinition = {
  id: AssetId;
  symbol: string;
  /** Decimals of the ERC-20 interface, the unit Kawase stores and displays. */
  decimals: number;
};

export const ASSETS = {
  USDC: { id: "USDC", symbol: "USDC", decimals: USDC_ERC20_DECIMALS },
  EURC: { id: "EURC", symbol: "EURC", decimals: EURC_DECIMALS },
} as const satisfies Record<AssetId, AssetDefinition>;
