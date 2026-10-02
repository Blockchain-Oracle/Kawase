import { useLocalSearchParams } from "expo-router";

import { MarginScreen } from "@/screens/margin-screen";

/** `/margin?market=BTC&side=long` opens the ticket for that market and side (chat, a token page). */
export default function MarginRoute() {
  const params = useLocalSearchParams<{ market?: string; side?: string }>();
  const side = params.side === "long" || params.side === "short" ? params.side : undefined;
  return <MarginScreen prefill={{ market: params.market, side }} />;
}
