// The swap card (L, Stage 6): what `propose_swap` drafted, live. The tool's output is only where it starts; the card
// then follows the intent, so a conversation reopened later shows what really happened. Ready → the quote next to
// the market rate and "Swap with Face ID" (a swap is always the owner's own yes). Blocked → the reason and its fix
// (add money, set up, try again for a price). The price can be refreshed in place; nothing is decided by the model.
import { useRouter } from "expo-router";
import { ScanFace } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { PolicyResultView, ProposeSwapOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { BrakeNote } from "@/safety/brake-note";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useSwapApproveLabel, useSwapPolicyText, useSwapPrompt } from "@/swap/copy";
import { SwapReview } from "@/swap/swap-review";
import { SwapStatus } from "@/swap/swap-status";
import { isSwapOpen, useSwap } from "@/swap/use-swap";

import { useResumeWhenFixed } from "@/intents/use-resume";

import { AgentCard } from "./card";
import { RehearsalBlock, rehearsalAllows, useRehearsal } from "./rehearsal";

export function SwapCard({ output }: { output: ProposeSwapOutput }) {
  const { t } = useT();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const controller = useSwap(output.intent);
  const approveLabel = useSwapApproveLabel();
  const policyText = useSwapPolicyText();
  const prompt = useSwapPrompt();
  const intent = controller.intent ?? output.intent;
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("swap.title")} · ${intent.network === "mainnet" ? t("network.realMoney") : networkName}`;
  // Fixed elsewhere (signed in, set up, money added): the same swap is quoted and checked again (R12).
  useResumeWhenFixed(isSwapOpen(intent) ? intent.blocking?.code : undefined, () => void controller.revise({}));

  if (!isSwapOpen(intent)) {
    return (
      <AgentCard eyebrow={eyebrow}>
        <SwapStatus intent={intent} compact connectionLost={controller.connectionLost} />
      </AgentCard>
    );
  }

  const fixFor = (blocking: PolicyResultView) => {
    switch (blocking.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("swapPolicy.fixTryAgain"), onPress: () => void controller.revise({}) };
      default:
        return undefined;
    }
  };
  const blocking = intent.blocking;
  const fix = blocking ? fixFor(blocking) : undefined;
  const ready = !blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const rehearsal = useRehearsal("swaps", intent, ready);
  return (
    <AgentCard eyebrow={eyebrow}>
      {intent.draft ? (
        <SwapReview intent={intent} compact onRefresh={() => void controller.revise({})} refreshing={controller.busy} />
      ) : (
        <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>
          {[intent.request.amount, intent.request.tokenIn].filter(Boolean).join(" ")}
          {intent.request.tokenOut ? ` → ${intent.request.tokenOut}` : ""}
        </Text>
      )}
      {blocking ? (
        <View className="gap-2">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, intent.network)}</Text>
          {fix ? (
            <Button variant="secondary" onPress={fix.onPress}>
              <Text>{fix.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
      {ready ? <BrakeNote results={intent.results} text={(entry) => policyText(entry, intent.network)} /> : null}
      {ready ? <RehearsalBlock rehearsal={rehearsal} network={intent.network} /> : null}
      <View className="gap-2">
        {ready && rehearsal?.status !== "reverted" ? (
          <Button size="lg" disabled={controller.busy || !rehearsalAllows(rehearsal)} onPress={() => void controller.approve(prompt(intent.draft, intent.network))}>
            <Icon as={ScanFace} className="text-primary-foreground size-5" />
            <Text>{controller.busy ? t("swap.swapping") : approveLabel}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
          <Text className="text-muted-foreground">{t("swap.cancel")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}
