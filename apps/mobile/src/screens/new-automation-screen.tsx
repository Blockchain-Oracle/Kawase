// A new automation without chat (cards/automate-safety.md "Entry": the Automations screen, the token page "Automate").
// Pick a template, fill in what it needs, and the api drafts it exactly as a chat request would (the same checks, the
// same read-back card): the draft appears below to practise first or turn on with Face ID. Nothing runs from here.
import { useLocalSearchParams } from "expo-router";
import { BellRing, CalendarClock, Coins, PiggyBank, Repeat, TrendingUp } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { AutomationSchedule, AutomationView, TokenView } from "@kawase/api-client";
import { MONTHLY_RUN_DAYS } from "@kawase/config";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Input } from "@kawase/ui-native/components/ui/input";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Text } from "@kawase/ui-native/components/ui/text";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useScheduleText } from "@/automations/copy";
import { AutomationCard } from "@/chat/automation-card";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { Chip } from "@/marketplace/parts";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

export type Template = "send" | "dca" | "save" | "roundups" | "alert" | "save_above";

const TEMPLATES: { id: Template; icon: typeof Repeat }[] = [
  { id: "send", icon: CalendarClock },
  { id: "dca", icon: Repeat },
  { id: "save", icon: PiggyBank },
  { id: "roundups", icon: Coins },
  { id: "alert", icon: BellRing },
  { id: "save_above", icon: TrendingUp },
];
const SCHEDULED: ReadonlySet<Template> = new Set(["send", "dca"]);
const EVERY: AutomationSchedule["every"][] = ["day", "week", "month"];
const DAYS_IN_WEEK = 7;
/** Monday first, Sunday (0) last. */
const WEEKDAYS = Array.from({ length: DAYS_IN_WEEK }, (_, index) => (index + 1) % DAYS_IN_WEEK);
const MONTHDAYS = MONTHLY_RUN_DAYS;
const ROUND_TO = ["1", "5", "10"];
const DEFAULT_TIME = "09:00";
const FRIDAY = 5;
const DECIMAL = /^\d+([.,]\d+)?$/;
const TIME = /^\d{1,2}:\d{2}$/;
/** 2026-01-04 (UTC noon) was a Sunday: weekday n is that day + n. */
const A_SUNDAY_NOON = Date.parse("2026-01-04T12:00:00Z");
const MS_PER_DAY = 86_400_000;
const SHORT_ADDRESS = 8;

const decimal = (text: string) => text.trim().replace(",", ".");

