// The Markets tab (surfaces.md "Markets tab"; plan §D; D1, D36): the shared tab header (Sign in for guests); search by
// name, symbol or address, the Long/Short markets it names on top; segments Watchlist · Trending · Meme · Long/Short ·
// Services (the x402 marketplace, Stage 3) · Stocks & FX · New; on Trending the Long or short cards and a hot-markets carousel; then rows
// with price, 24 h change, volume and liquidity, copycats flagged. Public market data (R13): guests and testnet
// users see mainnet's markets, and testnet says so with the switch. Rate-limited data shows its last snapshot
// with the time. Every row opens the token page; prices are live (read again every few seconds while the list is on
// screen). On a desktop window (Stage 13) the page is a wide centred column with the rows in two columns.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MarketRow, MarketSegment, TokenView } from "@kawase/api-client";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Amount } from "@kawase/ui-native/components/amount";
import { Sparkline } from "@kawase/ui-native/components/area-chart";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { useWide, WIDE_PAGE_PX } from "@kawase/ui-native/lib/wide";

import {
  Button as KitButton,
  EmptyState as KitEmptyState,
  ErrorState,
  FilterChips,
  LiveDot,
  LoadingState,
  RADIUS,
  SearchField,
  StaleTick,
} from "@/components/kit";
import { SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { MainnetConsentSheet } from "@/components/network-pill";
import { TabHeader } from "@/components/tab-header";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMarket, useTokenSearch } from "@/markets/use-markets";
import { change, money, price } from "@/portfolio/format";
import { useFx } from "@/portfolio/use-fx";
import { tokenChip } from "@/portfolio/token-chip";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { LongShortMatches, LongShortRow } from "@/markets/long-short-row";
import { LongShortSegment } from "@/markets/long-short-segment";
import { useRecentSearches } from "@/markets/recent-searches";
import { WatchlistSegment } from "@/markets/watchlist-segment";
import { ServicesSection } from "@/marketplace/services-section";

/** The Markets segments, the person's Watchlist first (the stars from token pages). */
type Segment = MarketSegment | "watchlist" | "services";
const SEGMENTS: readonly Segment[] = ["watchlist", "trending", "meme", "perps", "services", "fx", "new"];
const SEGMENT_KEYS: Record<Segment, string> = {
  watchlist: "markets.watchlist",
  trending: "markets.trending",
  meme: "markets.meme",
  perps: "markets.perps",
  services: "markets.services",
  fx: "markets.fx",
  new: "markets.new",
};
const HOT_COUNT = 6;
const WIDE_ROW_COLUMNS = 2;
const HOT_CARD_WIDTH = 148;
/** The card's own padding on both sides (p-4), and its sparkline's height. */
const HOT_CARD_PADDING = 32;
const HOT_SPARK_HEIGHT = 28;
const HOT_MARK = 32;
const EDGE_INSET = 12;
const STRIP_INSET = 6;

/** Opens a token's page on its own network. */
export const tokenHref = (token: Pick<TokenView, "chainId" | "address">) =>
  `/token/${token.chainId}/${token.address}` as const;

