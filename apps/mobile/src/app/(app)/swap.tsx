import { useLocalSearchParams } from "expo-router";

import { SwapScreen } from "@/screens/swap-screen";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * `/swap?from=USDC&amount=10` prefills the swap (chat, a balance row); `/swap?buy=0x…` and `/swap?sell=0x…` open the
 * ticket for any token from its page.
 */
export default function SwapRoute() {
  const params = useLocalSearchParams<{ from?: string; amount?: string; buy?: string; sell?: string }>();
  const from = params.from === "USDC" || params.from === "EURC" ? params.from : undefined;
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  const buy = params.buy && ADDRESS.test(params.buy) ? params.buy : undefined;
  const sell = params.sell && ADDRESS.test(params.sell) ? params.sell : undefined;
  return <SwapScreen prefill={{ from, amount, buy, sell }} />;
}
