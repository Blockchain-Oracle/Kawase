// The Markets tab (surfaces.md "Markets tab"; D1, D36): search by name, symbol or address; segments Trending · Meme ·
// Long/Short · Stocks & FX · New; a hot-markets carousel; the heatmap (21st.dev 30551) for the segment; then rows
// with price, 24 h change, volume and liquidity, copycats flagged. Public market data (R13): guests and testnet
// users see mainnet's markets, and testnet says so with the switch. Rate-limited data shows its last snapshot
// with the time. Every row opens the token page.
import { useRouter } from "expo-router";
import { Search, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MarketRow, MarketSegment, TokenView } from "@kawase/api-client";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { MarketHeatmap } from "@kawase/ui-native/components/market-heatmap";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, INPUT_TEXT_START, TEXT_START } from "@kawase/ui-native/lib/utils";

import { HeaderAvatar } from "@/components/header-avatar";
import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { MainnetConsentSheet, NetworkPill } from "@/components/network-pill";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { InboxBell } from "@/inbox/inbox-bell";
import { useMarket, useTokenSearch } from "@/markets/use-markets";
import { change, money, price, USD_FX } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const SEGMENTS: readonly MarketSegment[] = ["trending", "meme", "perps", "fx", "new"];
const SEGMENT_KEYS: Record<MarketSegment, string> = { trending: "markets.trending", meme: "markets.meme", perps: "markets.perps", fx: "markets.fx", new: "markets.new" };
const HOT_COUNT = 6;
const HEAT_COUNT = 16;
const SKELETON_ROWS = 6;
const SKELETON_ROW_HEIGHT = 64;
const HOT_CARD_WIDTH = 148;
const HOT_MARK = 32;
const EDGE_INSET = 12;
const STRIP_INSET = 6;

/** Opens a token's page on its own network. */
export const tokenHref = (token: Pick<TokenView, "chainId" | "address">) => `/token/${token.chainId}/${token.address}` as const;

