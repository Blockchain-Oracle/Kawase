import { useLocalSearchParams } from "expo-router";

import { BorrowScreen } from "@/screens/borrow-screen";
import { WidePage } from "@/trade/page-frame";

const ACTIONS = new Set(["supply", "withdraw", "borrow", "repay"]);

/**
 * `/borrow`: the Aave V4 position and borrowing. `/borrow?asset=USDC&collateral=cirBTC` opens a loan against cirBTC;
 * `/borrow?action=supply&asset=USDC&amount=20` the supply ticket (the yield options link here).
 */
export default function BorrowRoute() {
  const params = useLocalSearchParams<{ action?: string; asset?: string; amount?: string; collateral?: string }>();
  const action = params.action && ACTIONS.has(params.action) ? (params.action as "supply" | "withdraw" | "borrow" | "repay") : undefined;
  return (
    <>
      <WidePage />
      <BorrowScreen prefill={{ action, asset: params.asset, amount: params.amount, collateral: params.collateral }} />
    </>
  );
}
