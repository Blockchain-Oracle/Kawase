import { useLocalSearchParams } from "expo-router";

import { WidePage } from "@/trade/page-frame";
import { TERMINAL_PAGE_PX, TradeScreen } from "@/trade/trade-screen";

/**
 * `/margin?market=BTC&side=long` opens the terminal on that market and side (chat, a token page, Markets); `&d=position
 * &id=<id>` opens a position in the right drawer. On a desktop window the page is wider than the stack's usual column,
 * so the chart, the positions and the ticket fit side by side (the Kraken Pro / Coinbase Advanced layout).
 */
export default function MarginRoute() {
  const params = useLocalSearchParams<{ market?: string; side?: string }>();
  const side = params.side === "long" || params.side === "short" ? params.side : undefined;
  return (
    <>
      <WidePage max={TERMINAL_PAGE_PX} />
      <TradeScreen prefill={{ market: params.market, side }} />
    </>
  );
}
