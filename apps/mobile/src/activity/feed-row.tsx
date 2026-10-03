// One outcome in Activity (list-row grammar, F10/F22): its face — the counterparty's avatar with the token's real mark,
// a swap's two marks overlapping, a bridge's token on its chain, an automation's clock — a title that says what it was
// and a muted line that says where it stands (the time; or checking, skipped and why, practice, waiting for you), and
// the amount at the end with its sign, so colour is never the only signal (DESIGN.md). A withdrawal is one row
// ("Withdrawn to Kraken") that opens into its steps, with "Finish it" while it is not done (money-out.md).
import { useRouter } from "expo-router";
import { CalendarClock, ChevronDown, FlaskConical, Hand } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { FeedItem } from "@kawase/api-client";
import { chainKey, exchangeKey, getChainIdentity, walletKey } from "@kawase/identity";
import { formatTokenAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Mark } from "@kawase/ui-native/components/mark";
import { ProcessTimeline } from "@kawase/ui-native/components/process-timeline";
import { Button } from "@kawase/ui-native/components/ui/button";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_PRESSABLE } from "@kawase/ui-native/lib/wide";

import { useRunReason } from "@/automations/copy";
import { vaultTitle } from "@/earn/vault-title";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useDestinationName, useStepTitle } from "@/withdraw/copy";

import { shortAddress } from "./activity-row";

const AVATAR = 44;
const BADGE = 18;
const SWAP_MARK = 30;

export function useFeedText() {
  const { t } = useT();
  const { locale } = useLocale();
  const reason = useRunReason();
  const destination = useDestinationName();
  const money = (amount: string | null, token: FeedItem["token"]) =>
    amount && token ? formatTokenAmount(BigInt(amount), token.decimals, token.symbol, locale, { trimZeros: true }) : "";
  const name = (item: FeedItem) => {
    if (item.contactName) return item.contactName;
    if (item.counterpartyLabel === "circle_faucet") return t("activity.circleFaucet");
    if (item.counterpartyLabel === "kawase_agent") return t("activity.kawaseAgent");
    if (item.counterpartyLabel === "kawase_relayer") return t("common.appName");
    if (item.counterpartyLabel === "self") return t("activity.self");
    return item.counterparty ? shortAddress(item.counterparty) : "";
  };
  const title = (item: FeedItem) => {
    switch (item.kind) {
      case "receive":
        return t("activity.fromName", { name: name(item) });
      case "send":
        return t("activity.toName", { name: name(item) });
      case "request_paid":
        return t("activityFeed.requestPaid", { name: name(item) });
      case "faucet":
        return t("activity.circleFaucet");
      case "swap":
        return t("activity.swappedTitle", { from: item.other?.token.symbol ?? "", to: item.token?.symbol ?? "" });
      case "bridge":
        return t("activity.bridgedTo", {
          chain: item.bridge ? (getChainIdentity(item.bridge.chainId)?.name ?? t("bridge.title")) : t("bridge.title"),
        });
      case "earn":
        return item.earn
          ? t(item.earn.action === "deposit" ? "activity.depositedInto" : "activity.withdrewFrom", {
              vault: vaultTitle(item.earn.vault),
            })
          : t("earn.title");
      case "margin":
        return t("activityFeed.margin");
      case "automation":
        return name(item) ? t("activityFeed.automationTo", { name: name(item) }) : t("activityFeed.automation");
      case "practice":
        return t("activityFeed.practiceTo", { name: name(item) });
      case "withdraw": {
        const to = item.withdrawal ? destination(item.withdrawal.destination) : name(item);
        return item.status === "confirmed"
          ? t("activityFeed.withdrawnTo", { name: to })
          : t("activityFeed.withdrawingTo", { name: to });
      }
      default:
        return t("activityFeed.other");
    }
  };
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );
  const line = (item: FeedItem) => {
    const why = item.reason ? reason(item.reason, item.reasonParams, item.network) : "";
    if (item.kind === "withdraw" && item.withdrawal) {
      const steps = t("activityFeed.withdrawSteps", { count: item.withdrawal.steps.length });
      if (item.status === "confirmed") return `${when(item.at)} · ${steps}`;
      if (item.status === "checking") return t("activityFeed.checking");
      if (item.status === "skipped") return t("activityFeed.withdrawCanceled");
      return t("activityFeed.withdrawUnfinished");
    }
    switch (item.status) {
      case "checking":
        return t("activityFeed.checking");
      case "skipped":
        return t("activityFeed.skipped", { reason: why });
      case "failed":
        return why ? t("activityFeed.failedWhy", { reason: why }) : t("activityFeed.failed");
      case "practiced":
        return item.reason ? t("activityFeed.practicedRefused") : t("activityFeed.practiced");
      case "waiting":
        return t("activityFeed.waiting", { reason: why });
      default:
        return when(item.at);
    }
  };
  return { title, line, money, name, when };
}

