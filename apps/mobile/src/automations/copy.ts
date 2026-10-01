// Words for automations in the person's language: the schedule ("Every Tuesday at 09:00") with weekday and time
// formatted by Intl for their locale, run times, the on-chain bound, why a run was skipped, and the turn-on button
// named after the device's real check.
import * as React from "react";

import type { AutomationRunView, AutomationSchedule, AutomationView, RuleView } from "@kawase/api-client";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney, usePolicyText } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";
import { vaultTitle } from "@/earn/vault-title";

/** 2026-01-04 (UTC noon) was a Sunday: weekday n is that instant + n days. Midnight that day formats a bare time. */
const A_SUNDAY_MIDNIGHT = Date.parse("2026-01-04T00:00:00Z");
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const NOON_HOUR = 12;
const NOON_MS = NOON_HOUR * MS_PER_HOUR;
const MS_PER_DAY = 86_400_000;
const PER: Record<AutomationSchedule["every"], string> = { day: "automation.perDay", week: "automation.perWeek", month: "automation.perMonth" };

export function useScheduleText() {
  const { t } = useT();
  const { locale } = useLocale();
  return (schedule: AutomationSchedule) => {
    const [hour = 0, minute = 0] = schedule.time.split(":").map(Number);
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(A_SUNDAY_MIDNIGHT + hour * MS_PER_HOUR + minute * MS_PER_MINUTE));
    if (schedule.every === "day") return t("automation.everyDay", { time });
    if (schedule.every === "week") {
      const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(A_SUNDAY_MIDNIGHT + NOON_MS + (schedule.weekday ?? 0) * MS_PER_DAY));
      return t("automation.everyWeek", { weekday, time });
    }
    return t("automation.everyMonth", { day: String(schedule.monthday ?? 1), time });
  };
}

/** A run's time in the automation's own zone, the way the person reads dates. */
export function useRunWhen() {
  const { locale } = useLocale();
  return (iso: string, timezone: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

export function useBoundText() {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  return (automation: AutomationView) => {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(automation.endsAt));
    if (automation.save) return t("automation.saveBound", { vault: vaultTitle(automation.save.vaultName), date });
    const step = automation.rule?.step;
    if (step?.type === "bridge") return t("automation.ruleBoundBridge", { chain: step.destinationName, date });
    if (step?.type === "save") return t("automation.ruleBoundSave", { vault: vaultTitle(step.vaultName), date });
    if (step?.type === "notify") return t("automation.ruleBoundNotify");
    return t("automation.bound", { amount: money(automation.action?.asset ?? "USDC", automation.maxPerPeriod), per: t(PER[automation.schedule.every]), date });
  };
}

/** A rule in words: when it fires, what it does and how much, and where it stands now. */
export function useRuleText() {
  const { t } = useT();
  const money = useMoney();
  return {
    when: (rule: RuleView) => {
      const trigger = rule.trigger;
      if (trigger.type !== "money_in") return t(trigger.type === "balance_above" ? "automation.ruleAbove" : "automation.ruleBelow", { amount: money("USDC", trigger.threshold) });
      const name = trigger.fromName ?? trigger.from ?? "";
      if (name && trigger.minAmount) return t("automation.ruleMoneyInFromMin", { name, amount: money("USDC", trigger.minAmount) });
      if (name) return t("automation.ruleMoneyInFrom", { name });
      if (trigger.minAmount) return t("automation.ruleMoneyInMin", { amount: money("USDC", trigger.minAmount) });
      return t("automation.ruleMoneyIn");
    },
    what: (rule: RuleView) => {
      const amount = rule.amount;
      const how =
        amount.mode === "fixed"
          ? money("USDC", amount.amount)
          : amount.mode === "percent"
            ? t("automation.ruleHowPercent", { percent: `${amount.percent}%` })
            : t("automation.ruleHowExcess", { amount: money("USDC", amount.reserve) });
      const step = rule.step;
      if (step.type === "bridge") return t("automation.ruleBridge", { how, chain: step.destinationName });
      if (step.type === "save") return t("automation.ruleSave", { how, vault: vaultTitle(step.vaultName) });
      return t("automation.ruleNotify");
    },
    cadence: (rule: RuleView) => t(rule.trigger.type === "money_in" ? "automation.ruleChecksMoneyIn" : "automation.ruleChecksBalance"),
    state: (rule: RuleView) => (rule.trigger.type === "money_in" ? null : t(rule.armed ? "automation.ruleArmed" : "automation.ruleDisarmed")),
    now: (rule: RuleView) =>
      rule.now ? (rule.now.amount ? t("automation.ruleNowMove", { amount: money("USDC", rule.now.amount) }) : t("automation.ruleNowAlert")) : t("automation.ruleNowNone"),
  };
}

/** What one run did, in words: sent, or for Auto-save how much it saved or topped up. */
export function useRunLabel() {
  const { t } = useT();
  const money = useMoney();
  const reasonText = useRunReason();
  return (run: AutomationRunView, automation: AutomationView) => {
    if (run.status === "skipped") return `${t("automation.runSkipped")} · ${reasonText(run.reason, run.reasonParams, automation.network)}`;
    if (run.status === "failed") return t("automation.runFailed");
    if (automation.rule) {
      if (run.status === "executing" || run.status === "pending") return t("automation.runMoving");
      const step = automation.rule.step;
      const decided = run.trigger?.amount;
      if (step.type === "notify") return t("automation.runAlerted", { amount: money("USDC", run.trigger?.balance ?? "0") });
      if (step.type === "bridge") return t("automation.runBridged", { amount: money("USDC", decided ?? "0"), chain: step.destinationName });
      return t("automation.runSaved", { amount: money("USDC", decided ?? "0") });
    }
    if (automation.kind === "auto_save") {
      if (run.status === "executing" || !run.move) return t("automation.runMoving");
      return t(run.move.direction === "in" ? "automation.runSaved" : "automation.runToppedUp", { amount: money("USDC", run.move.amount) });
    }
    return run.status === "succeeded" ? t("automation.runSucceeded") : t("automation.runExecuting");
  };
}

/** Why a run did not go: Kawase's own reasons, or the send rule that stopped it. */
export function useRunReason() {
  const { t, i18n } = useT();
  const policyText = usePolicyText();
  return (reason: string | null, params: Record<string, string> | null, network: AutomationView["network"]) => {
    if (!reason) return "";
    const key = `automation.reason_${reason}`;
    return i18n.exists(key) ? t(key) : policyText({ code: reason as never, kind: "policy", ...(params ? { params } : {}) }, network);
  };
}

const TURN_ON: Record<BiometricKind, string> = {
  faceId: "automation.turnOnFaceId",
  touchId: "automation.turnOnTouchId",
  face: "automation.turnOnFace",
  fingerprint: "automation.turnOnFingerprint",
  passcode: "automation.turnOnPasscode",
  emailCode: "automation.turnOnEmailCode",
  none: "automation.turnOnFaceId",
};

export function useTurnOnLabel() {
  const { t } = useT();
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  return t(TURN_ON[kind]);
}
