// The Activity tab (surfaces.md Activity; cards/automate-safety.md "Look back"; R7): one row per outcome on the active
// network — every token in and out (Alchemy's transfer history, through the api), named by what Kawase knows of it
// (a send, a swap, a bridge, savings, Kawase Margin, an automation's run, a request paid, the faucet), with Kawase's
// own outcomes that never touched the chain (a run skipped and why, a practice "would have", a step waiting for you,
// a payment still being checked). Filters All · In · Out · Trades · Automations · Needs you (with its count); a row
// opens its receipt and its why. The week's report and the export stay on top (B2). Rows are kept per network. The tab
// header is the shared one (avatar · network pill · inbox bell; Sign in for guests); `?filter=needs_you` opens on a
// filter (Home's Needs you "See all").
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Download } from "lucide-react-native";
import * as React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FeedItem, ReportView } from "@kawase/api-client";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ActivityRowSkeleton } from "@/activity/activity-row";
import { FeedRow } from "@/activity/feed-row";
import { FeedSheet } from "@/activity/feed-sheet";
import { useFeed } from "@/activity/use-feed";
import { TabHeader } from "@/components/tab-header";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { ExportSheet } from "@/history/export-sheet";
import { ReportCard } from "@/history/report-card";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_WIDTH = 140;
const SKELETON_ROWS = 4;

type Filter = "all" | "in" | "out" | "trades" | "automations" | "needs_you";
const FILTERS: Filter[] = ["all", "in", "out", "trades", "automations", "needs_you"];
const KEEP: Record<Filter, (item: FeedItem) => boolean> = {
  all: () => true,
  in: (item) => item.direction === "in",
  out: (item) => item.direction === "out",
  trades: (item) => item.kind === "swap" || item.kind === "margin",
  automations: (item) => item.fromAutomation || item.kind === "practice",
  needs_you: (item) => item.status === "waiting",
};
const LABEL: Record<Filter, string> = {
  all: "activity.filterAll",
  in: "activityFeed.filterIn",
  out: "activityFeed.filterOut",
  trades: "activityFeed.filterTrades",
  automations: "activityFeed.filterAutomations",
  needs_you: "needsYou.title",
};

function Chip({ active, label, count, onPress }: { active: boolean; label: string; count?: number | undefined; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={onPress}
      className={cn("flex-row items-center gap-1.5 rounded-full px-3.5 py-2", active ? "bg-primary" : "bg-muted active:bg-secondary")}
    >
      <Text className={cn("text-sm font-semibold", active ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
      {count ? (
        <View className={cn("min-w-5 items-center rounded-full px-1.5", active ? "bg-primary-foreground" : "bg-destructive")}>
          <Text className={cn("text-xs font-bold", active ? "text-primary" : "text-destructive-foreground")}>{String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ActivityScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const colors = useThemeColors();
  const signIn = useSignIn();
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const feed = useFeed(network);
  const params = useLocalSearchParams<{ filter?: string }>();
  const asked = FILTERS.find((entry) => entry === params.filter);
  const [filter, setFilter] = React.useState<Filter>(asked ?? "all");
  // Opened again with a filter (from Home): that filter.
  React.useEffect(() => {
    if (asked) setFilter(asked);
  }, [asked]);
  const [open, setOpen] = React.useState<FeedItem>();
  const [refreshing, setRefreshing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [report, setReport] = React.useState<ReportView>();
  const account = Boolean(user && !user.isGuest);

  useFocusEffect(
    React.useCallback(() => {
      void feed.refresh();
      // The week's report sits above the list (signed in only); a failure just leaves it out.
      if (account) void api.history.report(network).then((result) => setReport(result.report)).catch(() => undefined);
    }, [feed.refresh, account, network]),
  );

  const items = feed.items.filter(KEEP[filter]);
  const pull = async () => {
    setRefreshing(true);
    await feed.refresh();
    setRefreshing(false);
  };
  // A row waiting for the person goes straight to its answer; anything else opens its receipt.
  const openRow = (item: FeedItem) => (item.status === "waiting" && item.needsYouId ? router.push({ pathname: "/needs-you/[id]", params: { id: item.needsYouId } }) : setOpen(item));

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5"
        contentContainerStyle={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET, paddingBottom: clearance.scroll }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={colors["muted-foreground"]} />}
      >
        <TabHeader />
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
            {t("activity.title")}
          </Text>
          {account ? (
            <Button size="sm" variant="secondary" onPress={() => setExporting(true)}>
              <Icon as={Download} className="size-4" />
              <Text>{t("history.export")}</Text>
            </Button>
          ) : null}
        </View>
        {report ? <ReportCard report={report} /> : null}

        {!account ? (
          <EmptyState
            art={<CoinStack width={ART_WIDTH} />}
            title={t("activity.emptyTitle")}
            body={t("activity.emptyBody")}
            action={
              <Button onPress={signIn.open}>
                <Text>{t("signIn.title")}</Text>
              </Button>
            }
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist">
              {FILTERS.map((entry) => (
                <Chip key={entry} active={filter === entry} label={t(LABEL[entry])} count={entry === "needs_you" ? feed.needsYou : undefined} onPress={() => setFilter(entry)} />
              ))}
            </ScrollView>

            {feed.stale ? (
              <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-2.5">
                <Text accessibilityLiveRegion="polite" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
                  {t("activity.stale")}
                </Text>
                <Button size="sm" variant="ghost" onPress={() => void feed.refresh()}>
                  <Text className="text-foreground">{t("common.retry")}</Text>
                </Button>
              </View>
            ) : null}

            {feed.status === "loading" ? (
              <ListGroup>
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <ActivityRowSkeleton key={i} />
                ))}
              </ListGroup>
            ) : feed.status === "error" && feed.items.length === 0 ? (
              <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
                <Text className="text-muted-foreground flex-1 text-sm">{t("activity.loadFailed")}</Text>
                <Button size="sm" variant="secondary" onPress={() => void feed.refresh()}>
                  <Text>{t("common.retry")}</Text>
                </Button>
              </View>
            ) : items.length === 0 ? (
              <EmptyState
                art={<CoinStack width={ART_WIDTH} />}
                title={filter === "needs_you" ? t("activityFeed.emptyNeedsYou") : filter === "all" ? t("activity.emptyTitle") : t("activityFeed.emptyFilter")}
                body={filter !== "all" && feed.items.length > 0 ? t("activity.emptyFilterBody") : t("activity.emptyBody")}
              />
            ) : (
              <ListGroup>
                {items.map((item) => (
                  <FeedRow key={item.id} item={item} onPress={() => openRow(item)} />
                ))}
              </ListGroup>
            )}

            {feed.more ? <Text className="text-muted-foreground pb-2 text-center text-sm">{t("activityFeed.latestOnly")}</Text> : null}
          </>
        )}
      </ScrollView>
      <FeedSheet item={open} onClose={() => setOpen(undefined)} />
      {account ? <ExportSheet open={exporting} onClose={() => setExporting(false)} network={network} /> : null}
    </View>
  );
}
