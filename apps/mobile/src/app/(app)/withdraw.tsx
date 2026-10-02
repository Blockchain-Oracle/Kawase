import { useLocalSearchParams } from "expo-router";

import type { WithdrawAssetInput } from "@kawase/api-client";

import { WithdrawScreen } from "@/screens/withdraw-screen";

/**
 * `/withdraw` opens Withdraw empty; Home, token pages and the chat's withdraw card prefill it:
 * `assets=<address|symbol>:<amount|max>:<itself|cash>,…` · `everything=1` · `place=<id>` · `exchange=kraken` ·
 * `chain=base` · `address=0x…`.
 */
export default function WithdrawRoute() {
  const params = useLocalSearchParams<{ assets?: string; everything?: string; place?: string; exchange?: string; chain?: string; address?: string }>();
  const assets: WithdrawAssetInput[] = (params.assets ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry): WithdrawAssetInput => {
      const [asset = "", amount, as] = entry.split(":");
      return { asset, amount: amount || null, as: as === "cash" || as === "itself" ? as : null };
    })
    .filter((entry) => entry.asset);
  return (
    <WithdrawScreen
      prefill={{
        assets,
        everything: params.everything === "1",
        destination: { place: params.place, exchange: params.exchange, chain: params.chain, address: params.address },
      }}
    />
  );
}

