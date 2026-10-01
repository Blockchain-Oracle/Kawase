// The automation card (Stage 8): what `draft_automation` or `draft_auto_save` drafted — the read-back, the next runs
// (or, for Auto-save, what it keeps ready and what would move now), the on-chain bound —
// and one button named after the device's real check that signs the grant and turns it on. Blocked → the reason and
// its one fix (add the contact, which drafts it again with the same words; set up; sign in). Once on, the card is the
// automation's live state, with a way to manage it.
import { useRouter } from "expo-router";
import { ScanFace } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { ProposeAutomationOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AutomationSummary } from "@/automations/automation-summary";
import { useScheduleText, useTurnOnLabel } from "@/automations/copy";
import { useAutomation } from "@/automations/use-automation";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useT } from "@/i18n";
import { canonicalFromBase } from "@/send/amount-step";
import { nameFromWords, useMoney, usePolicyText } from "@/send/copy";
import { api } from "@/session/api";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { AgentCard } from "./card";

export function AutomationCard({ output }: { output: ProposeAutomationOutput }) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const money = useMoney();
  const policyText = usePolicyText();
  const scheduleText = useScheduleText();
  const turnOnLabel = useTurnOnLabel();
  const controller = useAutomation(output.automation.id ? output.automation : undefined);
  const automation = controller.automation ?? output.automation;
  const [adding, setAdding] = React.useState(false);
  const networkName = automation.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("automation.title")} · ${automation.network === "mainnet" ? t("network.realMoney") : networkName}`;
  const blocking = automation.blocking;
  const a = automation.action;
  const prompt = automation.save
    ? t("automation.saveSignPrompt", { amount: money("USDC", automation.save.keep) })
    : a
      ? t("automation.signPrompt", { readBack: `${scheduleText(automation.schedule)}: ${t("automation.sendTo", { amount: money(a.asset, a.amount), name: a.recipientName ?? nameFromWords(a.recipientWords) })}` })
      : t("automation.title");

  /** After a fix, the same words make a new draft (the person never repeats themselves). */
  const redraft = async () => {
    if (!a) return;
    const { automation: fresh } = await api.automations.create({
      recipient: a.recipientWords,
      amount: canonicalFromBase(BigInt(a.amount), a.asset),
      asset: a.asset,
      every: automation.schedule.every,
      weekday: automation.schedule.weekday,
      monthday: automation.schedule.monthday,
      time: automation.schedule.time,
      timezone: automation.schedule.timezone,
      note: a.note,
    });
    controller.set(fresh);
  };

  const fix =
    blocking?.code === "SIGN_IN_REQUIRED"
      ? { label: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : blocking?.code === "RECIPIENT_UNKNOWN" && a
        ? { label: t("policy.fixAddContact", { name: nameFromWords(a.recipientWords) }), onPress: () => setAdding(true) }
        : blocking?.code === "AUTO_SAVE_EXISTS"
          ? { label: t("automation.manage"), onPress: () => router.push("/automations") }
          : blocking?.code === "WALLET_NOT_SET_UP" || blocking?.code === "WALLET_NOT_READY"
            ? { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
            : undefined;

  return (
    <AgentCard eyebrow={eyebrow}>
      <AutomationSummary automation={automation} compact />
      {blocking ? (
        <View className="gap-2">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, automation.network)}</Text>
          {fix ? (
            <Button variant="secondary" onPress={fix.onPress}>
              <Text>{fix.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : automation.status === "draft" ? (
        <Button size="lg" disabled={controller.busy || !automation.id} onPress={() => void controller.turnOn(prompt)}>
          <Icon as={ScanFace} className="text-primary-foreground size-5" />
          <Text>{controller.busy ? t("automation.turningOn") : turnOnLabel}</Text>
        </Button>
      ) : (
        <View className="gap-2">
          {automation.status === "active" ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.onBody")}</Text> : null}
          <Button variant="secondary" onPress={() => router.push("/automations")}>
            <Text>{t("automation.manage")}</Text>
          </Button>
        </View>
      )}
      {a ? (
        <AddContactSheet open={adding} onClose={() => setAdding(false)} initialName={nameFromWords(a.recipientWords)} onSaved={() => {
          setAdding(false);
          void redraft();
        }} />
      ) : null}
    </AgentCard>
  );
}
