// A swap's two tokens, for any pair (R1): their real marks and their amounts in their own decimals. Drafts made
// before any-pair swaps carry only "USDC"/"EURC"; those still resolve through the identity registry and the money
// package, so an old card in a conversation keeps rendering.
import type { NetworkId, SwapDraftView, TokenView } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS, getEntity } from "@kawase/identity";
import { ASSETS, formatTokenAmount, type AssetId } from "@kawase/money";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { useLocale } from "@/i18n/locale-provider";

const AMOUNT_DIGITS = 6;
const SHORT_DIGITS = 2;

type Side = "in" | "out";

/** The token view of one side, or a stand-in built from the symbol for older USDC/EURC drafts. */
export function sideToken(draft: SwapDraftView, side: Side, network: NetworkId): Pick<TokenView, "chainId" | "address" | "symbol" | "logoUrl" | "decimals"> {
  const view = draft.tokens?.[side];
  if (view) return view;
  const symbol = side === "in" ? draft.tokenIn : draft.tokenOut;
  const ids = arcIdentity(network);
  const entity = getEntity(symbol === "EURC" ? ids.eurc : ids.usdc);
  return {
    chainId: network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet,
    address: entity?.address ?? "",
    symbol,
    logoUrl: null,
    decimals: ASSETS[symbol as AssetId]?.decimals ?? AMOUNT_DIGITS,
  };
}

/** "12.5 ARGUS" for a side of a draft, in its own decimals. */
export function useSwapMoney() {
  const { locale } = useLocale();
  return (draft: SwapDraftView, side: Side, baseUnits: string | null | undefined, network: NetworkId, short = false) => {
    if (!baseUnits) return "";
    const token = sideToken(draft, side, network);
    return formatTokenAmount(BigInt(baseUnits), token.decimals, token.symbol, locale, { fractionDigits: short ? SHORT_DIGITS : AMOUNT_DIGITS, trimZeros: true });
  };
}

export function SwapTokenMark({ draft, side, network, size }: { draft: SwapDraftView; side: Side; network: NetworkId; size: number }) {
  return <TokenMark token={sideToken(draft, side, network)} size={size} />;
}
