// The Activity tab = the agent's whole feed (D37; plan §D "Activity = full feed"): everything Kawase did, held,
// skipped, is watching and found, day-grouped with filter chips and counts, each row opening its detail (the race it
// came from and the receipt; a receipt with a transaction opens Why). "All money" keeps every token in and out on the
// network, Kawase's or not (receives, the faucet, requests paid), with its own filters, so nothing from the old
// Activity is lost. The week's report and the export stay on top. `?filter=needs_you` (or `held`) opens on Held.
// Every state is designed: skeletons held 300 ms, empty states that name the next action, a failed refresh that keeps
// the last rows and marks them stale, and a guest's sign-in plate instead of an empty list.
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Download } from "lucide-react-native";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AgentFeedItem, FeedItem, ReportView } from "@kawase/api-client";
import { useWide, WIDE_COLUMN_PX } from "@kawase/ui-native/lib/wide";

import { ActivityRowSkeleton } from "@/activity/activity-row";
import { FeedRow as MoneyRow } from "@/activity/feed-row";
import { FeedSheet } from "@/activity/feed-sheet";
import { useFeed } from "@/activity/use-feed";
import { Button, EmptyState, ErrorState, FilterChips, Icon, Panel, Segmented, SIZE, SPACE, StaleTick, TYPE, usePullRefresh, useTheme } from "@/components/kit";
import { StatusScrim } from "@/components/shell/StatusScrim";
import { TabHeader } from "@/components/tab-header";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { ExportSheet } from "@/history/export-sheet";
import { ReportCard } from "@/history/report-card";
import { FeedDetailSheet } from "@/home/feed-detail-sheet";
import { FeedFilters, FeedTimeline, rowsFor, type FeedFilter } from "@/home/feed-timeline";
import { useAgentFeed } from "@/home/use-agent-feed";
import { SignInPlate } from "@/home/markets-glance";
import { useT } from "@/i18n";
import { PositionRow } from "@/margin/position-row";
import { useMarginPositions } from "@/margin/use-margin";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

type View_ = "kawase" | "money";
type MoneyFilter = "all" | "in" | "out" | "trades" | "automations";
const MONEY_FILTERS: MoneyFilter[] = ["all", "in", "out", "trades", "automations"];
const KEEP: Record<MoneyFilter, (item: FeedItem) => boolean> = {
  all: () => true,
  in: (item) => item.direction === "in",
  out: (item) => item.direction === "out",
  trades: (item) => item.kind === "swap" || item.kind === "margin",
  automations: (item) => item.fromAutomation || item.kind === "practice",
};
const MONEY_LABEL: Record<MoneyFilter, string> = {
  all: "activity.filterAll",
  in: "activityFeed.filterIn",
  out: "activityFeed.filterOut",
  trades: "activityFeed.filterTrades",
  automations: "activityFeed.filterAutomations",
};
const SKELETON_ROWS = 4;
const FEED_FILTERS: readonly FeedFilter[] = ["all", "done", "held", "skipped", "watching", "found"];

