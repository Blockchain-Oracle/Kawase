// The Activity tab = the wallet's whole history in one list (D37; plan §D "Activity = full feed"; Abu 10-15: one list,
// not "Kawase" and "All money" side by side): every movement in and out, Kawase's or not (receives and the faucet
// included), and what Kawase held, skipped, is watching and found, day-grouped as wallet rows with chips for In · Out ·
// Trades and each group's count. Every row opens the same receipt it opens on Home. The week's report and the export
// stay on top. `?filter=needs_you` (or `held`) opens on Held. On a wide desktop the list and the receipt stand side by
// side (PayPal's and Copperx's activity, Refero): a row selects instead of opening a sheet, and the panel shows the
// same receipt the sheet would, starting on the newest movement that went through.
// Every state is designed: skeletons held 300 ms, empty states that name the next action, a failed refresh that keeps
// the last rows and marks them stale, and a guest's sign-in plate instead of an empty list.
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Download } from "lucide-react-native";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AgentFeedItem, ReportView } from "@kawase/api-client";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
import { useWide, WIDE_COLUMN_PX } from "@kawase/ui-native/lib/wide";

import {
  Button,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  Panel,
  SIZE,
  SPACE,
  StaleTick,
  TYPE,
  usePullRefresh,
  useTheme,
} from "@/components/kit";
import { StatusScrim } from "@/components/shell/StatusScrim";
import { TabHeader } from "@/components/tab-header";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { ExportSheet } from "@/history/export-sheet";
import { ReportCard } from "@/history/report-card";
import { FeedDetail, FeedDetailSheet } from "@/home/feed-detail-sheet";
import { useFeedCopy } from "@/home/feed-copy";
import { FeedTimeline, rowsFor, type FeedFilter } from "@/home/feed-timeline";
import { useAgentFeed } from "@/home/use-agent-feed";
import { SignInPlate } from "@/home/markets-glance";
import { useT } from "@/i18n";
import { PositionRow } from "@/margin/position-row";
import { useMarginPositions } from "@/margin/use-margin";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

