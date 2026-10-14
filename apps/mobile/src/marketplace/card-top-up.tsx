// "Top up your agent wallet with Apple Pay or card" (B2-2): the one Buy flow (D42) with the agent wallet as the
// destination — USDC delivered on Arc straight to the agent wallet, watched until it lands, then put into Gateway like
// any top-up. No grant or Face ID first: the money comes from the card, not from the person's Kawase wallet. The wallet
// marks this device can pay with sit on the button (felipemenezes098/payment-3 #25102's express row, as one plate).
import * as React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { formatUnits } from "viem";

import { Button } from "@/components/kit";
import { SPACE } from "@/components/kit/theme";
import { MarkStack } from "@/fund/sheet-parts";
import { useT } from "@/i18n";
import { useBuy } from "@/onramp/buy-provider";

const USDC_DECIMALS = 6;

export function CardTopUp({ amount, disabled }: { amount: string; disabled?: boolean }) {
  const { t } = useT();
  const buy = useBuy();
  const dollars = formatUnits(BigInt(amount || "0"), USDC_DECIMALS);
  const marks = Platform.OS === "android" ? ["pay:googlepay"] : Platform.OS === "ios" ? ["pay:applepay"] : ["pay:applepay", "pay:googlepay"];
  return (
    <View style={styles.row}>
      <Button
        label={t("agentWallet.cardButton")}
        variant="secondary"
        leading={<MarkStack entities={marks} />}
        disabled={disabled}
        onPress={() => buy.open({ asset: "USDC", amount: dollars, destination: "agent_wallet" })}
      />
    </View>
  );
}

const styles = StyleSheet.create({ row: { gap: SPACE.xs } });
