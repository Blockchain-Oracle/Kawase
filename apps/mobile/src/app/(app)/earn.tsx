import { useLocalSearchParams } from "expo-router";

import { EarnScreen } from "@/screens/earn-screen";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const WHOLE = /^\d+$/;

/**
 * `/earn`: the vaults, the person's positions, deposits and withdrawals; `?vault=0x…&amount=20` opens that vault;
 * `?asset=0x…&chainId=…&symbol=…&decimals=…` starts on that token (a token page's Earn).
 */
export default function EarnRoute() {
  const params = useLocalSearchParams<{ vault?: string; amount?: string; asset?: string; chainId?: string; symbol?: string; decimals?: string; name?: string }>();
  const token =
    params.asset && ADDRESS.test(params.asset) && params.symbol && params.decimals && WHOLE.test(params.decimals) && params.chainId && WHOLE.test(params.chainId)
      ? { chainId: Number(params.chainId), address: params.asset, symbol: params.symbol, name: params.name ?? params.symbol, decimals: Number(params.decimals), logoUrl: null }
      : undefined;
  return <EarnScreen prefill={{ vault: params.vault, amount: params.amount, token }} />;
}