/** The money cuts (what moved which way) before the agent's groups (what Kawase held, is watching, found). */
type Cut = "in" | "out" | "trades";
type ActivityFilter = "all" | Cut | Exclude<FeedFilter, "all" | "done">;
const CUTS: readonly Cut[] = ["in", "out", "trades"];
const GROUPS: readonly Exclude<FeedFilter, "all" | "done">[] = ["held", "watching", "found", "skipped"];
const OUT_KINDS: ReadonlySet<AgentFeedItem["kind"]> = new Set([
  "send",
  "bridge",
  "crosschain",
  "withdraw",
  "earn",
  "lend",
  "automation",
]);
const KEEP: Record<Cut, (item: AgentFeedItem) => boolean> = {
  in: (item) => item.kind === "receive",
  out: (item) => OUT_KINDS.has(item.kind) && item.group === "done",
  trades: (item) => item.kind === "swap" || item.kind === "margin",
};
const CUT_LABEL: Record<Cut, string> = {
  in: "activityFeed.filterIn",
  out: "activityFeed.filterOut",
  trades: "activityFeed.filterTrades",
};
const ASKABLE: readonly ActivityFilter[] = ["held", "skipped", "watching", "found"];
/** The list (600 px at least) and the receipt panel side by side, with the gutters. */
const SPLIT_MIN_STAGE_PX = 1040;
const LIST_MAX_PX = 640;
const PANEL_PX = 420;
const GUTTERS = 2;

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
  const asked: ActivityFilter | undefined =
    params.filter === "needs_you" ? "held" : ASKABLE.find((entry) => entry === params.filter);

  const agent = useAgentFeed();
  const copy = useFeedCopy();
  const { positions } = useMarginPositions();
  const openPositions = (positions ?? []).filter((position) => position.status === "open");
  const [filter, setFilter] = React.useState<ActivityFilter>(asked ?? "all");
  const [open, setOpen] = React.useState<AgentFeedItem | null>(null);
  const stage = useStageFrame();
  const split = wide && account && (stage?.width ?? 0) >= SPLIT_MIN_STAGE_PX;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [report, setReport] = React.useState<ReportView>();
  React.useEffect(() => {
    if (asked) setFilter(asked);
  }, [asked]);

  useFocusEffect(
    React.useCallback(() => {
      // The week's report sits above the list (signed in only); a failure just leaves it out.
      if (account)
        void api.history
          .report(network)
          .then((result) => setReport(result.report))
          .catch(() => undefined);
    }, [account, network]),
  );
  const refreshing = usePullRefresh(() => agent.refresh());

  const agentRows = rowsFor(agent.feed, "all");
  const cut = CUTS.find((entry) => entry === filter);
  const group: FeedFilter = cut ? "all" : (filter as FeedFilter);
  const keep = cut ? KEEP[cut] : undefined;
  const shown = rowsFor(agent.feed, group).filter((row) => !keep || keep(row));
  // The panel follows the row the person picked, else the newest movement that went through (the freshest receipt).
  const current = split
    ? (shown.find((row) => row.id === selectedId) ??
      shown.find((row) => row.outcome === "confirmed") ??
      shown[0] ??
      null)
    : null;
  const counts = new Map(agent.feed?.groups.map((entry) => [entry.group, entry.count]) ?? []);
  // In · Out · Trades when the history has any, then each group Kawase has rows in, with its count ("Held 1").
  const chips: { value: ActivityFilter; label: string }[] = [
    { value: "all", label: t("activity.filterAll") },
    ...CUTS.filter((entry) => entry === filter || agentRows.some(KEEP[entry])).map((entry) => ({
      value: entry,
      label: t(CUT_LABEL[entry]),
    })),
    ...GROUPS.filter((entry) => entry === filter || (counts.get(entry) ?? 0) > 0).map((entry) => ({
      value: entry,
      label: t("feed.list.filterCount", { label: copy.group(entry), count: counts.get(entry) ?? 0 }),
    })),
  ];

  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      <View style={split ? styles.grid : styles.fill}>
        <ScrollView
          refreshControl={account ? refreshing : undefined}
          style={split ? styles.listColumn : undefined}
          contentContainerStyle={[
            styles.content,
            { paddingTop: wide ? SPACE.xxl : insets.top + SPACE.md, paddingBottom: clearance.scroll },
            wide && !split ? styles.wide : null,
            split ? styles.listContent : null,
          ]}
        >
          {wide ? null : <TabHeader />}
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[TYPE.pageTitle, styles.grow, { color: color.ink }]}>
              {t("activity.title")}
            </Text>
            {account ? (
              <Button
                size="sm"
                block={false}
                variant="secondary"
                label={t("history.export")}
                leading={<Icon icon={Download} size={SIZE.iconSm} />}
                onPress={() => setExporting(true)}
              />
            ) : null}
          </View>
          {report ? <ReportCard report={report} /> : null}

          {!account ? (
            <SignInPlate />
          ) : (
            <>
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
              <View style={styles.section}>
                {agentRows.length > 0 ? (
                  <FilterChips options={chips} value={filter} onChange={setFilter} label={t("feed.list.filterLabel")} />
                ) : null}
                {agent.error && agent.asOf ? <StaleTick asOf={agent.asOf} reason="refresh-failed" /> : null}
                {!agent.feed && agent.error ? (
                  <ErrorState
                    diagnosis={agent.error}
                    retry={() => void agent.refresh()}
                    stillWorks={t("feed.activity.stillWorks")}
                  />
                ) : agent.feed && agentRows.length === 0 ? (
                  <EmptyState
                    why={t("feed.activity.emptyWhy")}
                    action={{
                      label: t("feed.activity.emptyAction"),
                      onPress: () => router.navigate({ pathname: "/", params: { ask: t("feed.home.emptyPrompt") } }),
                    }}
                  />
                ) : agent.feed && shown.length === 0 ? (
                  <EmptyState
                    why={t("feed.activity.emptyFilter", {
                      filter: chips.find((chip) => chip.value === filter)?.label ?? "",
                    })}
                    action={{ label: t("feed.activity.showAll"), onPress: () => setFilter("all") }}
                    size="inline"
                  />
                ) : (
                  <FeedTimeline
                    feed={agent.feed}
                    filter={group}
                    keep={keep}
                    onOpen={split ? (item) => setSelectedId(item.id) : setOpen}
                    selectedId={current?.id}
                    plated
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>
        {split ? (
          <ScrollView
            style={styles.panel}
            contentContainerStyle={[styles.panelContent, { paddingBottom: clearance.scroll }]}
          >
            {current ? (
              <FeedDetail
                key={current.id}
                item={current}
                ground={color.background}
                onAsk={(prompt) => router.navigate({ pathname: "/", params: { ask: prompt } })}
              />
            ) : null}
          </ScrollView>
        ) : null}
      </View>
      {/* Content scrolls under the status bar here: the page's colour fades in behind the clock (phones). */}
      {wide ? null : <StatusScrim />}
      {open ? (
        <FeedDetailSheet
          item={open}
          onClose={() => setOpen(null)}
          onAsk={(prompt) => router.navigate({ pathname: "/", params: { ask: prompt } })}
        />
      ) : null}
      {account ? <ExportSheet open={exporting} onClose={() => setExporting(false)} network={network} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { flex: 1 },
  grid: {
    flex: 1,
    flexDirection: "row",
    gap: SPACE.xxl,
    width: "100%",
    maxWidth: LIST_MAX_PX + PANEL_PX + SPACE.xxl + SPACE.lgPlus * GUTTERS,
    alignSelf: "center",
    paddingHorizontal: SPACE.lgPlus,
  },
  listColumn: { flex: 1, minWidth: 0 },
  listContent: { paddingHorizontal: 0 },
  panel: { width: PANEL_PX, flexGrow: 0 },
  panelContent: { paddingTop: SPACE.xxl, gap: SPACE.lg },
  content: { gap: SPACE.lg, paddingHorizontal: SPACE.lgPlus },
  wide: { width: "100%", maxWidth: WIDE_COLUMN_PX, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1 },
  section: { gap: SPACE.md },
  center: { textAlign: "center" },
  head: { paddingHorizontal: SPACE.lg },
  plate: { paddingVertical: SPACE.xs },
});
