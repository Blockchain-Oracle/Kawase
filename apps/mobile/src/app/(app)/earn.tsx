import { useLocalSearchParams } from "expo-router";

import { EarnScreen } from "@/screens/earn-screen";

/** `/earn`: the vaults, the person's positions, deposits and withdrawals; `?vault=0x…&amount=20` opens that vault. */
export default function EarnRoute() {
  const params = useLocalSearchParams<{ vault?: string; amount?: string }>();
  return <EarnScreen prefill={{ vault: params.vault, amount: params.amount }} />;
}
