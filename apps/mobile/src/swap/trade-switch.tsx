// Swap and Bridge are two ways of moving value: one switch at the top of both screens (the fan's Swap opens it),
// so the fan stays at five actions. Switching replaces the screen rather than stacking it.
import { useRouter } from "expo-router";
import * as React from "react";

import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";

import { useCapability } from "@/home/use-capability";
import { useT } from "@/i18n";

export function TradeSwitch({ current }: { current: "swap" | "bridge" | "margin" }) {
  const { t } = useT();
  const router = useRouter();
  const bridgeReady = useCapability("bridge") === "available";
  if (!bridgeReady && current === "swap") return null;
  return (
    <SegmentedControl
      label={t("swap.title")}
      value={current}
      onValueChange={(value) => {
        if (value !== current) router.replace(value === "bridge" ? "/bridge" : value === "margin" ? "/margin" : "/swap");
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
