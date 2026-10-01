import { useLocalSearchParams } from "expo-router";

import type { BridgeDestinationId } from "@kawase/api-client";

import { BridgeScreen } from "@/screens/bridge-screen";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;
const DESTINATIONS: readonly BridgeDestinationId[] = ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"];

/** `/bridge?to=base&amount=10` prefills the bridge (from chat or a balance row). */
export default function BridgeRoute() {
  const params = useLocalSearchParams<{ to?: string; amount?: string }>();
  const destination = DESTINATIONS.find((id) => id === params.to);
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  return <BridgeScreen prefill={{ destination, amount }} />;
}
