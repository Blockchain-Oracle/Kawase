// The marketplace (D37: the agent pays for services; this is where a person sees them): Circle's x402 catalog grouped
// into tools. Phone: search, category chips with their counts (21st.dev ddoemonn/filter-grid #23525), rows with the real
// mark, the tool's name, its price per call, "≈ N calls per $1" and 1P/3P. Desktop window: a category sidebar beside a
// grid of cards (21st mohammadshehadeh/ecommerce-04 #29395's sticky filter column). A tool opens in the drawer
// (`?d=<key>`, a right drawer on desktop), where "Try for $0.10" pays from the agent wallet. The agent wallet's balance
// sits in the header and opens its controls; when it runs low a top-up card says so. Guests browse everything (R13).
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CatalogToolView, MarketplaceCategory, PurchaseView } from "@kawase/api-client";
import { useWide } from "@kawase/ui-native/lib/wide";

import { Button, EmptyState, ErrorState, FilterChips, LoadingState, SearchField, StaleTick } from "@/components/kit";
import { ChevronLeft, Icon, Search } from "@/components/kit/icons";
import { LAYOUT, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useSession } from "@/session/session-provider";

import { ToolCard, ToolMark, ToolRow } from "./tool-parts";
import { ToolDrawer } from "./tool-drawer";
import { useAgentWallet } from "./use-agent-wallet";
import { useCatalog } from "./use-catalog";

const GRID_COLUMNS = 3;
/** The category column: names and counts only, so the grid keeps the room (Abu, 10-15: "smaller"). */
const SIDEBAR_WIDTH = 196;
/** How many recent paid calls the strip shows. */
const RECENT_MAX = 8;
const RECENT_CARD = 168;
const DESKTOP_MAX = 1440;
/** Under this the agent wallet cannot pay for a typical call: the top-up card shows. */
const LOW_BALANCE = 100_000n;
const SCROLL_THROTTLE_MS = 64;
const END_REACHED = 0.6;

type Filter = MarketplaceCategory | "ALL";

