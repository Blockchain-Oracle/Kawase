import { Stack, useLocalSearchParams } from "expo-router";

import { useWide } from "@kawase/ui-native/lib/wide";

import { TERMINAL_PAGE_PX, TradeScreen } from "@/trade/trade-screen";

/**
 * `/margin?market=BTC&side=long` opens the terminal on that market and side (chat, a token page, Markets). On a
 * desktop window the page is wider than the stack's usual column, so the chart, the ticket and the positions fit side
 * by side (the Kraken Pro / Coinbase Advanced layout).
 */
export default function MarginRoute() {
  const wide = useWide();
  const params = useLocalSearchParams<{ market?: string; side?: string }>();
  const side = params.side === "long" || params.side === "short" ? params.side : undefined;
  return (
    <>
      {wide ? <Stack.Screen options={{ contentStyle: { width: "100%", alignSelf: "center", maxWidth: TERMINAL_PAGE_PX } }} /> : null}
      <TradeScreen prefill={{ market: params.market, side }} />
    </>
  );
}
