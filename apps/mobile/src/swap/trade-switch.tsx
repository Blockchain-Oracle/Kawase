// Swap, Move and Long/Short are the ways of moving value: one switch at the top of each screen (the fan's Swap opens
// it), so the fan stays at five actions. Switching replaces the screen rather than stacking it. The kit's Segmented
// (21st #23552). Move is the one cross-chain screen (every bridge on the RouteList); /bridge only redirects to it.
import { useRouter } from "expo-router";
import * as React from "react";

import { Segmented } from "@/components/kit";
import { useCapability } from "@/home/use-capability";
import { useT } from "@/i18n";

type Trade = "swap" | "bridge" | "margin";

export function TradeSwitch({ current }: { current: Trade }) {
  const { t } = useT();
  const router = useRouter();
  const bridgeReady = useCapability("bridge") === "available";
  if (!bridgeReady && current === "swap") return null;
  return (
    <Segmented<Trade>
      label={t("swap.title")}
      value={current}
      onChange={(value) => {
        if (value !== current) router.replace(value === "bridge" ? "/move" : value === "margin" ? "/margin" : "/swap");
      }}
      options={[
        { value: "swap", label: t("swap.title") },
        { value: "bridge", label: t("bridge.title") },
        // Long/Short shows on both networks: on testnet its screen says it is mainnet only and offers the switch (R2).
        { value: "margin", label: t("margin.title") },
      ]}
    />
  );
}