export function ActivityScreen() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const wide = useWide();
  const { status, user } = useSession();
  const account = status === "account";
  const network = user?.activeNetwork ?? "testnet";
  const params = useLocalSearchParams<{ filter?: string }>();
  const asked: FeedFilter | undefined = params.filter === "needs_you" ? "held" : FEED_FILTERS.find((entry) => entry === params.filter);

  const agent = useAgentFeed();
  const { positions } = useMarginPositions();
  const openPositions = (positions ?? []).filter((position) => position.status === "open");
  const money = useFeed(network);
  const [view, setView] = React.useState<View_>("kawase");
  const [filter, setFilter] = React.useState<FeedFilter>(asked ?? "all");
  const [moneyFilter, setMoneyFilter] = React.useState<MoneyFilter>("all");
  const [open, setOpen] = React.useState<AgentFeedItem | null>(null);
  const [openMoney, setOpenMoney] = React.useState<FeedItem>();
  const [exporting, setExporting] = React.useState(false);
  const [report, setReport] = React.useState<ReportView>();
  React.useEffect(() => {
    if (asked) {
      setView("kawase");
      setFilter(asked);
    }
  }, [asked]);

  const refreshMoney = money.refresh;
  useFocusEffect(
    React.useCallback(() => {
      void refreshMoney();
      // The week's report sits above the list (signed in only); a failure just leaves it out.
      if (account) void api.history.report(network).then((result) => setReport(result.report)).catch(() => undefined);
    }, [refreshMoney, account, network]),
  );
  const refreshing = usePullRefresh(() => Promise.all([agent.refresh(), money.refresh()]));

  // A money row waiting for the person goes straight to its answer; anything else opens its receipt.
  const openMoneyRow = (item: FeedItem) => (item.status === "waiting" && item.needsYouId ? router.push({ pathname: "/needs-you/[id]", params: { id: item.needsYouId } }) : setOpenMoney(item));
  const moneyItems = money.items.filter(KEEP[moneyFilter]);
  const agentRows = rowsFor(agent.feed, "all");

  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      <ScrollView
        refreshControl={account ? refreshing : undefined}
        contentContainerStyle={[styles.content, { paddingTop: wide ? SPACE.xxl : insets.top + SPACE.md, paddingBottom: clearance.scroll }, wide ? styles.wide : null]}
      >
        {wide ? null : <TabHeader />}
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[TYPE.pageTitle, styles.grow, { color: color.ink }]}>
            {t("activity.title")}
          </Text>
          {account ? <Button size="sm" block={false} variant="secondary" label={t("history.export")} leading={<Icon icon={Download} size={SIZE.iconSm} />} onPress={() => setExporting(true)} /> : null}
        </View>
        {report ? <ReportCard report={report} /> : null}

        {!account ? (
          <SignInPlate />
        ) : (
          <>
            <Segmented
              options={[
                { value: "kawase", label: t("feed.activity.kawase") },
                { value: "money", label: t("feed.activity.money") },
              ]}
              value={view}
              onChange={setView}
              label={t("feed.activity.viewLabel")}
            />
            {/* Open longs and shorts first, P&L moving: what Kawase holds for the person right now (Owarine's positions). */}
            {openPositions.length > 0 ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={[TYPE.label, styles.head, { color: color.text3 }]}>
                  {t("markets.yourPositions")}
                </Text>
                <Panel style={styles.plate}>
                  {openPositions.map((position) => (
                    <PositionRow key={position.id} position={position} />
                  ))}
                </Panel>
              </View>
            ) : null}
            {view === "kawase" ? (
              <View style={styles.section}>
                {agent.feed && agentRows.length > 0 ? <FeedFilters feed={agent.feed} value={filter} onChange={setFilter} /> : null}
                {agent.error && agent.asOf ? <StaleTick asOf={agent.asOf} reason="refresh-failed" /> : null}
                {!agent.feed && agent.error ? (
                  <ErrorState diagnosis={agent.error} retry={() => void agent.refresh()} stillWorks={t("feed.activity.stillWorks")} />
                ) : agent.feed && agentRows.length === 0 ? (
                  <EmptyState why={t("feed.activity.emptyWhy")} action={{ label: t("feed.activity.emptyAction"), onPress: () => router.navigate({ pathname: "/", params: { ask: t("feed.home.emptyPrompt") } }) }} />
                ) : agent.feed && rowsFor(agent.feed, filter).length === 0 ? (
                  <EmptyState why={t("feed.activity.emptyFilter", { filter: t(`feed.list.filter_${filter}`) })} action={{ label: t("feed.activity.showAll"), onPress: () => setFilter("all") }} size="inline" />
                ) : (
                  <FeedTimeline feed={agent.feed} filter={filter} onOpen={setOpen} plated />
                )}
              </View>
            ) : (
              <View style={styles.section}>
                <FilterChips options={MONEY_FILTERS.map((entry) => ({ value: entry, label: t(MONEY_LABEL[entry]) }))} value={moneyFilter} onChange={setMoneyFilter} label={t("feed.activity.moneyFilterLabel")} />
                {money.stale ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("activity.stale")}</Text> : null}
                {money.status === "loading" ? (
                  <Panel>
                    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                      <ActivityRowSkeleton key={i} />
                    ))}
                  </Panel>
                ) : money.status === "error" && money.items.length === 0 ? (
                  <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void money.refresh()} stillWorks={t("feed.activity.stillWorks")} variant="strip" />
                ) : moneyItems.length === 0 ? (
                  <EmptyState why={moneyFilter === "all" ? t("activity.emptyTitle") : t("activityFeed.emptyFilter")} detail={moneyFilter === "all" ? t("activity.emptyBody") : t("activity.emptyFilterBody")} />
                ) : (
                  <Panel>
                    {moneyItems.map((item) => (
                      <MoneyRow key={item.id} item={item} onPress={() => openMoneyRow(item)} />
                    ))}
                  </Panel>
                )}
                {money.more ? <Text style={[TYPE.caption, styles.center, { color: color.text3 }]}>{t("activityFeed.latestOnly")}</Text> : null}
              </View>
            )}
          </>
        )}
      </ScrollView>
      {/* Content scrolls under the status bar here: the page's colour fades in behind the clock (phones). */}
      {wide ? null : <StatusScrim />}
      {open ? <FeedDetailSheet item={open} onClose={() => setOpen(null)} onAsk={(prompt) => router.navigate({ pathname: "/", params: { ask: prompt } })} /> : null}
      <FeedSheet item={openMoney} onClose={() => setOpenMoney(undefined)} />
      {account ? <ExportSheet open={exporting} onClose={() => setExporting(false)} network={network} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: SPACE.lg, paddingHorizontal: SPACE.lgPlus },
  wide: { width: "100%", maxWidth: WIDE_COLUMN_PX, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1 },
  section: { gap: SPACE.md },
  center: { textAlign: "center" },
  head: { paddingHorizontal: SPACE.lg },
  plate: { paddingVertical: SPACE.xs },
});