export function MarketsScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const colors = useThemeColors();
  const { color: kit } = useTheme();
  const wide = useWide();
  const { user } = useSession();
  const networkSwitch = useNetworkSwitch();
  const [segment, setSegment] = React.useState<Segment>("trending");
  const [query, setQuery] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const recentSearches = useRecentSearches();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  // Markets live on mainnet; a testnet session still reads them, labelled.
  const { market, loading, error, refresh } = useMarket(
    segment === "watchlist" || segment === "services" ? "trending" : segment,
    "mainnet",
  );
  const { results, searching } = useTokenSearch(query, "mainnet");
  const fx = useFx();
  const open = (token: Pick<TokenView, "chainId" | "address">) => router.push(tokenHref(token));
  const rows = market?.rows ?? [];
  // A fake stays in the list with its chip (copycats are flagged), but is never promoted to the carousel.
  const promoted = rows.filter((row) => row.token.status !== "impersonator");

  const sparkColors = { up: colors.success, down: colors.destructive };
  const rowProps = (row: MarketRow) => {
    const chip = tokenChip(row.token, t);
    const changeLabel = change(row.change24hPct, locale);
    // One fact that always fits under the name: market cap, else the day's volume (liquidity is on the token page).
    const details =
      row.marketCapUsd !== null
        ? t("markets.mcap", { value: money(row.marketCapUsd, fx, locale, { compact: true }) })
        : row.volume24hUsd !== null
          ? t("markets.vol", { value: money(row.volume24hUsd, fx, locale, { compact: true }) })
          : "";
    return {
      token: row.token,
      amount: details,
      value: price(row.priceUsd, fx, locale),
      tick: row.priceUsd,
      change24hPct: row.change24hPct,
      ...(changeLabel ? { changeLabel } : {}),
      ...(chip ? { chip } : {}),
      // Hourly closes over 24 h, when the api's cache has them (it fills them in a few minutes).
      ...(row.spark ? { spark: { values: row.spark, colors: sparkColors } } : {}),
      onPress: () => open(row.token),
    };
  };

  return (
    <View className="bg-background flex-1">
      {testnet ? (
        <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} />
      ) : null}
      {wide ? null : (
        <TabHeader className="px-5 pb-2" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }} />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName={cn("gap-5 px-5 pt-2", wide && "px-10 pt-8")}
        contentContainerStyle={[
          { paddingBottom: clearance.scroll },
          wide ? { width: "100%", maxWidth: WIDE_PAGE_PX, alignSelf: "center" } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: kit.ink }]}>
          {t("markets.title")}
        </Text>

        <SearchField
          value={query}
          onChange={setQuery}
          onFocus={() => setSearchFocused(true)}
          placeholder={t("markets.search")}
        />

        {query.trim() ? <LongShortMatches query={query.trim()} /> : null}
        {query.trim() ? (
          searching && results.length === 0 ? (
            <LoadingState shape="list" />
          ) : results.length > 0 ? (
            <ListGroup>
              {results.map((result) => {
                const chip = tokenChip(result.token, t);
                return (
                  <AssetRow
                    key={result.token.address}
                    token={result.token}
                    amount={
                      result.liquidityUsd !== null
                        ? t("markets.liq", { value: money(result.liquidityUsd, fx, locale, { compact: true }) })
                        : result.token.symbol
                    }
                    value={price(result.priceUsd, fx, locale)}
                    {...(chip ? { chip } : {})}
                    onPress={() => {
                      void recentSearches.remember(result.token);
                      open(result.token);
                    }}
                  />
                );
              })}
            </ListGroup>
          ) : (
            <Text className="text-muted-foreground py-6 text-center text-base">{t("assets.noMatch")}</Text>
          )
        ) : (
          <>
            {searchFocused && recentSearches.recent.length > 0 ? (
              <View className="gap-2">
                <View className="flex-row items-center justify-between px-1">
                  <Eyebrow>{t("markets.recent")}</Eyebrow>
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={() => void recentSearches.clear()}>
                    <Text className="text-muted-foreground text-xs font-semibold">{t("markets.recentClear")}</Text>
                  </Pressable>
                </View>
                <ListGroup>
                  {recentSearches.recent.map((token) => (
                    <AssetRow
                      key={`${token.chainId}:${token.address}`}
                      token={token}
                      amount={token.symbol}
                      value=""
                      onPress={() => open(token)}
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}
            {/* One line, not a panel (the plan's Markets rule): the prices below are mainnet's, and one tap goes there. */}
            {testnet ? (
              <View
                style={[styles.testnetLine, { backgroundColor: kit.raised2 }]}
                accessibilityHint={t("markets.testnetBody")}
              >
                <LiveDot />
                <Text numberOfLines={1} style={[TYPE.label, styles.grow, { color: kit.ink }]}>
                  {t("markets.testnetTitle")}
                </Text>
                {networkSwitch.nextAvailable ? (
                  <KitButton
                    label={t("markets.switchToMainnet")}
                    size="sm"
                    block={false}
                    variant="primary"
                    loading={networkSwitch.busy}
                    onPress={() => void networkSwitch.switchNetwork("mainnet")}
                  />
                ) : null}
              </View>
            ) : null}

            <FilterChips
              options={SEGMENTS.map((value) => ({ value, label: t(SEGMENT_KEYS[value]) }))}
              value={segment}
              onChange={(next) => {
                setSearchFocused(false);
                setSegment(next);
              }}
              label={t("markets.segmentsLabel")}
              bleed={wide ? 0 : SPACE.inset}
            />

            {market?.stale && segment !== "services" ? (
              <StaleTick asOf={Date.parse(market.pricedAt)} reason="refresh-failed" />
            ) : null}

            {segment === "services" ? (
              <ServicesSection />
            ) : segment === "watchlist" ? (
              <WatchlistSegment />
            ) : segment === "perps" ? (
              <LongShortSegment />
            ) : loading && rows.length === 0 ? (
              <LoadingState shape="list" />
            ) : error && rows.length === 0 ? (
              <ErrorState
                diagnosis={{ kind: "server", retryable: true }}
                stillWorks={t("markets.loadFailed")}
                retry={() => void refresh()}
              />
            ) : rows.length === 0 ? (
              <KitEmptyState why={t("markets.empty")} size="inline" />
            ) : (
              <>
                {segment === "trending" ? <LongShortRow onSeeAll={() => setSegment("perps")} /> : null}
                <View className="gap-2">
                  <Eyebrow className="px-1">{t("markets.hot")}</Eyebrow>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
                    {promoted.slice(0, HOT_COUNT).map((row) => {
                      const changeLabel = change(row.change24hPct, locale);
                      return (
                        <Pressable
                          key={row.token.address}
                          accessibilityRole="button"
                          accessibilityLabel={[row.token.name, price(row.priceUsd, fx, locale), changeLabel]
                            .filter(Boolean)
                            .join(", ")}
                          onPress={() => open(row.token)}
                          className="bg-card border-border active:bg-muted gap-3 rounded-2xl border p-4"
                          style={{ width: HOT_CARD_WIDTH }}
                        >
                          <TokenMark token={row.token} size={HOT_MARK} />
                          <View className="gap-0.5">
                            <Text numberOfLines={1} className="text-foreground text-base font-semibold">
                              {row.token.symbol}
                            </Text>
                            <Amount className="text-foreground text-sm">{price(row.priceUsd, fx, locale)}</Amount>
                            {changeLabel ? (
                              <Amount
                                className={cn(
                                  "text-sm",
                                  (row.change24hPct ?? 0) >= 0 ? "text-success" : "text-destructive",
                                )}
                              >
                                {changeLabel}
                              </Amount>
                            ) : null}
                          </View>
                          {row.spark ? (
                            <Sparkline
                              values={row.spark}
                              width={HOT_CARD_WIDTH - HOT_CARD_PADDING}
                              height={HOT_SPARK_HEIGHT}
                              colors={sparkColors}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {wide ? (
                  // Two columns of rows on a desktop window: the list reads down the first, then the second.
                  <View className="flex-row items-start gap-4">
                    {[
                      rows.slice(0, Math.ceil(rows.length / WIDE_ROW_COLUMNS)),
                      rows.slice(Math.ceil(rows.length / WIDE_ROW_COLUMNS)),
                    ].map((half, column) => (
                      <View key={column} className="min-w-0 flex-1">
                        <ListGroup>
                          {half.map((row) => (
                            <AssetRow key={row.token.address} {...rowProps(row)} />
                          ))}
                        </ListGroup>
                      </View>
                    ))}
                  </View>
                ) : (
                  <ListGroup>
                    {rows.map((row) => (
                      <AssetRow key={row.token.address} {...rowProps(row)} />
                    ))}
                  </ListGroup>
                )}
                {market ? (
                  <Text className="text-muted-foreground text-center text-xs">
                    {t("markets.updated", { time: new Date(market.pricedAt).toLocaleTimeString(locale) })}
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
      <MainnetConsentSheet
        open={networkSwitch.consentNeeded}
        busy={networkSwitch.busy}
        onAccept={() => void networkSwitch.acceptMainnet()}
        onClose={networkSwitch.dismissConsent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  testnetLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderRadius: RADIUS.pill,
    paddingStart: SPACE.lg,
    paddingEnd: SPACE.xs,
    minHeight: 48,
  },
  grow: { flex: 1 },
});