function Face({ item }: { item: FeedItem }) {
  const chainId = ARC_CHAIN_IDS[item.network];
  const mark = (token: NonNullable<FeedItem["token"]>, size: number, badge?: string) => (
    <TokenMark
      token={{ chainId, address: token.address, symbol: token.symbol }}
      size={size}
      {...(badge ? { chainBadge: badge } : {})}
    />
  );
  if (item.kind === "swap" && item.token && item.other)
    return (
      <View style={{ width: AVATAR, height: AVATAR }}>
        <View className="absolute" style={{ top: 0, start: 0 }}>
          {mark(item.other.token, SWAP_MARK)}
        </View>
        <View className="border-card absolute rounded-full border-2" style={{ bottom: 0, end: 0 }}>
          {mark(item.token, SWAP_MARK)}
        </View>
      </View>
    );
  if (item.kind === "bridge" && item.token)
    return mark(item.token, AVATAR, item.bridge ? chainKey(item.bridge.chainId) : undefined);
  if (item.kind === "withdraw" && item.withdrawal) {
    const target = item.withdrawal.destination;
    const entity =
      target.kind === "exchange" && target.brand
        ? exchangeKey(target.brand)
        : target.brand
          ? walletKey(target.brand)
          : target.chain.chainId
            ? chainKey(target.chain.chainId)
            : "";
    if (entity) return <Mark entity={entity} size={AVATAR} />;
  }
  if (item.kind === "earn" || item.kind === "margin" || !item.counterparty) {
    const icon = item.status === "waiting" ? Hand : item.status === "practiced" ? FlaskConical : CalendarClock;
    if ((item.kind === "earn" || item.kind === "margin") && item.token) return mark(item.token, AVATAR);
    return (
      <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
        <Icon as={icon} className="text-foreground size-5" />
      </View>
    );
  }
  return (
    <View style={{ width: AVATAR, height: AVATAR }}>
      <DefaultAvatar seed={item.counterparty.toLowerCase()} size={AVATAR} label={item.contactName ?? undefined} />
      {item.token ? <View className="absolute -bottom-0.5 -end-0.5">{mark(item.token, BADGE)}</View> : null}
    </View>
  );
}

/** A withdrawal's steps under its row, and "Finish it" while it is not done. */
function WithdrawalSteps({ item }: { item: FeedItem }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const colors = useThemeColors();
  const name = useDestinationName();
  const stepTitle = useStepTitle();
  const run = item.withdrawal!;
  const to = name(run.destination);
  const amountOf = (step: (typeof run.steps)[number]) => {
    const units = step.moved ?? step.amount;
    return units
      ? formatTokenAmount(BigInt(units), step.token.decimals, step.token.symbol, locale, { trimZeros: true })
      : step.token.symbol;
  };
  return (
    <View className="gap-3 px-4 pb-4 ps-[72px]">
      <ProcessTimeline
        spinnerColor={colors.foreground}
        steps={run.steps.map((step) => ({
          id: step.id,
          title: stepTitle(step, amountOf(step), to, run.destination.chain.name),
          state: step.state === "active" && !step.arriving ? "pending" : step.state,
        }))}
      />
      {run.status === "running" || run.status === "stopped" ? (
        <Button size="sm" onPress={() => router.push({ pathname: "/withdraw", params: { resume: run.id } })}>
          <Text>{t("withdraw.finishIt")}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function FeedRow({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const text = useFeedText();
  const [open, setOpen] = React.useState(false);
  const grouped = item.kind === "withdraw" && Boolean(item.withdrawal);
  const done = item.status === "confirmed";
  const sign = item.direction === "in" ? "+" : item.direction === "out" ? "−" : "";
  const amount = text.money(item.amount, item.token);
  const title = text.title(item);
  const line = text.line(item);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${line}, ${sign}${amount}`}
        accessibilityState={grouped ? { expanded: open } : undefined}
        onPress={grouped ? () => setOpen((value) => !value) : onPress}
        className={cn("active:bg-muted flex-row items-center gap-3 px-4 py-3", WEB_PRESSABLE)}
      >
        <Face item={item} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            className={cn(
              "text-sm",
              item.status === "waiting" ? "text-foreground" : "text-muted-foreground",
              TEXT_START,
            )}
          >
            {line}
          </Text>
        </View>
        {amount ? (
          <View className="items-end">
            <Amount
              className={cn(
                "text-base",
                !done ? "text-muted-foreground" : item.direction === "in" ? "text-success" : "text-foreground",
              )}
            >{`${sign}${amount}`}</Amount>
            {item.kind === "swap" && item.other ? (
              <Text className="text-muted-foreground text-xs">{`−${text.money(item.other.amount, item.other.token)}`}</Text>
            ) : null}
          </View>
        ) : null}
        {grouped ? (
          <Icon as={ChevronDown} className={cn("text-muted-foreground size-4", open && "rotate-180")} />
        ) : null}
      </Pressable>
      {grouped && open ? <WithdrawalSteps item={item} /> : null}
    </View>
  );
}
