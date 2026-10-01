// An automation said in full, shared by the chat card and the automations screen: who and how much (the recipient's
// avatar, the amount in the display face), when (the schedule in the person's words), its state in words, the next
// runs in its own time zone, and the bound the chain enforces — never colour alone. Auto-save says what it keeps
// ready, where the rest goes and what it earns, when it checks, what a check would move now, and its bound (only
// between the wallet and the person's own savings). The screen adds recent runs, each with what happened and why.
import { ArrowDownUp, Bell, CircleCheck, CircleMinus, CircleX, Clock, Radar, ShieldCheck, Sparkles } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, View } from "react-native";

import type { AutomationView } from "@kawase/api-client";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Mark } from "@kawase/ui-native/components/mark";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { usePercent } from "@/earn/copy";
import { protocolEntity } from "@/earn/vault-row";
import { useT } from "@/i18n";
import { nameFromWords, shortAddress, useMoney } from "@/send/copy";

import { arcIdentity, chainKey } from "@kawase/identity";

import { useBoundText, useRuleText, useRunLabel, useRunWhen, useScheduleText } from "./copy";
import { vaultTitle } from "@/earn/vault-title";

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

function Line({ icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start gap-2">
      <Icon as={icon} className="text-muted-foreground mt-0.5 size-3.5" />
      <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{children}</Text>
    </View>
  );
}

function Runs({ automation }: { automation: AutomationView }) {
  const { t } = useT();
  const runWhen = useRunWhen();
  const runLabel = useRunLabel();
  if (automation.runs.length === 0) return null;
  return (
    <View className="gap-1.5">
      <Eyebrow>{t("automation.lastRuns")}</Eyebrow>
      {automation.runs.map((run) => {
        const icon = run.status === "succeeded" ? CircleCheck : run.status === "skipped" ? CircleMinus : run.status === "failed" ? CircleX : Clock;
        const row = (
          <View className="flex-row items-start gap-2">
            <Icon as={icon} className={cn("mt-0.5 size-4", run.status === "succeeded" ? "text-success" : run.status === "failed" ? "text-destructive" : "text-muted-foreground")} />
            <View className="flex-1">
              <Text className={cn("text-foreground text-sm", TEXT_START)}>{runWhen(run.scheduledFor, automation.schedule.timezone)}</Text>
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{runLabel(run, automation)}</Text>
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
  );
}

function Bound({ automation }: { automation: AutomationView }) {
  const bound = useBoundText();
  return (
    <View className="bg-muted flex-row items-start gap-2 rounded-2xl px-3 py-2.5">
      <Icon as={ShieldCheck} className="text-success mt-0.5 size-4" />
      <Text className={cn("text-foreground flex-1 text-xs leading-5", TEXT_START)}>{bound(automation)}</Text>
    </View>
  );
}

function SaveSummary({ automation, compact, showRuns }: { automation: AutomationView; compact?: boolean | undefined; showRuns?: boolean | undefined }) {
  const { t } = useT();
  const money = useMoney();
  const percent = usePercent();
  const scheduleText = useScheduleText();
  const save = automation.save!;
  const keep = money("USDC", save.keep);
  const live = automation.status === "draft" || automation.status === "active";
  const now = save.now
    ? t(save.now.direction === "in" ? "automation.saveNowIn" : "automation.saveNowOut", { amount: money("USDC", save.now.amount) })
    : t("automation.saveNowNone");
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Mark entity={protocolEntity(save.protocol)} size={AVATAR} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={2} className={cn("font-display text-foreground font-bold", compact ? "text-lg" : "text-xl", TEXT_START)}>
            {t("automation.saveKeep", { amount: keep })}
          </Text>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.saveRest", { apy: percent(save.apy), vault: vaultTitle(save.vaultName) })}</Text>
        </View>
        <StateLabel>{t(STATUS_KEY[automation.status])}</StateLabel>
      </View>
      <View className="gap-1">
        <Line icon={Clock}>{t("automation.saveWhen", { schedule: scheduleText(automation.schedule) })}</Line>
        <Line icon={ArrowDownUp}>{save.topUp ? t("automation.saveTopUp", { amount: keep }) : t("automation.saveNoTopUp")}</Line>
        {live ? <Line icon={Sparkles}>{automation.status === "draft" ? now : t("automation.saveSaved", { amount: money("USDC", save.saved) })}</Line> : null}
      </View>
      {automation.status !== "canceled" && automation.status !== "ended" ? <Bound automation={automation} /> : null}
      {showRuns ? <Runs automation={automation} /> : null}
    </View>
  );
}

function RuleSummary({ automation, compact, showRuns }: { automation: AutomationView; compact?: boolean | undefined; showRuns?: boolean | undefined }) {
  const { t } = useT();
  const text = useRuleText();
  const rule = automation.rule!;
  const step = rule.step;
  const live = automation.status === "draft" || automation.status === "active";
  const ids = arcIdentity(automation.network);
  const state = text.state(rule);
  const mark =
    step.type === "bridge" ? (
      <Mark entity={ids.usdc} chainBadge={chainKey(step.chainId)} size={AVATAR} />
    ) : step.type === "save" ? (
      <Mark entity={protocolEntity(step.protocol)} size={AVATAR} />
    ) : (
      <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
        <Icon as={Bell} className="text-foreground size-5" />
      </View>
    );
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        {mark}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={3} className={cn("font-display text-foreground font-bold", compact ? "text-lg" : "text-xl", TEXT_START)}>
            {text.when(rule)}
          </Text>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{text.what(rule)}</Text>
        </View>
        <StateLabel>{t(STATUS_KEY[automation.status])}</StateLabel>
      </View>
      <View className="gap-1">
        <Line icon={Radar}>{text.cadence(rule)}</Line>
        {live && state ? <Line icon={Clock}>{state}</Line> : null}
        {live && rule.trigger.type !== "money_in" ? <Line icon={Sparkles}>{text.now(rule)}</Line> : null}
      </View>
      {automation.status !== "canceled" && automation.status !== "ended" ? <Bound automation={automation} /> : null}
      {showRuns ? <Runs automation={automation} /> : null}
    </View>
  );
}

export function AutomationSummary({ automation, compact, showRuns }: { automation: AutomationView; compact?: boolean; showRuns?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const scheduleText = useScheduleText();
  const runWhen = useRunWhen();
  if (automation.kind === "auto_save" && automation.save) return <SaveSummary automation={automation} compact={compact} showRuns={showRuns} />;
  if (automation.kind === "rule" && automation.rule) return <RuleSummary automation={automation} compact={compact} showRuns={showRuns} />;
  const a = automation.action;
  if (!a) return null;
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

      {a.amount !== "0" && automation.status !== "canceled" && automation.status !== "ended" ? <Bound automation={automation} /> : null}
      {showRuns ? <Runs automation={automation} /> : null}
    </View>
  );
}
