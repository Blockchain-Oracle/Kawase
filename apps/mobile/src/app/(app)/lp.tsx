import { useLocalSearchParams } from "expo-router";

import { LpScreen } from "@/screens/lp-screen";

/**
 * `/lp`: Aero LP — the pools, the person's positions and Merkl's rewards. `/lp?pool=cirBTC-USDC&asset=USDC&amount=20`
 * opens a pool's deposit prefilled (the yield options and the chat card link here).
 */
export default function LpRoute() {
  const params = useLocalSearchParams<{ pool?: string; asset?: string; amount?: string }>();
  return <LpScreen prefill={{ pool: params.pool, asset: params.asset, amount: params.amount }} />;
}
