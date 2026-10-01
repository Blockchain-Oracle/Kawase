// The Activity tab (journey 11): every USDC and EURC movement on the active network, read from the chain's
// explorer through the api, with filters (all · received · sent), skeleton rows while loading, an inline error
// with Retry, a quiet "couldn't refresh" line over rows from an earlier read, the designed empty state (naming the
// filter when one is on), pull to refresh, and the receipt sheet on tap. The api reads one page of history; when
// older movements exist, the end of the list says so and links the full history on ArcScan (Codex review R15).
// Rows are kept per network, so a switch never relabels another network's. Automations and "needs you" join the
// filters when those stages ship (8/9); Kawase's own decision record per row arrives with Stage 12.
import { useFocusEffect } from "expo-router";
import * as React from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ActivityItem } from "@kawase/api-client";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ActivityRow, ActivityRowSkeleton } from "@/activity/activity-row";
import { ReceiptSheet } from "@/activity/receipt-sheet";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useActivity } from "@/wallet/use-activity";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_WIDTH = 140;
const SKELETON_ROWS = 4;

type Filter = "all" | "in" | "out";

export function ActivityScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const colors = useThemeColors();
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const activity = useActivity(network);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<ActivityItem>();
  const [refreshing, setRefreshing] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      void activity.refresh();
    }, [activity.refresh]),
  );

  const items = activity.items.filter((item) => filter === "all" || item.direction === filter);
  const historyUrl = activity.more ? activity.historyUrl : null;
  const emptyTitle = { all: t("activity.emptyTitle"), in: t("activity.emptyReceived"), out: t("activity.emptySent") }[filter];
  // A filter with nothing in it, over a history that has rows: point back to All rather than "nothing yet".
  const emptyBody = filter !== "all" && activity.items.length > 0 ? t("activity.emptyFilterBody") : t("activity.emptyBody");
  const pull = async () => {
    setRefreshing(true);
    await activity.refresh();
    setRefreshing(false);
  };

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5"
        contentContainerStyle={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET, paddingBottom: clearance.scroll }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={colors["muted-foreground"]} />}
      >
        <Text className="font-display text-foreground text-2xl font-bold">{t("activity.title")}</Text>
        <SegmentedControl
          label={t("activity.title")}
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          options={[
            { value: "all", label: t("activity.filterAll") },
            { value: "in", label: t("activity.received") },
            { value: "out", label: t("activity.sent") },
          ]}
        />

        {activity.stale ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-2.5">
            <Text accessibilityLiveRegion="polite" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
              {t("activity.stale")}
            </Text>
            <Button size="sm" variant="ghost" onPress={() => void activity.refresh()}>
              <Text className="text-foreground">{t("common.retry")}</Text>
            </Button>
          </View>
        ) : null}

        {activity.status === "loading" ? (
          <ListGroup>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <ActivityRowSkeleton key={i} />
            ))}
          </ListGroup>
        ) : activity.status === "error" && activity.items.length === 0 ? (
          <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
            <Text className="text-muted-foreground flex-1 text-sm">{t("activity.loadFailed")}</Text>
            <Button size="sm" variant="secondary" onPress={() => void activity.refresh()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : items.length === 0 ? (
          <EmptyState art={<CoinStack width={ART_WIDTH} />} title={emptyTitle} body={emptyBody} />
        ) : (
          <ListGroup>
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} onPress={() => setOpen(item)} />
            ))}
          </ListGroup>
        )}

        {historyUrl ? (
          <View className="items-center gap-1 pb-2">
            <Text className="text-muted-foreground text-center text-sm">{t("activity.truncated")}</Text>
            <Button variant="link" size="sm" accessibilityRole="link" onPress={() => void Linking.openURL(historyUrl)}>
              <Text>{t("activity.fullHistory")}</Text>
            </Button>
          </View>
        ) : null}
      </ScrollView>
      <ReceiptSheet item={open} onClose={() => setOpen(undefined)} onContactSaved={() => void activity.refresh()} />
    </View>
  );
}
