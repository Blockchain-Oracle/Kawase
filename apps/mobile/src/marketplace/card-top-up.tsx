// "Top up your agent wallet with Apple Pay" (B2-2): the express wallet buttons (21st 25102 twin) open B1's one buy
// flow with the agent wallet as the destination — Circle's checkout in the browser sheet, USDC delivered on Arc
// straight to the agent wallet, watched until it lands, then put into Gateway like any top-up. No grant or Face ID
// first: the money comes from the card, not from the person's Kawase wallet.
import * as React from "react";
import { View } from "react-native";
import { formatUnits } from "viem";

import { ExpressPay } from "@kawase/ui-native/components/express-pay";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useBuy } from "@/onramp/buy-provider";

const USDC_DECIMALS = 6;

export function CardTopUp({ amount, disabled }: { amount: string; disabled?: boolean }) {
  const { t } = useT();
  const buy = useBuy();
  const dollars = formatUnits(BigInt(amount || "0"), USDC_DECIMALS);
  return (
    <View className="gap-2">
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("agentWallet.cardTopUp")}</Text>
      <ExpressPay
        payLabel={t("agentWallet.expressPay")}
        orCardLabel={t("agentWallet.orCard")}
        cardLabel={t("agentWallet.cardButton")}
        disabled={disabled}
        onPay={() => buy.open({ asset: "USDC", amount: dollars, destination: "agent_wallet" })}
      />
    </View>
  );
}
