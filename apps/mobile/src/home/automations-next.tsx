// Home's "Automations" (surfaces.md Home §9; plan §D "Automations: next runs"): what runs next, soonest first — each
// scheduled automation by its next run in its own time zone ("Tue 7 Oct, 09:00"), practice ones marked — and the
// rules that are watching, up to three rows; each opens Automations. Hidden while there are none (First steps
// carries the first one).
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeftRight, FlaskConical, PiggyBank, Radar, Send } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { AutomationView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useRuleText, useRunWhen } from "@/automations/copy";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { nameFromWords, shortAddress, useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const SHOWN = 3;
const ICON_BOX = 36;
const LIVE = new Set<AutomationView["status"]>(["active"]);

/** An automation in a few words: "Send 20 USDC to Mia", "Keep 100 USDC ready", "Swap 10 USDC to EURC". */
export function useAutomationTitle() {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const rule = useRuleText();
  return (automation: AutomationView): string => {
    if (automation.save) return t("automation.saveKeep", { amount: money("USDC", automation.save.keep) });
    if (automation.dca)
      return t("automation.dca", {
        amount: formatTokenAmount(
          BigInt(automation.dca.amount),
          automation.dca.decimalsIn,
          automation.dca.symbolIn,
          locale,
          { trimZeros: true },
        ),
        symbolOut: automation.dca.symbolOut,
      });
    if (automation.rule) return rule.when(automation.rule);
    const action = automation.action;
    if (!action) return t("automation.title");
    const name =
      action.recipientName ??
      (action.recipientAddress ? shortAddress(action.recipientAddress) : nameFromWords(action.recipientWords));
    return action.amount !== "0" ? t("automation.sendTo", { amount: money(action.asset, action.amount), name }) : name;
  };
}

const iconOf = (automation: AutomationView) =>
  automation.practice
    ? FlaskConical
    : automation.save
      ? PiggyBank
      : automation.dca
        ? ArrowLeftRight
        : automation.rule
          ? Radar
          : Send;

/** The person's automations on this network, read when Home is in front (First steps and the section share it). */
export function useHomeAutomations() {
  const { status, user } = useSession();
  const [automations, setAutomations] = React.useState<AutomationView[]>();
  const account = status === "account";
  const network = user?.activeNetwork;
  useFocusEffect(
    React.useCallback(() => {
      if (!account || !network) return;
      let alive = true;
      api.automations
        .list()
        .then(({ automations: list }) => alive && setAutomations(list))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [account, network]),
  );
  return automations;
}

export function AutomationsNext({ automations = [] }: { automations: AutomationView[] | undefined }) {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const title = useAutomationTitle();
  const runWhen = useRunWhen();
  const network = user?.activeNetwork;

  const live = automations.filter((automation) => LIVE.has(automation.status) && automation.network === network);
  const scheduled = live
    .filter((automation) => automation.nextRuns.length > 0)
    .sort((a, b) => new Date(a.nextRuns[0]!).getTime() - new Date(b.nextRuns[0]!).getTime());
  const watching = live.filter((automation) => automation.nextRuns.length === 0 && automation.rule);
  const rows = [...scheduled, ...watching].slice(0, SHOWN);
  if (rows.length === 0) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Eyebrow className="px-1">{t("automation.title")}</Eyebrow>
        <Button variant="ghost" size="sm" onPress={() => router.push("/automations")}>
          <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
        </Button>
      </View>
      <ListGroup>
        {rows.map((automation) => {
          const next = automation.nextRuns[0];
          const when = next
            ? t("home.nextRun", { when: runWhen(next, automation.schedule.timezone) })
            : t("home.watching");
          return (
            <ListRow
              key={automation.id}
              title={title(automation)}
              subtitle={automation.practice ? `${when} · ${t("automation.practising")}` : when}
              leading={
                <View
                  className="bg-muted items-center justify-center rounded-full"
                  style={{ width: ICON_BOX, height: ICON_BOX }}
                >
                  <Icon as={iconOf(automation)} className="text-foreground size-4" />
                </View>
              }
              chevron
              onPress={() => router.push("/automations")}
            />
          );
        })}
      </ListGroup>
    </View>
  );
}