export function NewAutomationScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const signIn = useSignIn();
  const scheduleText = useScheduleText();
  const params = useLocalSearchParams<{ template?: string; token?: string; symbol?: string }>();
  const [template, setTemplate] = React.useState<Template | undefined>(TEMPLATES.some((entry) => entry.id === params.template) ? (params.template as Template) : undefined);
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [asset, setAsset] = React.useState<"USDC" | "EURC">("USDC");
  const [buy, setBuy] = React.useState<{ address: string; symbol: string; token?: TokenView } | undefined>(params.token ? { address: params.token, symbol: params.symbol ?? "" } : undefined);
  const [picking, setPicking] = React.useState(false);
  const [every, setEvery] = React.useState<AutomationSchedule["every"]>(params.template === "dca" ? "day" : "week");
  const [weekday, setWeekday] = React.useState(FRIDAY);
  const [monthday, setMonthday] = React.useState<number>(MONTHDAYS[0]);
  const [time, setTime] = React.useState(DEFAULT_TIME);
  const [line, setLine] = React.useState("");
  const [roundTo, setRoundTo] = React.useState(ROUND_TO[0]!);
  const [busy, setBusy] = React.useState(false);
  const [drafted, setDrafted] = React.useState<AutomationView[]>([]);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekdayName = (day: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(A_SUNDAY_NOON + day * MS_PER_DAY));
  const schedule = { every, ...(every === "week" ? { weekday } : {}), ...(every === "month" ? { monthday } : {}), time: time.trim(), timezone };

  const ready = (() => {
    if (!template) return false;
    if (SCHEDULED.has(template) && (!DECIMAL.test(amount.trim()) || !TIME.test(time.trim()))) return false;
    if (template === "send") return recipient.trim().length > 0;
    if (template === "dca") return Boolean(buy);
    if (template === "save") return line.trim() === "" || DECIMAL.test(line.trim());
    if (template === "alert" || template === "save_above") return DECIMAL.test(line.trim());
    return true;
  })();

  /** The api drafts it as a chat request would; the card below is the review. */
  const draft = async () => {
    if (!template) return;
    if (status !== "account") {
      signIn.open();
      return;
    }
    setBusy(true);
    try {
      const { automation } =
        template === "send"
          ? await api.automations.create({ recipient: recipient.trim(), amount: decimal(amount), asset, ...schedule })
          : template === "dca"
            ? await api.automationsMore.dca({ from: "USDC", to: buy!.address, amount: decimal(amount), ...schedule })
            : template === "save"
              ? await api.automations.autoSave({ ...(line.trim() ? { keep: decimal(line) } : {}), timezone })
              : template === "roundups"
                ? await api.automations.rule({ trigger: "money_out", action: "save", amountMode: "roundup", roundTo })
                : template === "alert"
                  ? await api.automations.rule({ trigger: "balance_below", threshold: decimal(line), action: "notify" })
                  : await api.automations.rule({ trigger: "balance_above", threshold: decimal(line), action: "save", amountMode: "excess" });
      setDrafted((current) => [automation, ...current]);
      setAmount("");
      setRecipient("");
      setLine("");
    } catch {
      toast(t("automation.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("automation.newTitle")}>
      <Section title={t("automation.newPick")}>
        <ListGroup>
          {TEMPLATES.map((entry) => (
            <ListRow
              key={entry.id}
              leading={<Icon as={entry.icon} className={cn("size-5", template === entry.id ? "text-primary" : "text-muted-foreground")} />}
              title={t(`automation.tpl_${entry.id}`)}
              subtitle={t(`automation.tpl_${entry.id}Body`)}
              chevron={template !== entry.id}
              onPress={() => setTemplate(entry.id)}
            />
          ))}
        </ListGroup>
      </Section>
      {template ? (
        <Section title={t(`automation.tpl_${template}`)}>
          {template === "send" ? (
            <>
              <Input value={recipient} onChangeText={setRecipient} placeholder={t("automation.fieldRecipient")} autoCapitalize="none" autoCorrect={false} />
              <View className="flex-row gap-2">
                {(["USDC", "EURC"] as const).map((entry) => (
                  <Chip key={entry} label={entry} selected={asset === entry} onPress={() => setAsset(entry)} />
                ))}
              </View>
            </>
          ) : null}
          {template === "dca" ? (
            <Button variant="secondary" onPress={() => setPicking(true)} className="flex-row justify-start gap-2">
              {buy?.token ? <TokenMark token={buy.token} size={24} /> : null}
              <Text>{buy ? t("automation.buys", { asset: buy.symbol || buy.address.slice(0, SHORT_ADDRESS) }) : t("automation.fieldBuy")}</Text>
            </Button>
          ) : null}
          {SCHEDULED.has(template) ? (
            <>
              <Input value={amount} onChangeText={setAmount} placeholder={template === "dca" ? t("automation.fieldAmountUsdc") : t("automation.fieldAmount")} keyboardType="decimal-pad" />
              <View className="flex-row flex-wrap gap-2">
                {EVERY.map((entry) => (
                  <Chip key={entry} label={t(`automation.every_${entry}`)} selected={every === entry} onPress={() => setEvery(entry)} />
                ))}
              </View>
              {every === "week" ? (
                <View className="flex-row flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <Chip key={day} label={weekdayName(day)} selected={weekday === day} onPress={() => setWeekday(day)} />
                  ))}
                </View>
              ) : null}
              {every === "month" ? (
                <View className="flex-row flex-wrap gap-2">
                  {MONTHDAYS.map((day) => (
                    <Chip key={day} label={t("automation.monthday", { day: String(day) })} selected={monthday === day} onPress={() => setMonthday(day)} />
                  ))}
                </View>
              ) : null}
              <Input value={time} onChangeText={setTime} placeholder={t("automation.fieldTime")} keyboardType="numbers-and-punctuation" />
              {TIME.test(time.trim()) ? <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{scheduleText(schedule)}</Text> : null}
            </>
          ) : null}
          {template === "save" ? <Input value={line} onChangeText={setLine} placeholder={t("automation.fieldKeep")} keyboardType="decimal-pad" /> : null}
          {template === "alert" || template === "save_above" ? <Input value={line} onChangeText={setLine} placeholder={t("automation.fieldLine")} keyboardType="decimal-pad" /> : null}
          {template === "roundups" ? (
            <View className="flex-row flex-wrap gap-2">
              {ROUND_TO.map((entry) => (
                <Chip key={entry} label={t("automation.roundToChip", { amount: entry })} selected={roundTo === entry} onPress={() => setRoundTo(entry)} />
              ))}
            </View>
          ) : null}
          <Button disabled={busy || !ready} onPress={() => void draft()}>
            <Text>{busy ? t("common.loading") : t("automation.newDraft")}</Text>
          </Button>
          <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("automation.newNote")}</Text>
        </Section>
      ) : null}
      <AssetPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("automation.fieldBuy")}
        mode="any"
        selected={buy?.address.toLowerCase()}
        onSelect={({ token }) => {
          setPicking(false);
          setBuy({ address: token.address, symbol: token.symbol, token });
        }}
        unavailable={(token) => (token.status === "impersonator" ? t("tokenPage.n_blocked") : token.kind === "permissioned" ? t("tokenPage.n_permissioned") : undefined)}
      />
      {/* A drafted automation appears where "Draft it" was tapped, newest first. */}
      {drafted.map((automation) => (
        <AutomationCard key={automation.id} output={{ automation }} />
      ))}
    </Page>
  );
}
