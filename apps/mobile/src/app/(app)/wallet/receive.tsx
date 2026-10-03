import { useLocalSearchParams } from "expo-router";

import { ReceiveScreen } from "@/screens/receive-screen";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const WHOLE = /^\d+$/;

/** `/wallet/receive`; `?asset=0x…&chainId=…&symbol=…&decimals=…` starts a request for that token (a token page's Receive). */
export default function ReceiveRoute() {
  const params = useLocalSearchParams<{ asset?: string; chainId?: string; symbol?: string; decimals?: string; name?: string }>();
  const prefill =
    params.asset && ADDRESS.test(params.asset) && params.symbol && params.decimals && WHOLE.test(params.decimals) && params.chainId && WHOLE.test(params.chainId)
      ? { chainId: Number(params.chainId), address: params.asset, symbol: params.symbol, name: params.name ?? params.symbol, decimals: Number(params.decimals), logoUrl: null }
      : undefined;
  return <ReceiveScreen prefill={prefill} />;
}
