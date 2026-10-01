import { useLocalSearchParams } from "expo-router";

import { SwapScreen } from "@/screens/swap-screen";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;

/** `/swap?from=USDC&amount=10` prefills the swap (from chat or a balance row). */
export default function SwapRoute() {
  const params = useLocalSearchParams<{ from?: string; amount?: string }>();
  const from = params.from === "USDC" || params.from === "EURC" ? params.from : undefined;
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  return <SwapScreen prefill={{ from, amount }} />;
}
