// What 8c adds around an automation, shared by the chat card and the Automations screen: practise first or go live,
// "what would happen?" (the next runs on today's facts, the first dry-run on Arc), and editing in place (less applies
// at once; more asks for a new permission, signed with the old one's revoke in one yes).
import { FlaskConical, Pencil, Sparkles } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AutomationView, SimulationView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { useThemeColors } from "@/theme/use-theme-colors";

import { useRunReason, useRunWhen } from "./copy";
import type { useAutomation } from "./use-automation";

type Controller = ReturnType<typeof useAutomation>;
const USDC_DECIMALS = 6;
const TEN = 10n;

const plain = (baseUnits: string, decimals: number) => {
  const value = BigInt(baseUnits);
  const divisor = TEN ** BigInt(decimals);
  const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / divisor}.${fraction}` : `${value / divisor}`;
};

/** The next runs, as they would go now. */
export function SimulationList({ automation, simulation }: { automation: AutomationView; simulation: SimulationView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const runWhen = useRunWhen();
  const reason = useRunReason();
  const amountOf = (run: SimulationView["runs"][number]) =>
    run.amount && run.asset
      ? run.asset === "USDC" || run.asset === "EURC"
        ? money(run.asset, run.amount)
        : formatTokenAmount(BigInt(run.amount), automation.dca?.decimalsIn ?? USDC_DECIMALS, run.asset, locale, { trimZeros: true })
      : "";
  return (
    <View className="bg-muted gap-1.5 rounded-2xl px-3 py-2.5">
      {simulation.runs.map((run) => {
        const what =
          run.outcome === "would_send"
            ? t("automation.wouldSend", { amount: amountOf(run) })
            : run.outcome === "would_ask"
              ? t("automation.wouldAsk", { amount: amountOf(run), symbol: run.to ?? "" })
              : run.outcome === "would_wait"
                ? t("automation.wouldWait")
                : t("automation.wouldSkip", { reason: reason(run.reason, null, simulation.network) });
        return (
          <View key={run.at} className="gap-0.5">
            <Text className={cn("text-foreground text-sm", TEXT_START)}>{`${runWhen(run.at, automation.schedule.timezone)} · ${what}`}</Text>
            {run.chain ? (
              <Text className={cn("text-xs", run.chain.ok ? "text-success" : "text-destructive", TEXT_START)}>
                {run.chain.ok ? t("automation.chainOk") : t("automation.chainRefused", { error: run.chain.error ?? "" })}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Practise first (a draft), go live (a practice automation), and "what would happen?". */
export function PracticeActions({ controller, goLivePrompt }: { controller: Controller; goLivePrompt: string }) {
  const { t } = useT();
  const automation = controller.automation;
  if (!automation) return null;
  const draftReady = automation.status === "draft" && (!automation.blocking || automation.blocking.code === "WALLET_NOT_SET_UP");
  const practising = automation.status === "active" && automation.practice;
  return (
    <View className="gap-2">
      {draftReady ? (
        <Button variant="secondary" disabled={controller.busy} onPress={() => void controller.practice()}>
          <Icon as={FlaskConical} className="text-foreground size-4" />
          <Text>{t("automation.practiceFirst")}</Text>
        </Button>
      ) : null}
      {practising ? (
        <Button disabled={controller.busy} onPress={() => void controller.turnOn(goLivePrompt)}>
          <Text>{t("automation.goLive")}</Text>
        </Button>
      ) : null}
      {automation.status === "draft" || automation.status === "active" ? (
        <Button variant="ghost" size="sm" disabled={controller.busy} onPress={() => void controller.simulate()}>
          <Icon as={Sparkles} className="text-foreground size-4" />
          <Text>{t("automation.simulate")}</Text>
        </Button>
      ) : null}
      {controller.simulation ? <SimulationList automation={automation} simulation={controller.simulation} /> : null}
    </View>
  );
}

/** Edit in place: the amount per run and the time (a scheduled send or a DCA). */
export function EditAutomation({ controller }: { controller: Controller }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const automation = controller.automation;
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [time, setTime] = React.useState("");
  if (!automation || (automation.kind !== "scheduled_send" && automation.kind !== "dca")) return null;
  if (automation.status === "canceled" || automation.status === "ended") return null;
  const decimals = automation.dca?.decimalsIn ?? USDC_DECIMALS;
  const current = automation.action?.amount ?? automation.dca?.amount ?? "0";
  const start = () => {
    setAmount(plain(current, decimals));
    setTime(automation.schedule.time);
    setOpen(true);
  };
  const save = async () => {
    const change = { ...(amount.trim() && amount.trim() !== plain(current, decimals) ? { amount: amount.trim().replace(",", ".") } : {}), ...(time !== automation.schedule.time ? { time } : {}) };
    setOpen(false);
    await controller.edit(change, t("automation.editPrompt"));
  };
  return (
    <>
      <Button size="sm" variant="secondary" disabled={controller.busy} onPress={start}>
        <Icon as={Pencil} className="text-foreground size-4" />
        <Text>{t("automation.edit")}</Text>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("automation.edit")} subtitle={t("automation.editNote")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom}>
        <View className="gap-4">
          <View className="gap-2">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.editAmount")}</Text>
            <SheetInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel={t("automation.editAmount")} />
          </View>
          <View className="gap-2">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.editTime")}</Text>
            <SheetInput value={time} onChangeText={setTime} placeholder="09:00" accessibilityLabel={t("automation.editTime")} />
          </View>
          <Button disabled={controller.busy || !/^\d{1,2}:\d{2}$/.test(time)} onPress={() => void save()}>
            <Text>{t("safety.save")}</Text>
          </Button>
        </View>
      </Sheet>
    </>
  );
}
