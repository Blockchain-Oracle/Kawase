// The inbox (J1; journey 15): what came in and what Kawase did, newest first, from the api's own record (the source of
// truth push and email will follow in Stage 9). Each row says it in words with real marks — money received and from
// whom, a request of yours that was paid, a send that landed — with an unread dot that is never the only signal.
// Tapping marks it read and opens the request or the transaction. "Mark all read" when there is something unread.
import { useRouter } from "expo-router";
import { ChevronLeft, FileClock, GraduationCap, HeartPulse, ShieldAlert, ShieldCheck } from "lucide-react-native";
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
  if (item.kind === "position_health" || item.kind === "position_closed" || item.kind === "token_graduated") return <PositionAlertRow item={item} onPress={onPress} />;
  if (item.kind === "device_signed_in" || item.kind === "device_signed_out" || item.kind === "invoice_due" || item.kind === "invoice_overdue") {
    return <AlertRow item={item} onPress={onPress} />;
  }
  return <MoneyRow item={item} onPress={onPress} />;
}

/** Kawase Margin and borrowing: account health falling, or a take-profit / stop-loss Kawase closed (or could not). */
function PositionAlertRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  const { t } = useT();
  const money = useMoney();
  const dates = useRequestDates();
  const p = item.params;
  const health = item.kind === "position_health";
  if (item.kind === "token_graduated") {
    const unreadGrad = !item.readAt;
    const titleGrad = t("notify.graduatedTitle", { symbol: p.symbol ?? "", launchpad: p.launchpad ?? "" });
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${unreadGrad ? `${t("inbox.unread")}, ` : ""}${titleGrad}`} onPress={onPress} className="active:bg-muted flex-row items-center gap-3 px-4 py-3">
        <View className="items-center justify-center" style={{ width: DOT }}>
          {unreadGrad ? <View className="bg-accent rounded-full" style={{ width: DOT, height: DOT }} /> : null}
        </View>
        <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
          <Icon as={GraduationCap} className="text-muted-foreground size-5" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={2} className={cn("text-foreground text-base", unreadGrad ? "font-bold" : "font-semibold", TEXT_START)}>
            {titleGrad}
          </Text>
          <Text numberOfLines={2} className={cn("text-muted-foreground text-sm", TEXT_START)}>
            {[t("notify.graduatedBody", { symbol: p.symbol ?? "" }), dates.moment(item.createdAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </Pressable>
    );
  }
  const position = `${p.market ?? ""} ${t(`notify.side_${p.side === "short" ? "short" : "long"}`)}`;
  const closed = p.outcome === "closed";
  // Practice mode, or a pause holding a take-profit back: the target was hit and the position is still open.
  const held = p.outcome === "practice" || p.outcome === "paused";
  const title = health
    ? t(p.level === "danger" ? "notify.healthDangerTitle" : "notify.healthWarningTitle", { health: p.health ?? "" })
    : closed
      ? t(p.reason === "take_profit" ? "notify.takeProfitTitle" : "notify.stopLossTitle", { position })
      : t(held ? "notify.protectHeldTitle" : "notify.protectFailedTitle", { position });
  const detail = health
    ? t("notify.healthBody")
    : closed
      ? t("notify.protectClosedBody", { amount: money(p.asset, p.amount) })
      : t(held ? (p.outcome === "practice" ? "notify.protectPracticeBody" : "notify.protectPausedBody") : "notify.protectFailedBody");
  const warn = (health && p.level === "danger") || (!health && !closed && !held);
  const unread = !item.readAt;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${unread ? `${t("inbox.unread")}, ` : ""}${title}`} onPress={onPress} className="active:bg-muted flex-row items-center gap-3 px-4 py-3">
      <View className="items-center justify-center" style={{ width: DOT }}>
        {unread ? <View className="bg-accent rounded-full" style={{ width: DOT, height: DOT }} /> : null}
      </View>
      <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
        <Icon as={health ? HeartPulse : ShieldCheck} className={cn("size-5", warn ? "text-destructive" : "text-muted-foreground")} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={2} className={cn("text-foreground text-base", unread ? "font-bold" : "font-semibold", TEXT_START)}>
          {title}
        </Text>
        <Text numberOfLines={2} className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {[detail, dates.moment(item.createdAt)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
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
  // A5-3: someone on Kawase asked the person to pay; nothing moved yet, so the amount carries no sign.
  const asked = item.kind === "request_received";
  const incoming = item.kind !== "send_completed" && !skipped && !quiet && !asked;
  const title =
    asked
      ? t("inbox.askedYou", { name, amount })
      : waiting
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
    asked
      ? [p.note, dates.moment(item.createdAt)].filter(Boolean).join(" · ")
      : waiting
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
      accessibilityLabel={`${unread ? `${t("inbox.unread")}, ` : ""}${title}${asked ? "" : `, ${incoming ? "+" : "−"}${amount}`}`}
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3 px-4 py-3"
    >
      <View className="items-center justify-center" style={{ width: DOT }}>
        {unread ? <View className="bg-accent rounded-full" style={{ width: DOT, height: DOT }} /> : null}
      </View>
      <View style={{ width: AVATAR, height: AVATAR }}>
        <DefaultAvatar seed={(counterparty ?? item.id).toLowerCase()} size={AVATAR} />
        {/* USDC and EURC carry their mark; another token's symbol is in the words (never the wrong logo). */}
        {p.asset === "USDC" || p.asset === "EURC" ? (
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
      {p.amount && !quiet && !asked ? (
        <Amount className={cn("text-base", incoming ? "text-success" : skipped ? "text-muted-foreground" : "text-foreground")}>
          {skipped ? amount : `${incoming ? "+" : "−"}${amount}`}
        </Amount>
      ) : asked ? (
        <View className="bg-primary rounded-full px-3 py-1.5">
          <Text className="text-primary-foreground text-sm font-semibold">{t("inbox.pay")}</Text>
        </View>
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
    // Account health (margin or borrowing) and protective closes: where the positions are.
    else if (item.kind === "position_health" || item.kind === "position_closed") router.push(item.params.path === "/borrow" ? "/borrow" : "/margin");
    else if (item.kind === "token_graduated" && item.params.token) router.push({ pathname: "/token/[chainId]/[address]", params: { chainId: "5042", address: item.params.token } });
    // Asked to pay by someone on Kawase: the pay card itself.
    else if (item.kind === "request_received" && item.params.token) router.push({ pathname: "/r/[token]", params: { token: item.params.token } });
    // An automation's item: that run's story, or that automation's own card; the list when neither is known.
    else if ((item.kind === "automation_skipped" || item.kind === "rule_alert") && item.params.runId) router.push({ pathname: "/why/run/[id]", params: { id: item.params.runId } });
    else if (item.kind === "automation_reminder" && item.params.automationId) router.push({ pathname: "/i/[id]", params: { id: item.params.automationId } });
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
