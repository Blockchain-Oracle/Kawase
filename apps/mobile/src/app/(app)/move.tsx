import { useLocalSearchParams } from "expo-router";

import { MoveScreen } from "@/screens/move-screen";

/**
 * `/move?direction=in&chain=base` opens Bring to Arc from Base; `/move?chain=base&amount=20&recipient=@sam` a move out;
 * `&asset=WETH` (a symbol or an Arc address) moves that asset instead of USDC.
 * Withdraw, Add money (From another chain) and chat link here.
 */
export default function MoveRoute() {
  const params = useLocalSearchParams<{ direction?: string; chain?: string; amount?: string; recipient?: string; asset?: string }>();
  const direction = params.direction === "in" ? "in" : params.direction === "out" ? "out" : undefined;
  return <MoveScreen prefill={{ direction, chain: params.chain, amount: params.amount, recipient: params.recipient, asset: params.asset }} />;
}
