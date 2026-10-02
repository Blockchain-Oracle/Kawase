// The inbox (J1; journey 15): what came in and what Kawase did, newest first, from the api's own record (the source of
// truth push and email will follow in Stage 9). Each row says it in words with real marks — money received and from
// whom, a request of yours that was paid, a send that landed — with an unread dot that is never the only signal.
// Tapping marks it read and opens the request or the transaction. "Mark all read" when there is something unread.
import { useRouter } from "expo-router";
import { ChevronLeft, FileClock, ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { InboxItem } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { formatTokenAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useRunReason } from "@/automations/copy";
import { useInbox } from "@/inbox/use-inbox";
import { useRequestDates } from "@/request/copy";
import { shortAddress, useMoney } from "@/send/copy";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_WIDTH = 160;
const AVATAR = 44;
const BADGE = 18;
const DOT = 8;
const SKELETON_ROWS = 4;
const SKELETON_HEIGHT = 64;
const USDC_PLACES = 6;

function InboxRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  if (item.kind === "device_signed_in" || item.kind === "device_signed_out" || item.kind === "invoice_due" || item.kind === "invoice_overdue") {
    return <AlertRow item={item} onPress={onPress} />;
  }
  return <MoneyRow item={item} onPress={onPress} />;
}

/** Security and business notices: an icon, the notice, and when. */
function AlertRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const dates = useRequestDates();
  const p = item.params;
  const security = item.kind === "device_signed_in" || item.kind === "device_signed_out";
  const places = Number(p.decimals ?? USDC_PLACES);
  const owed = p.amount ? formatTokenAmount(BigInt(p.amount), places, p.asset ?? "", locale, { fractionDigits: Math.min(places, USDC_PLACES), trimZeros: true }) : "";
  const title =
    item.kind === "device_signed_in"
      ? t("alerts.deviceSignedInTitle", { name: p.name ?? t("alerts.aDevice") })
      : item.kind === "device_signed_out"
        ? t("alerts.deviceSignedOutTitle", { name: p.name ?? t("alerts.aDevice") })
        : item.kind === "invoice_overdue"
          ? t("alerts.invoiceOverdueTitle", { number: p.number ?? "" })
          : t(p.stage === "due_today" ? "alerts.invoiceDueTodayTitle" : "alerts.invoiceDueSoonTitle", { number: p.number ?? "" });
  const detail = security ? [p.platform, p.location].filter(Boolean).join(" · ") : t("alerts.invoiceDueBody", { client: p.client ?? "", amount: owed });
  const unread = !item.readAt;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${unread ? `${t("inbox.unread")}, ` : ""}${title}`} onPress={onPress} className="active:bg-muted flex-row items-center gap-3 px-4 py-3">
      <View className="items-center justify-center" style={{ width: DOT }}>
        {unread ? <View className="bg-accent rounded-full" style={{ width: DOT, height: DOT }} /> : null}
      </View>
      <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
        <Icon as={security ? ShieldAlert : FileClock} className={cn("size-5", item.kind === "invoice_overdue" || item.kind === "device_signed_in" ? "text-destructive" : "text-muted-foreground")} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={2} className={cn("text-foreground text-base", unread ? "font-bold" : "font-semibold", TEXT_START)}>
          {title}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {[detail, dates.moment(item.createdAt)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

function MoneyRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  const { t } = useT();
  const money = useMoney();
  const dates = useRequestDates();
  const reasonText = useRunReason();
  const { locale } = useLocale();
  const ids = arcIdentity(item.network);
  const p = item.params;
  const counterparty = item.kind === "send_completed" || item.kind === "automation_skipped" ? p.to : p.from;
  const name = p.name || (counterparty ? shortAddress(counterparty) : "");
  const amount = money(p.asset, p.amount, p.decimals);
  const skipped = item.kind === "automation_skipped";
  const alert = item.kind === "rule_alert";
  // 8c: a step waiting for the person, and the 24 h reminder; neither moved money.
  const waiting = item.kind === "needs_you";
  const reminder = item.kind === "automation_reminder";
  const quiet = alert || waiting || reminder;
  const incoming = item.kind !== "send_completed" && !skipped && !quiet;
  const title =
    waiting
      ? t(p.reminder ? "notify.needsYouReminderTitle" : "notify.needsYouTitle")
      : reminder
        ? t("automation.inboxReminder")
        : alert && p.trigger === "price"
          ? t("automation.ruleAlertPrice", { amountIn: p.amountIn ?? "", symbolIn: p.symbolIn ?? "", quotedOut: p.quotedOut ?? "", symbolOut: p.symbolOut ?? "" })
          : alert
      ? p.trigger === "money_in"
        ? t("automation.ruleAlertMoneyIn", { amount })
        : t(p.trigger === "balance_above" ? "automation.ruleAlertAbove" : "automation.ruleAlertBelow", { amount: money("USDC", p.threshold) })
      : item.kind === "payment_received"
      ? t("inbox.receivedFrom", { name })
      : item.kind === "request_paid"
        ? t("inbox.requestPaid")
        : skipped
          ? t("automation.inboxSkipped", { reason: reasonText(p.reason ?? null, p, item.network) })
          : t("inbox.sentTo", { name });
  const subtitle =
    waiting
      ? p.type === "swap"
        ? t("notify.needsYouSwap", { amount: p.amount && p.decimalsIn ? formatTokenAmount(BigInt(p.amount), Number(p.decimalsIn), "", locale, { trimZeros: true, withSymbol: false }) : "", symbolIn: p.symbolIn ?? "", symbolOut: p.symbolOut ?? "" })
        : t("notify.needsYouSend", { amount, name })
      : reminder
        ? [p.automationKind === "payroll" ? t("notify.reminderPayroll", { people: p.people ?? "" }) : p.automationKind === "dca" ? `${p.tokenAmount ?? ""} ${p.symbolIn ?? ""} → ${p.name ?? ""}` : `${amount} → ${name}`, p.short ? t("notify.reminderShort") : null, p.at ? dates.moment(p.at) : null].filter(Boolean).join(" · ")
        : item.kind === "request_paid"
      ? t("inbox.requestPaidBy", { amount, name })
      : alert && p.balance
        ? `${t("automation.ruleAlertBalance", { amount: money("USDC", p.balance) })} · ${dates.moment(item.createdAt)}`
        : dates.moment(item.createdAt);
  const unread = !item.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${t("inbox.unread")}, ` : ""}${title}, ${incoming ? "+" : "−"}${amount}`}
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3 px-4 py-3"
    >
      <View className="items-center justify-center" style={{ width: DOT }}>
        {unread ? <View className="bg-accent rounded-full" style={{ width: DOT, height: DOT }} /> : null}
      </View>
      <View style={{ width: AVATAR, height: AVATAR }}>
        <DefaultAvatar seed={(counterparty ?? item.id).toLowerCase()} size={AVATAR} />
        {p.asset ? (
          <View className="absolute -bottom-0.5 -end-0.5">
            <Mark entity={p.asset === "EURC" ? ids.eurc : ids.usdc} size={BADGE} />
          </View>
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={2} className={cn("text-foreground text-base", unread ? "font-bold" : "font-semibold", TEXT_START)}>
          {title}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {subtitle}
        </Text>
      </View>
      {p.amount && !quiet ? (
        <Amount className={cn("text-base", incoming ? "text-success" : skipped ? "text-muted-foreground" : "text-foreground")}>
          {skipped ? amount : `${incoming ? "+" : "−"}${amount}`}
        </Amount>
      ) : null}
    </Pressable>
  );
}

export function InboxScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const inbox = useInbox();
  const [refreshing, setRefreshing] = React.useState(false);
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  const open = (item: InboxItem) => {
    if (!item.readAt) void inbox.markRead(item.id);
    if (item.kind === "needs_you" && item.params.itemId) router.push(`/needs-you/${item.params.itemId}`);
    else if (item.kind === "device_signed_in" || item.kind === "device_signed_out") router.push("/account/devices");
    else if ((item.kind === "invoice_due" || item.kind === "invoice_overdue") && item.params.invoiceId) router.push({ pathname: "/business/invoice/[id]", params: { id: item.params.invoiceId } });
    else if (item.kind === "automation_skipped" || item.kind === "rule_alert" || item.kind === "automation_reminder") router.push("/automations");
    else if (item.requestId) router.push({ pathname: "/request", params: { id: item.requestId } });
    // The action's own card by id (A5-2), or why money arrived; the explorer only when there is neither.
    else if (item.intentId) router.push({ pathname: "/i/[id]", params: { id: item.intentId } });
    else if (item.txHash) router.push({ pathname: "/why/[tx]", params: { tx: item.txHash, network: item.network } });
    else if (item.explorerUrl) void Linking.openURL(item.explorerUrl);
  };
  const pull = async () => {
    setRefreshing(true);
    await inbox.refresh();
    setRefreshing(false);
  };

  const empty = <EmptyState art={<PaperPlane width={ART_WIDTH} />} title={t("inbox.emptyTitle")} body={t("inbox.emptyBody")} />;

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground flex-1 text-2xl font-bold">{t("inbox.title")}</Text>
        {inbox.unread > 0 ? (
          <Button variant="ghost" size="sm" onPress={() => void inbox.markAllRead()}>
            <Text className="text-foreground text-sm">{t("inbox.markAllRead")}</Text>
          </Button>
        ) : null}
      </View>
      {!inbox.account ? (
        <View className="flex-1" style={{ paddingBottom: insets.bottom + EDGE_INSET }}>
          {empty}
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} />}
        >
          {inbox.failed ? (
            <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("inbox.loadFailed")}</Text>
              <Button size="sm" variant="secondary" onPress={() => void inbox.refresh()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </View>
          ) : null}
          {inbox.items === undefined ? (
            inbox.failed ? null : (
              <View className="gap-2">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
                ))}
              </View>
            )
          ) : inbox.items.length === 0 ? (
            <View className="flex-1">{empty}</View>
          ) : (
            <ListGroup>
              {inbox.items.map((item) => (
                <InboxRow key={item.id} item={item} onPress={() => open(item)} />
              ))}
            </ListGroup>
          )}
        </ScrollView>
      )}
    </View>
  );
}