export function MarketplaceScreen({ openKey }: { openKey?: string | undefined } = {}) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const params = useLocalSearchParams<{ d?: string; q?: string; c?: string }>();
  const [query, setQuery] = React.useState(params.q ?? "");
  const [filter, setFilter] = React.useState<Filter>((params.c as Filter | undefined) ?? "ALL");
  const catalog = useCatalog(query, filter === "ALL" ? null : filter);
  const wallet = useAgentWallet();
  const drawerKey = params.d ?? openKey ?? null;
  const preview = catalog.tools.find((tool) => tool.key === drawerKey);
  const open = (tool: CatalogToolView) => router.setParams({ d: tool.key });
  const close = () => (openKey && !params.d ? router.replace("/marketplace") : router.setParams({ d: undefined }));

  const view = catalog.view;
  const total = view?.categories.reduce((sum, entry) => sum + entry.tools, 0) ?? 0;
  const sideRows = [{ value: "ALL" as Filter, name: t("market402.categoryAll"), count: total }, ...(view?.categories ?? []).filter((entry) => entry.tools > 0).map((entry) => ({ value: entry.id as Filter, name: t(`market402.category_${entry.id}`), count: entry.tools }))];
  const chips = sideRows.map((row) => ({ value: row.value, label: `${row.name} ${row.count}` }));
  const clear = () => {
    setQuery("");
    setFilter("ALL");
  };

  const states =
    catalog.loading && catalog.tools.length === 0 ? (
      <LoadingState shape="list" />
    ) : catalog.failed && catalog.tools.length === 0 ? (
      <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("market402.errorBody")} retry={catalog.reload} />
    ) : catalog.tools.length === 0 ? (
      <EmptyState why={t("market402.emptyTitle")} detail={t("market402.emptyBody")} icon={Search} action={{ label: t("market402.clearFilters"), onPress: clear }} />
    ) : null;
  const stale = catalog.failed && catalog.readAt ? <StaleTick asOf={catalog.readAt} reason="refresh-failed" /> : view?.stale && view.readAt ? <StaleTick asOf={Date.parse(view.readAt)} reason="refresh-failed" /> : null;

  const header = (
    <View style={styles.header}>
      {router.canGoBack() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("market402.back")}
          hitSlop={SPACE.sm}
          onPress={() => {
            fire("tick");
            router.back();
          }}
          style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
        >
          <Icon icon={ChevronLeft} size={SIZE.iconSm} tint={color.ink} />
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={[TYPE.pageTitle, styles.grow, { color: color.ink }]}>
        {t("market402.title")}
      </Text>
      <AgentChip wallet={wallet} />
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      <Stack.Screen options={{ contentStyle: { maxWidth: DESKTOP_MAX, width: "100%", alignSelf: "center" } }} />
      {wide ? (
        <View style={[styles.fill, styles.desktop]}>
          <ScrollView style={[styles.sidebar, { backgroundColor: color.card }]} contentContainerStyle={styles.sidebarBody}>
            <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("market402.categories")}</Text>
            {sideRows.map((row) => {
              const on = row.value === filter;
              return (
                <Pressable
                  key={row.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name} ${row.count}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    fire("tick");
                    setFilter(row.value);
                  }}
                  style={({ pressed }) => [styles.sideRow, { backgroundColor: on ? color.selectedRow : pressed ? color.rowPressed : color.transparent }]}
                >
                  <Text numberOfLines={1} style={[TYPE.row, styles.grow, { color: color.ink }]}>{row.name}</Text>
                  <Text style={[TYPE.meta, { color: color.text3 }]}>{row.count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView style={styles.fill} contentContainerStyle={styles.desktopMain} onScroll={(event) => nearEnd(event.nativeEvent) && catalog.more()} scrollEventThrottle={SCROLL_THROTTLE_MS}>
            {header}
            <LowBalanceCard wallet={wallet} />
            <RecentCalls wallet={wallet} tools={catalog.tools} onOpen={open} />
            <SearchField value={query} onChange={setQuery} placeholder={t("market402.searchPlaceholder")} />
            {stale}
            {states ?? (
              <View style={styles.grid}>
                {chunk(catalog.tools, GRID_COLUMNS).map((row) => (
                  <View key={row.map((tool) => tool.key).join("|")} style={styles.gridRow}>
                    {row.map((tool) => (
                      <ToolCard key={tool.key} tool={tool} onPress={() => open(tool)} />
                    ))}
                    {Array.from({ length: GRID_COLUMNS - row.length }, (_, index) => (
                      <View key={`pad-${index}`} style={styles.gridPad} />
                    ))}
                  </View>
                ))}
                {catalog.loadingMore ? <LoadingState shape="row" /> : null}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        <FlatList
          data={states ? [] : catalog.tools}
          keyExtractor={(tool) => tool.key}
          renderItem={({ item, index }) => <ToolRow tool={item} index={index} onPress={() => open(item)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={catalog.more}
          onEndReachedThreshold={END_REACHED}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.xxxl }]}
          ListHeaderComponent={
            <View style={styles.listHead}>
              {header}
              <LowBalanceCard wallet={wallet} />
              <RecentCalls wallet={wallet} tools={catalog.tools} onOpen={open} />
              <SearchField value={query} onChange={setQuery} placeholder={t("market402.searchPlaceholder")} />
              <FilterChips options={chips} value={filter} onChange={setFilter} label={t("market402.categories")} bleed={SPACE.inset} />
              {stale}
              {states}
            </View>
          }
          ListFooterComponent={catalog.loadingMore ? <LoadingState shape="row" /> : null}
        />
      )}
      {drawerKey ? <ToolDrawer toolKey={drawerKey} preview={preview} onClose={close} /> : null}
    </View>
  );
}

/** The agent wallet's balance, one tap from its controls (signed-in people only). */
type Wallet = ReturnType<typeof useAgentWallet>;

function AgentChip({ wallet }: { wallet: Wallet }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  if (!wallet.account) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("market402.agentWallet")}
      onPress={() => {
        fire("tick");
        router.push("/agent-wallet");
      }}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Text style={[TYPE.chipLabel, { color: color.text2 }]}>{t("market402.agentWalletShort")}</Text>
      <Text style={[TYPE.chipLabel, { color: color.ink }]}>{wallet.view ? wallet.price(wallet.view.balances.total) : "—"}</Text>
    </Pressable>
  );
}

