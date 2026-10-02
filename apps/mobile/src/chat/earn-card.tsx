// The earn cards (L, Stage 6c). `get_earn`: the vaults with their real marks and yields, and the person's positions,
// from the same data the tool read. `propose_earn`: a deposit or withdrawal drafted, live — it follows the intent, so
// a reopened conversation shows what really happened; ready → the review and one button named after the device's
// real check; blocked → the reason and its one fix.
import { useRouter } from "expo-router";
import { ScanFace } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { EarnOverviewLine, PolicyResultView, ProposeEarnOutput } from "@kawase/api-client";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useEarnApproveLabel, useEarnPolicyText, useEarnPrompt } from "@/earn/copy";
import { EarnReview } from "@/earn/earn-review";
import { EarnStatus } from "@/earn/earn-status";
import { useEarn } from "@/earn/use-earn";
import { useEarnOverview } from "@/earn/use-earn-overview";
import { VaultRow } from "@/earn/vault-row";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { isIntentOpen } from "@/intents/use-wallet-intent";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { useResumeWhenFixed } from "@/intents/use-resume";

import { AgentCard } from "./card";

const MAX_VAULTS = 4;
const NOTHING = 0n;

/** `get_earn`: the vaults on this network now (read again, so yields are current) and what the person holds. */
export function EarnOverviewCard({ output }: { output: EarnOverviewLine }) {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const overview = useEarnOverview();
  const networkName = output.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  return (
    <AgentCard eyebrow={`${t("earn.title")} · ${networkName}`}>
      {overview.held > NOTHING ? (
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("earn.homePosition", { amount: money("USDC", overview.held.toString()) })}</Text>
      ) : null}
      {overview.vaults && overview.vaults.length > 0 ? (
        <ListGroup>
          {overview.vaults.slice(0, MAX_VAULTS).map((vault) => (
            <VaultRow key={vault.address} vault={vault} network={output.network} onPress={() => router.push("/earn")} />
          ))}
        </ListGroup>
      ) : (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("earn.noVaults")}</Text>
      )}
      <Button variant="secondary" onPress={() => router.push("/earn")}>
        <Text>{t("earn.title")}</Text>
      </Button>
    </AgentCard>
  );
}

export function EarnCard({ output }: { output: ProposeEarnOutput }) {
  const { t } = useT();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const controller = useEarn(output.intent);
  const approveLabel = useEarnApproveLabel();
  const policyText = useEarnPolicyText();
  const prompt = useEarnPrompt();
  const intent = controller.intent ?? output.intent;
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("earn.title")} · ${intent.network === "mainnet" ? t("network.realMoney") : networkName}`;
  // Fixed elsewhere (signed in, set up, money added): the same deposit or withdrawal is checked again (R12).
  useResumeWhenFixed(isIntentOpen(intent) ? intent.blocking?.code : undefined, () => void controller.revise({}));

  if (!isIntentOpen(intent)) {
    return (
      <AgentCard eyebrow={eyebrow}>
        <EarnStatus intent={intent} compact connectionLost={controller.connectionLost} />
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
      default:
        return { label: t("earn.title"), onPress: () => router.push("/earn") };
    }
  };
  const blocking = intent.blocking;
  const fix = blocking ? fixFor(blocking) : undefined;
  const ready = !blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const action = intent.draft?.action ?? intent.request.action;
  return (
    <AgentCard eyebrow={eyebrow}>
      {intent.draft ? (
        <EarnReview intent={intent} compact />
      ) : (
        <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>
          {[t(`earn.${action}`), intent.request.amount ? `${intent.request.amount} USDC` : null].filter(Boolean).join(" · ")}
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
      <View className="gap-2">
        {ready ? (
          <Button size="lg" disabled={controller.busy} onPress={() => void controller.approve(prompt(intent.draft))}>
            <Icon as={ScanFace} className="text-primary-foreground size-5" />
            <Text>{controller.busy ? (action === "deposit" ? t("earn.depositing") : t("earn.withdrawing")) : approveLabel(action)}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
          <Text className="text-muted-foreground">{t("earn.cancel")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}
