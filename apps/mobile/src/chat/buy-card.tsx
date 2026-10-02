// start_buy in the conversation: what would be bought (amount, what arrives, the token after it), on which network
// (real money, or Circle's sandbox on testnet), and one button that opens the Buy flow with those numbers; the tap
// mints the 30-minute session, so a reopened thread never holds a stale checkout. Why not, when it can't (sign in,
// set up, not here), with its fix.
import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";

import type { BuyProposalOutput } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useBuy } from "@/onramp/buy-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { AgentCard } from "./card";

const MARK = 28;

export function OnrampBuyCard({ output }: { output: BuyProposalOutput }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const colors = useThemeColors();
  const buy = useBuy();
  const signIn = useSignIn();
  const fiat = new Intl.NumberFormat(locale, { style: "currency", currency: output.currency, maximumFractionDigits: 2 }).format(Number(output.amount));
  const eyebrow = `${t("buy.title")} · ${output.network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`;
  return (
    <AgentCard eyebrow={eyebrow}>
      <View className="flex-row items-center gap-3">
        <Mark entity="provider:apple" size={MARK} variant="mono" tint={colors.foreground} disc />
        <Text className={cn("font-display text-foreground flex-1 text-xl font-bold", TEXT_START)}>{t("buy.cardReady", { amount: fiat, asset: output.asset })}</Text>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {[output.sandbox ? t("buy.sandbox") : t("buy.realMoney"), output.then ? t("buy.thenNote", { token: output.then }) : null].filter(Boolean).join(" ")}
      </Text>
      {output.available ? (
        <Button onPress={() => buy.open({ asset: output.asset, amount: output.amount, currency: output.currency, then: output.then })}>
          <Text>{t("buy.cardOpen")}</Text>
        </Button>
      ) : output.reason === "sign_in" ? (
        <Button onPress={() => signIn.open()}>
          <Text>{t("policy.fixSignIn")}</Text>
        </Button>
      ) : output.reason === "no_wallet" ? (
        <Button onPress={() => router.push("/wallet")}>
          <Text>{t("policy.fixSetUp")}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}
