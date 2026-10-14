import { useLocalSearchParams } from "expo-router";

import { TradeScreen } from "@/trade/trade-screen";

/** `/margin?market=BTC&side=long` opens the terminal on that market and side (chat, a token page, Markets). */
export default function MarginRoute() {
  const params = useLocalSearchParams<{ market?: string; side?: string }>();
  const side = params.side === "long" || params.side === "short" ? params.side : undefined;
  return <TradeScreen prefill={{ market: params.market, side }} />;
}
