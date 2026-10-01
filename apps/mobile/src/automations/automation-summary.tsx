// An automation said in full, shared by the chat card and the automations screen: who and how much (the recipient's
// avatar, the amount in the display face), when (the schedule in the person's words), its state in words, the next
// runs in its own time zone, and the bound the chain enforces — never colour alone. The screen adds recent runs, each
// with what happened and, when one did not go, why.
import { CircleCheck, CircleMinus, CircleX, Clock, ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, View } from "react-native";

import type { AutomationView } from "@kawase/api-client";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { nameFromWords, shortAddress, useMoney } from "@/send/copy";

import { useBoundText, useRunReason, useRunWhen, useScheduleText } from "./copy";

const AVATAR = 44;
const NEXT_RUNS_COMPACT = 2;
const NEXT_RUNS_FULL = 3;
const STATUS_KEY: Record<AutomationView["status"], string> = {
  draft: "automation.statusDraft",
  active: "automation.statusOn",
  paused: "automation.statusPaused",
  canceled: "automation.statusCanceled",
  ended: "automation.statusEnded",
};

export function AutomationSummary({ automation, compact, showRuns }: { automation: AutomationView; compact?: boolean; showRuns?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const scheduleText = useScheduleText();
  const runWhen = useRunWhen();
  const bound = useBoundText();
  const reasonText = useRunReason();
  const a = automation.action;
  const name = a.recipientName ?? (a.recipientAddress ? shortAddress(a.recipientAddress) : nameFromWords(a.recipientWords));
  const live = automation.status === "draft" || automation.status === "active";
  const seed = (a.recipientAddress ?? a.recipientWords).toLowerCase();

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <DefaultAvatar seed={seed} size={AVATAR} label={name} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={2} className={cn("font-display text-foreground font-bold", compact ? "text-lg" : "text-xl", TEXT_START)}>
            {a.amount !== "0" ? t("automation.sendTo", { amount: money(a.asset, a.amount), name }) : name}
          </Text>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{scheduleText(automation.schedule)}</Text>
        </View>
        <StateLabel>{t(STATUS_KEY[automation.status])}</StateLabel>
      </View>

      {live && automation.nextRuns.length > 0 ? (
        <View className="gap-1">
          <Eyebrow>{t("automation.nextRuns")}</Eyebrow>
          {automation.nextRuns.slice(0, compact ? NEXT_RUNS_COMPACT : NEXT_RUNS_FULL).map((iso) => (
            <View key={iso} className="flex-row items-center gap-2">
              <Icon as={Clock} className="text-muted-foreground size-3.5" />
              <Text className={cn("text-foreground text-sm", TEXT_START)}>{runWhen(iso, automation.schedule.timezone)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {a.amount !== "0" && automation.status !== "canceled" && automation.status !== "ended" ? (
        <View className="bg-muted flex-row items-start gap-2 rounded-2xl px-3 py-2.5">
          <Icon as={ShieldCheck} className="text-success mt-0.5 size-4" />
          <Text className={cn("text-foreground flex-1 text-xs leading-5", TEXT_START)}>{bound(automation)}</Text>
        </View>
      ) : null}

      {showRuns && automation.runs.length > 0 ? (
        <View className="gap-1.5">
          <Eyebrow>{t("automation.lastRuns")}</Eyebrow>
          {automation.runs.map((run) => {
            const icon = run.status === "succeeded" ? CircleCheck : run.status === "skipped" ? CircleMinus : run.status === "failed" ? CircleX : Clock;
            const label =
              run.status === "succeeded"
                ? t("automation.runSucceeded")
                : run.status === "skipped"
                  ? `${t("automation.runSkipped")} · ${reasonText(run.reason, run.reasonParams, automation.network)}`
                  : run.status === "failed"
                    ? t("automation.runFailed")
                    : t("automation.runExecuting");
            const row = (
              <View className="flex-row items-start gap-2">
                <Icon as={icon} className={cn("mt-0.5 size-4", run.status === "succeeded" ? "text-success" : run.status === "failed" ? "text-destructive" : "text-muted-foreground")} />
                <View className="flex-1">
                  <Text className={cn("text-foreground text-sm", TEXT_START)}>{runWhen(run.scheduledFor, automation.schedule.timezone)}</Text>
                  <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{label}</Text>
                </View>
              </View>
            );
            return run.tx ? (
              <Pressable key={run.id} accessibilityRole="link" onPress={() => void Linking.openURL(run.tx!.explorerUrl)} className="active:opacity-70">
                {row}
              </Pressable>
            ) : (
              <View key={run.id}>{row}</View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
