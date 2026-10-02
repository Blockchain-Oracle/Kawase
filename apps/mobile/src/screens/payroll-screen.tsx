// Payroll (cards/agent-business.md; decision X32: one backend): the same payment to several people every month, as the
// automations `payroll` kind (A3) — each line checked like a send and pinned to its person by its own grant, turned on
// with one Face ID, with Needs-you, practice runs and the underfunded retry of every automation. This screen lists the
// payrolls and drafts new ones; each card is the automation card (turn on, pause, resume, cancel and revoke). Runs,
// skips and receipts are in Automations too.
import { useFocusEffect } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { AutomationView } from "@kawase/api-client";
import { PAYROLL_MONTHDAYS } from "@kawase/config";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { Textarea } from "@kawase/ui-native/components/ui/textarea";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { parseLines } from "@/business/lines";
import { AutomationCard } from "@/chat/automation-card";
import { useT } from "@/i18n";
import { Chip } from "@/marketplace/parts";
import { api } from "@/session/api";

const DAYS = PAYROLL_MONTHDAYS;
const TEXTAREA_LINES = 5;
const SHOWN: AutomationView["status"][] = ["draft", "active", "paused"];

export function PayrollScreen() {
  const { t } = useT();
  const [list, setList] = React.useState<AutomationView[]>([]);
  const [name, setName] = React.useState("");
  const [day, setDay] = React.useState<number>(DAYS[0]);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsed = parseLines(text);

  const load = React.useCallback(async () => {
    const { automations } = await api.automations.list().catch(() => ({ automations: [] as AutomationView[] }));
    setList(automations.filter((automation) => automation.kind === "payroll" && SHOWN.includes(automation.status)));
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const create = async () => {
    setBusy(true);
    try {
      const { automation } = await api.automationsMore.payroll({ every: "month", monthday: day, lines: parsed.lines, note: name.trim() || null });
      setList((current) => [automation, ...current]);
      setName("");
      setText("");
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("business.payroll")}>
      {list.map((automation) => (
        <AutomationCard key={automation.id} output={{ automation }} />
      ))}
      <Section title={t("business.newPayroll")}>
        <Input value={name} onChangeText={setName} placeholder={t("business.payrollName")} />
        <View className="flex-row flex-wrap gap-2">
          {DAYS.map((entry) => (
            <Chip key={entry} label={t("business.monthday", { day: String(entry) })} selected={day === entry} onPress={() => setDay(entry)} />
          ))}
        </View>
        <Textarea value={text} onChangeText={setText} numberOfLines={TEXTAREA_LINES} placeholder={t("business.linesPlaceholder")} autoCapitalize="none" autoCorrect={false} />
        {parsed.bad.length > 0 ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t("business.badLines", { lines: parsed.bad.join(", ") })}</Text> : null}
        <Button disabled={busy || parsed.lines.length === 0 || parsed.bad.length > 0} onPress={() => void create()}>
          <Text>{busy ? t("common.loading") : t("business.draftPayroll", { count: String(parsed.lines.length) })}</Text>
        </Button>
        <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("business.payrollNote")}</Text>
      </Section>
    </Page>
  );
}
