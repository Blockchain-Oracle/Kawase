// propose_withdraw in the conversation (plan §C card 11, "withdraw: destination mark, conversions, bridge line"): where
// it goes with its mark, one line per asset (as itself or converted, the route, what arrives), a warning where an
// exchange would not credit an asset, and one button that opens Withdraw with this plan to review and confirm with
// Face ID. Nothing moves from the card itself (R5).
import { useRouter } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { WithdrawProposalOutput } from "@kawase/api-client";
import { chainKey, exchangeKey, walletKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { tokenAmount } from "@/portfolio/format";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useDestinationName, useLegRoute, useWithdrawReason } from "@/withdraw/copy";
import { withdrawHref } from "@/withdraw/href";

import { AgentCard } from "./card";

const MARK = 32;
const LINE_MARK = 24;

export function WithdrawCard({ output }: { output: WithdrawProposalOutput }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { status } = useSession();
  const signIn = useSignIn();
  const name = useDestinationName();
  const route = useLegRoute();
  const reason = useWithdrawReason();
  const { plan, input } = output;
  const destination = plan.destination;
  const mark = destination ? (destination.kind === "exchange" && destination.brand ? exchangeKey(destination.brand) : destination.brand ? walletKey(destination.brand) : destination.chain.chainId ? chainKey(destination.chain.chainId) : "") : "";
  const eyebrow = `${t("withdraw.title")} · ${plan.network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`;
  const open = () => (status === "account" ? router.push(withdrawHref({ ...input, place: input.place ?? destination?.placeId ?? null })) : signIn.open());
  return (
    <AgentCard eyebrow={eyebrow}>
      <View className="flex-row items-center gap-3">
        {mark ? <Mark entity={mark} size={MARK} /> : null}
        <View className="min-w-0 flex-1">
          <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{destination ? t("withdraw.cardTo", { to: name(destination) }) : t("withdraw.title")}</Text>
          {destination ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("withdraw.onChain", { chain: destination.chain.name })}</Text> : null}
        </View>
      </View>
      {plan.legs.map((leg) => (
        <View key={leg.token.address} className="gap-1">
          <View className="flex-row items-center gap-2">
            <TokenMark token={leg.token} size={LINE_MARK} />
            <Text className={cn("text-foreground flex-1 text-sm font-semibold", TEXT_START)}>{tokenAmount(leg.amount, leg.token.decimals, leg.token.symbol, locale)}</Text>
            <Icon as={ArrowRight} className="text-muted-foreground size-3.5 rtl:-scale-x-100" />
            <Text className="text-foreground text-sm">{leg.receive.amountText ? `${leg.as === "cash" ? "≈ " : ""}${leg.receive.amountText} ${leg.receive.symbol}` : leg.receive.symbol}</Text>
          </View>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{route(leg)}</Text>
          {leg.reason ? (
            <Text className={cn("text-xs leading-4", leg.status === "blocked" ? "text-destructive" : "text-warning", TEXT_START)}>
              {reason(leg.reason, { exchange: destination?.exchange?.name, symbol: leg.token.symbol, chain: leg.receive.chain, network: destination?.exchange?.networkLabel })}
            </Text>
          ) : null}
        </View>
      ))}
      {plan.blocking && plan.blocking !== "needs_address" && plan.blocking !== "no_destination" ? (
        <Text className={cn("text-destructive text-sm", TEXT_START)}>{reason(plan.blocking, { exchange: destination?.exchange?.name, chain: destination?.chain.name })}</Text>
      ) : null}
      <Button onPress={open}>
        <Text>{status === "account" ? t("withdraw.cardOpen") : t("signIn.title")}</Text>
      </Button>
    </AgentCard>
  );
}
