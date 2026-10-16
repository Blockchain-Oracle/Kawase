// The bridge card (L, Stage 6b): what `propose_bridge` drafted, live. It follows the intent, so a conversation
// reopened later shows what really happened (arrived, still on its way, cancelled). Ready → the least that arrives
// on the other chain, the fee cap and "Bridge with Face ID". Blocked → the reason and its one fix. While the money
// crosses, the three steps show where it is.
import { useRouter } from "expo-router";
import { ScanFace } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { PolicyResultView, ProposeBridgeOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { BridgeReview } from "@/bridge/bridge-review";
import { BridgeStatus } from "@/bridge/bridge-status";
import { useBridgeApproveLabel, useBridgePolicyText, useBridgePrompt } from "@/bridge/copy";
import { useBridge } from "@/bridge/use-bridge";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { isIntentOpen } from "@/intents/use-wallet-intent";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { useResumeWhenFixed } from "@/intents/use-resume";

import { AgentCard } from "./card";
import { RehearsalBlock, rehearsalAllows, useRehearsal } from "./rehearsal";

export function BridgeCard({ output }: { output: ProposeBridgeOutput }) {
  const { t } = useT();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const controller = useBridge(output.intent);
  const approveLabel = useBridgeApproveLabel();
  const policyText = useBridgePolicyText();
  const prompt = useBridgePrompt();
  const intent = controller.intent ?? output.intent;
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("bridge.title")} · ${intent.network === "mainnet" ? t("network.realMoney") : networkName}`;
  // Fixed elsewhere (signed in, set up, money added): the same bridge is quoted and checked again (R12).
  useResumeWhenFixed(isIntentOpen(intent) ? intent.blocking?.code : undefined, () => void controller.revise({}));
  const ready = isIntentOpen(intent) && !intent.blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const rehearsal = useRehearsal("bridges", intent, ready);

  if (!isIntentOpen(intent)) {
    return (
      <AgentCard eyebrow={eyebrow}>
        <BridgeStatus intent={intent} compact connectionLost={controller.connectionLost} />
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
      case "DESTINATION_MISSING":
      case "AMOUNT_MISSING":
      case "AMOUNT_BELOW_FEE":
        return { label: t("bridge.review"), onPress: () => router.push({ pathname: "/bridge", params: { ...(intent.request.destination ? { to: intent.request.destination } : {}), ...(intent.request.amount ? { amount: intent.request.amount } : {}) } }) };
      default:
        return undefined;
    }
  };
  const blocking = intent.blocking;
  const fix = blocking ? fixFor(blocking) : undefined;
  return (
    <AgentCard eyebrow={eyebrow}>
      {intent.draft ? (
        <BridgeReview intent={intent} compact />
      ) : (
        <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>
          {[intent.request.amount ? `${intent.request.amount} USDC` : null, intent.request.destination].filter(Boolean).join(" → ")}
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
      {ready ? <RehearsalBlock control={rehearsal} network={intent.network} /> : null}
      <View className="gap-2">
        {ready && rehearsal.result?.status !== "reverted" ? (
          <Button size="lg" disabled={controller.busy || !rehearsalAllows(rehearsal.result)} onPress={() => void controller.approve(prompt(intent.draft))}>
            <Icon as={ScanFace} className="text-primary-foreground size-5" />
            <Text>{controller.busy ? t("bridge.bridging") : approveLabel}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
          <Text className="text-muted-foreground">{t("bridge.cancel")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}