export function MarketsScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const colors = useThemeColors();
  const { status, user } = useSession();
  const networkSwitch = useNetworkSwitch();
  const [segment, setSegment] = React.useState<MarketSegment>("trending");
  const [query, setQuery] = React.useState("");
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const account = status === "account";
  // Markets live on mainnet; a testnet session still reads them, labelled.
  const { market, loading, error, refresh } = useMarket(segment, "mainnet");
  const { results, searching } = useTokenSearch(query, "mainnet");
  const fx = USD_FX;
  const open = (token: Pick<TokenView, "chainId" | "address">) => router.push(tokenHref(token));
  const rows = market?.rows ?? [];
  // A fake stays in the list with its chip (copycats are flagged), but is never promoted to the carousel or the map.
  const promoted = rows.filter((row) => row.token.status !== "impersonator");

  const rowProps = (row: MarketRow) => {
    const chip = tokenChip(row.token, t);
    const changeLabel = change(row.change24hPct, locale);
    const details = [row.volume24hUsd !== null ? t("markets.vol", { value: money(row.volume24hUsd, fx, locale, { compact: true }) }) : null, row.liquidityUsd !== null ? t("markets.liq", { value: money(row.liquidityUsd, fx, locale, { compact: true }) }) : null]
      .filter(Boolean)
      .join(" · ");
    return {
      token: row.token,
      amount: details,
      value: price(row.priceUsd, fx, locale),
      change24hPct: row.change24hPct,
      ...(changeLabel ? { changeLabel } : {}),
      ...(chip ? { chip } : {}),
      onPress: () => open(row.token),
    };
  };

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center justify-between gap-3 px-5 pb-2" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <View className="flex-row items-center gap-2">
          <HeaderAvatar />
          {!account ? <LanguagePill onPress={() => setLanguageOpen(true)} /> : null}
          <NetworkPill />
        </View>
        {account ? <InboxBell /> : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pt-2" contentContainerStyle={{ paddingBottom: clearance.scroll }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}>
          {t("markets.title")}
        </Text>

        <View className="bg-muted flex-row items-center gap-2 rounded-2xl px-4">
          <Icon as={Search} className="text-muted-foreground size-5" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("markets.search")}
            placeholderTextColor={colors["muted-foreground"]}
            accessibilityLabel={t("markets.search")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className={cn("text-foreground h-12 flex-1 text-base", INPUT_TEXT_START)}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => setQuery("")}>
              <Icon as={X} className="text-muted-foreground size-5" />
            </Pressable>
          ) : null}
        </View>

        {query.trim() ? (
          searching && results.length === 0 ? (
            <SkeletonRows />
          ) : results.length > 0 ? (
            <ListGroup>
              {results.map((result) => {
                const chip = tokenChip(result.token, t);
                return (
                  <AssetRow
                    key={result.token.address}
                    token={result.token}
                    amount={result.liquidityUsd !== null ? t("markets.liq", { value: money(result.liquidityUsd, fx, locale, { compact: true }) }) : result.token.symbol}
                    value={price(result.priceUsd, fx, locale)}
                    {...(chip ? { chip } : {})}
                    onPress={() => open(result.token)}
                  />
                );
              })}
            </ListGroup>
          ) : (
            <Text className="text-muted-foreground py-6 text-center text-base">{t("assets.noMatch")}</Text>
          )
        ) : (
          <>
            {testnet ? (
              <View className="bg-card border-border gap-3 rounded-2xl border p-4">
                <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("markets.testnetTitle")}</Text>
                <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("markets.testnetBody")}</Text>
                {networkSwitch.nextAvailable ? (
                  <Button variant="secondary" onPress={() => void networkSwitch.switchNetwork("mainnet")} disabled={networkSwitch.busy}>
                    <Text>{t("markets.switchToMainnet")}</Text>
                  </Button>
                ) : null}
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist" accessibilityLabel={t("markets.segmentsLabel")}>
              {SEGMENTS.map((value) => {
                const active = value === segment;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSegment(value)}
                    className={cn("rounded-full px-4 py-2", active ? "bg-foreground" : "bg-muted active:bg-secondary")}
                  >
                    <Text className={cn("text-sm font-semibold", active ? "text-background" : "text-muted-foreground")}>{t(SEGMENT_KEYS[value])}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {market?.stale ? <Text className="text-muted-foreground text-xs">{t("markets.stale", { time: new Date(market.pricedAt).toLocaleTimeString(locale) })}</Text> : null}

            {segment === "perps" ? (
              <View className="bg-card border-border rounded-2xl border">
                <EmptyState layout="section" title={t("markets.perps")} body={t("markets.perpsBody")} />
              </View>
            ) : loading && rows.length === 0 ? (
              <SkeletonRows />
            ) : error && rows.length === 0 ? (
              <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
                <Text className="text-muted-foreground flex-1 text-sm">{t("markets.loadFailed")}</Text>
                <Button size="sm" variant="secondary" onPress={() => void refresh()}>
                  <Text>{t("common.retry")}</Text>
                </Button>
              </View>
            ) : rows.length === 0 ? (
              <View className="bg-card border-border rounded-2xl border">
                <EmptyState layout="section" title={t("markets.empty")} />
              </View>
            ) : (
              <>
                <View className="gap-2">
                  <Eyebrow className="px-1">{t("markets.hot")}</Eyebrow>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
                    {promoted.slice(0, HOT_COUNT).map((row) => {
                      const changeLabel = change(row.change24hPct, locale);
                      return (
                        <Pressable
                          key={row.token.address}
                          accessibilityRole="button"
                          accessibilityLabel={[row.token.name, price(row.priceUsd, fx, locale), changeLabel].filter(Boolean).join(", ")}
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
                            {changeLabel ? <Amount className={cn("text-sm", (row.change24hPct ?? 0) >= 0 ? "text-success" : "text-destructive")}>{changeLabel}</Amount> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="gap-2">
                  <Eyebrow className="px-1">{t("markets.heatmap")}</Eyebrow>
                  <MarketHeatmap
                    colors={{ up: colors.success, down: colors.destructive, flat: colors.muted, text: colors.foreground }}
                    tiles={promoted.slice(0, HEAT_COUNT).map((row) => ({
                      key: row.token.address,
                      label: row.token.symbol,
                      weight: row.volume24hUsd ?? row.liquidityUsd ?? 0,
                      change: row.change24hPct,
                      ...(change(row.change24hPct, locale) ? { changeLabel: change(row.change24hPct, locale)! } : {}),
                      accessibilityLabel: [row.token.name, change(row.change24hPct, locale)].filter(Boolean).join(", "),
                      onPress: () => open(row.token),
                    }))}
                  />
                </View>

                <ListGroup>
                  {rows.map((row) => (
                    <AssetRow key={row.token.address} {...rowProps(row)} />
                  ))}
                </ListGroup>
                {market ? <Text className="text-muted-foreground text-center text-xs">{t("markets.updated", { time: new Date(market.pricedAt).toLocaleTimeString(locale) })}</Text> : null}
              </>
            )}
          </>
        )}
      </ScrollView>
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
  );
}

function SkeletonRows() {
  return (
    <View className="bg-card border-border gap-px overflow-hidden rounded-2xl border">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="rounded-none" style={{ height: SKELETON_ROW_HEIGHT }} />
      ))}
    </View>
  );
}
