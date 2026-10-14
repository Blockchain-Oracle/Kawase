import { Redirect, useLocalSearchParams } from "expo-router";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;
const CHAIN = /^[a-z]+$/;

/**
 * `/bridge` is Move now (plan F: one cross-chain screen, every bridge on its RouteList). Older links and chat cards
 * (`/bridge?to=base&amount=10`) land on the same move, prefilled.
 */
export default function BridgeRoute() {
  const params = useLocalSearchParams<{ to?: string; amount?: string }>();
  const chain = params.to && CHAIN.test(params.to) ? params.to : undefined;
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  return <Redirect href={{ pathname: "/move", params: { direction: "out", ...(chain ? { chain } : {}), ...(amount ? { amount } : {}) } }} />;
}