/** When the agent wallet cannot pay for a call: one card with the fix. */
function LowBalanceCard({ wallet }: { wallet: Wallet }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const { status } = useSession();
  if (status !== "account" || !wallet.view || BigInt(wallet.view.balances.total) >= LOW_BALANCE) return null;
  return (
    <View style={[styles.low, { backgroundColor: color.raised2 }]}>
      <View style={styles.grow}>
        <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("market402.lowTitle", { amount: wallet.price(wallet.view.balances.total) })}</Text>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("market402.lowBody")}</Text>
      </View>
      <Button label={t("market402.topUp")} size="sm" block={false} onPress={() => router.push("/agent-wallet")} />
    </View>
  );
}

/**
 * What the agent paid for lately (the agent wallet's purchases): each card the tool's mark, its seller, what it cost and
 * when; a tap opens that tool when the catalog still lists it. Nothing for a guest or before the first call.
 */
function RecentCalls({ wallet, tools, onOpen }: { wallet: Wallet; tools: readonly CatalogToolView[]; onOpen: (tool: CatalogToolView) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const { locale } = useLocale();
  const calls = (wallet.view?.history ?? [])
    .flatMap((item) => (item.kind === "purchase" ? [item.purchase] : []))
    .filter((purchase) => purchase.status !== "declined")
    .slice(0, RECENT_MAX);
  if (!wallet.account || calls.length === 0) return null;
  const toolFor = (purchase: PurchaseView) => tools.find((tool) => tool.provider.name === purchase.provider || tool.name === purchase.provider);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return (
    <View style={styles.recent}>
      <View>
        <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>{t("market402.recentTitle")}</Text>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("market402.recentBody")}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
        {calls.map((purchase) => {
          const tool = toolFor(purchase);
          return (
            <Pressable
              key={purchase.id}
              accessibilityRole="button"
              disabled={!tool}
              onPress={() => {
                if (!tool) return;
                fire("tick");
                onOpen(tool);
              }}
              style={({ pressed }) => [styles.recentCard, { backgroundColor: pressed ? color.rowPressed : color.card }]}
            >
              {tool ? <ToolMark tool={tool} size={SIZE.markRow} /> : null}
              <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>{tool?.name ?? purchase.provider}</Text>
              <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>{when(purchase.paidAt ?? purchase.createdAt)}</Text>
              <Text style={[TYPE.chipLabel, { color: purchase.status === "failed" || purchase.status === "failed_after_payment" ? color.destructive : color.ink }]}>{wallet.price(purchase.amount)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

const END_SLACK = 600;
function nearEnd(event: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } }): boolean {
  return event.layoutMeasurement.height + event.contentOffset.y >= event.contentSize.height - END_SLACK;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  round: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill },
  list: { paddingHorizontal: SPACE.inset },
  listHead: { gap: SPACE.md, paddingBottom: SPACE.md },
  separator: { height: SPACE.sm },
  low: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
  desktop: { flexDirection: "row", gap: LAYOUT.inset, padding: LAYOUT.inset },
  sidebar: { width: SIDEBAR_WIDTH, flexGrow: 0, borderRadius: RADIUS.lg },
  sidebarBody: { padding: SPACE.lg, gap: SPACE.xs },
  sideRow: { minHeight: SIZE.touch, flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm },
  recent: { gap: SPACE.sm },
  recentRow: { gap: SPACE.sm },
  recentCard: { width: RECENT_CARD, gap: SPACE.xs, padding: SPACE.md, borderRadius: RADIUS.md },
  desktopMain: { gap: SPACE.lg, paddingBottom: SPACE.xxxl },
  grid: { gap: SPACE.md },
  gridRow: { flexDirection: "row", gap: SPACE.md },
  gridPad: { flexGrow: 1, flexBasis: 0 },
});
