// The token page: one template for every asset (surfaces.md "Token page"; R1, R2, R13). Header with the real mark and
// the copycat chip; price and 24 h change; the chart (Balance Chart twin, line of closes) with ranges via the Range
// Navigator pills, a finger scrubs the price; the person's holding; stats; Safety (Kawase's copycat rule + GoPlus,
// lookalikes linked); About; and a sticky bar with Buy · Sell and a More sheet where every other action is listed
// with its reason when it cannot be done here. Guests see everything; any write asks them to sign in in place.
// Extras: a star (the Markets Watchlist) and share in the header; the chart as a line or as candles (21st ssychui
// Candle Chart twin) with the interval pills; the person's own trades' profit and loss; this asset's Activity.
// On a desktop window (Stage 13) the page is two columns: everything above on the left, a taller chart and stats in
// threes, and the swap ticket itself on the right (Buy · Sell, the same ticket as /swap, inline), with More in the
// header instead of the sticky bar.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ChevronLeft,
  MoreHorizontal,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
} from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { ChartRange, TokenAction, TokenActionView } from "@kawase/api-client";
import { PUBLIC_LINKS } from "@kawase/config";
import { CHAIN_IDS } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { AreaChart, RangePills, type ChartPoint } from "@kawase/ui-native/components/area-chart";
import { CandleChart, type CandlePoint } from "@kawase/ui-native/components/candle-chart";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { useWide, WEB_HOVER_MUTED, WEB_HOVER_SECONDARY } from "@kawase/ui-native/lib/wide";

import { MainnetConsentSheet } from "@/components/network-pill";
import { useT } from "@/i18n";
import { LaunchpadCard } from "@/launchpad/launchpad-card";
import { useLocale } from "@/i18n/locale-provider";
import { change, holdingAmount, money, price, shortAddress } from "@/portfolio/format";
import { useFx } from "@/portfolio/use-fx";
import { tokenChip } from "@/portfolio/token-chip";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { FeedRow } from "@/activity/feed-row";
import { useToken, useTokenChart } from "@/token/use-token";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { SwapScreen } from "@/screens/swap-screen";
import { PriceAlertSheet } from "@/token/price-alert-sheet";
import { useTokenMine } from "@/token/use-token-mine";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { withdrawHref } from "@/withdraw/href";

const RANGES: readonly ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];
const MARK = 36;
const BACK = 40;
const EDGE_INSET = 12;
const CHART_HEIGHT = 200;
const ABOUT_LINES = 4;
const SECONDS_TO_MS = 1000;
/** Room under the content for the sticky action bar. */
const SCROLL_BOTTOM = 96;
/** A desktop window: air above the header (no status bar), a taller chart, the ticket's column, the end of the page. */
const WIDE_TOP = 32;
const WIDE_CHART_HEIGHT = 320;
const TICKET_COLUMN_PX = 400;
const WIDE_END = 48;
/** Stats per row: two on a phone, three on a desktop window. */
const STAT_WIDTH = { phone: "w-1/2", wide: "w-1/3" } as const;
const WEB_STAT = Platform.select({ web: "rounded-xl transition-colors hover:bg-muted/60", default: "" });
const ZERO = 0n;
/** Actions that move or receive money: they need a signed-in account and the token's own network. */
const WRITES: ReadonlySet<TokenAction> = new Set([
  "buy",
  "sell",
  "send",
  "receive",
  "withdraw",
  "bridge",
  "earn",
  "borrow",
  "long_short",
  "alert",
]);

const ARC_MAINNET = 5042;
const NEVER_HIDDEN: ReadonlySet<string> = new Set(["dollar", "bitcoin", "ether"]);

export function TokenScreen({ chainId, address }: { chainId: number; address: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const wide = useWide();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const { detail, error, loading, refresh } = useToken(chainId, address);
  const [range, setRange] = React.useState<ChartRange>("1D");
  const candles = useTokenChart(chainId, address, range);
  const mine = useTokenMine(chainId, address);
  // The person's holdings on other chains: the same token there is part of "my holding" (§D: across chains).
  const portfolio = usePortfolio();
  const refreshPortfolio = portfolio.refresh;
  React.useEffect(() => {
    if (status === "account") void refreshPortfolio();
  }, [status, refreshPortfolio]);
  const [chartKind, setChartKind] = React.useState<"line" | "candles">("line");
  const [scrub, setScrub] = React.useState<ChartPoint | null>(null);
  const [candleScrub, setCandleScrub] = React.useState<CandlePoint | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [alertOpen, setAlertOpen] = React.useState(false);
  // The inline ticket's side on a desktop window.
  const [side, setSide] = React.useState<"buy" | "sell">("buy");
  const chartHeight = wide ? WIDE_CHART_HEIGHT : CHART_HEIGHT;
  const top = wide ? WIDE_TOP : insets.top + EDGE_INSET;
  const fx = useFx();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/markets"));

  const activeChain = user?.activeNetwork === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;
  const points: ChartPoint[] = (candles ?? []).map((candle) => ({ t: candle.t, v: candle.c }));

  if (!detail) {
    return (
      <View className="bg-background flex-1" style={{ paddingTop: top }}>
        <View className={wide ? "px-8" : "px-5"}>
          <BackButton label={t("common.back")} onPress={leave} />
        </View>
        {loading ? (
          <View className={cn("gap-4 px-5 pt-4", wide && "px-8")}>
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </View>
        ) : (
          <EmptyState
            title={error === "not_found" ? t("tokenPage.notFound") : t("common.error")}
            action={
              <Button variant="secondary" onPress={() => void refresh()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            }
          />
        )}
      </View>
    );
  }

  const token = detail.token;
  const chip = tokenChip(token, t);
  const shownPrice = scrub ? scrub.v : candleScrub ? candleScrub.c : detail.market.priceUsd;
  const scrubbedAt = scrub?.t ?? candleScrub?.t;
  const changeLabel = change(detail.market.change24hPct, locale);
  const holds = detail.holding && BigInt(detail.holding.balance) > ZERO;
  const elsewhere = (portfolio.portfolio?.otherChains ?? []).filter((holding) => holding.token.symbol.toUpperCase() === token.symbol.toUpperCase());

  /** The page's own reason first (another network, signing in), then the api's (R2). */
  const reasonFor = (action: TokenActionView): string | null => {
    if (WRITES.has(action.id) && token.chainId !== activeChain) return t("tokenPage.n_mainnet_only");
    if (!action.available) return t(`tokenPage.n_${action.reason ?? "blocked"}`);
    return null;
  };

  const run = (action: TokenAction) => {
    setMoreOpen(false);
    // A desktop window has the ticket on the page: Buy and Sell turn it to that side.
    if (wide && (action === "buy" || action === "sell")) {
      setSide(action);
      return;
    }
    if (WRITES.has(action) && status !== "account") {
      signIn.open();
      return;
    }
    switch (action) {
      case "buy":
        router.push({ pathname: "/swap", params: { buy: token.address } });
        return;
      case "sell":
        router.push({ pathname: "/swap", params: { sell: token.address } });
        return;
      case "send":
        router.push({
          pathname: "/send",
          params: { asset: token.symbol === "USDC" || token.symbol === "EURC" ? token.symbol : token.address },
        });
        return;
      case "withdraw":
        router.push(withdrawHref({ assets: [{ asset: token.address, amount: "max" }] }));
        return;
      case "receive":
        // The receive page starts a request for this token (an amount QR any wallet fills in).
        router.push({ pathname: "/wallet/receive", params: { asset: token.address, chainId: String(token.chainId), symbol: token.symbol, decimals: String(token.decimals), name: token.name } });
        return;
      case "bridge":
        // USDC by CCTP; any other token as itself through the cross-chain routes.
        if (token.kind === "dollar") router.push("/bridge");
        else router.push({ pathname: "/move", params: { direction: "out", asset: token.address } });
        return;
      case "borrow":
        router.push({ pathname: "/borrow", params: { action: "borrow", asset: token.symbol } });
        return;
      case "alert":
        setAlertOpen(true);
        return;
      case "earn":
        // Earn on this very token (the universal picker starts on it).
        router.push({ pathname: "/earn", params: { asset: token.address, chainId: String(token.chainId), symbol: token.symbol, decimals: String(token.decimals), name: token.name } });
        return;
      case "long_short":
        router.push({ pathname: "/margin", params: { market: token.symbol } });
        return;
      default:
    }
  };

  const action = (id: TokenAction) => detail.actions.find((entry) => entry.id === id)!;
  const buy = action("buy");
  const sell = action("sell");
  const buyReason = reasonFor(buy);
  const sellReason = reasonFor(sell);
  const sideReason = side === "buy" ? buyReason : sellReason;
  // A mainnet token seen from testnet: "Mainnet only — switch?" is the switch (the page is the same token after it).
  const toMainnet = activeChain !== CHAIN_IDS.arc && token.chainId === CHAIN_IDS.arc;
  const switchToMainnet = () => {
    setMoreOpen(false);
    void networkSwitch.switchNetwork("mainnet");
  };
  const fixable = (entry: TokenActionView) => toMainnet && reasonFor(entry) === t("tokenPage.n_mainnet_only");
  // Hide (capability-matrix H): a held token can leave Home's list for Hidden, and come back; the dollars, euros,
  // Bitcoin and Ether are never hidden.
  const hideable = Boolean(holds && detail.holding) && !NEVER_HIDDEN.has(token.kind) && token.symbol !== "EURC";
  const hidden = detail.holding?.hidden ?? false;
  const toggleHidden = async () => {
    setMoreOpen(false);
    try {
      await portfolio.setVisibility(token.address, hidden ? "shown" : "hidden");
      await refresh();
      toast(hidden ? t("tokenPage.shownToast") : t("tokenPage.hiddenToast"));
    } catch {
      toast(t("common.error"));
    }
  };
  // The inline ticket's one way past its reason: a mainnet token from testnet switches (a guest signs in on the way),
  // a guest signs in, and nothing to sell turns the ticket to Buy.
  const sideFix =
    sideReason && toMainnet
      ? { label: t("markets.switchToMainnet"), onPress: switchToMainnet }
      : sideReason && status !== "account"
        ? { label: t("policy.fixSignIn"), onPress: signIn.open }
        : sideReason && side === "sell" && !buyReason
          ? { label: t("tokenPage.a_buy"), onPress: () => setSide("buy") }
          : undefined;

  const copy = async () => {
    await Clipboard.setStringAsync(token.address);
    toast(t("tokenPage.copied"));
  };

  const stats: { label: string; value: string; onPress?: () => void }[] = [
    { label: t("tokenPage.marketCap"), value: money(detail.market.marketCapUsd, fx, locale, { compact: true }) },
    { label: t("tokenPage.liquidity"), value: money(detail.market.liquidityUsd, fx, locale, { compact: true }) },
    { label: t("tokenPage.volume"), value: money(detail.market.volume24hUsd, fx, locale, { compact: true }) },
    {
      label: t("tokenPage.holders"),
      value: detail.market.holders !== null ? new Intl.NumberFormat(locale).format(detail.market.holders) : "—",
    },
    { label: t("tokenPage.fdv"), value: money(detail.market.fdvUsd, fx, locale, { compact: true }) },
    { label: t("tokenPage.contract"), value: shortAddress(token.address), onPress: () => void copy() },
  ];

  const safetyTone =
    detail.safety.level === "block"
      ? "text-destructive"
      : detail.safety.level === "caution"
        ? "text-foreground"
        : "text-success";
  const safetyIcon =
    detail.safety.level === "block" ? ShieldAlert : detail.safety.level === "caution" ? AlertTriangle : ShieldCheck;

  const page = (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn("gap-6 px-5 pt-2", wide && "px-0")}
      contentContainerStyle={{ paddingBottom: wide ? WIDE_END : SCROLL_BOTTOM }}
    >
      <View className="gap-1">
        <Amount accessibilityLiveRegion="polite" className="font-display text-foreground text-4xl font-bold">
          {price(shownPrice, fx, locale)}
        </Amount>
        {scrubbedAt !== undefined ? (
          <Text className="text-muted-foreground text-sm">
            {new Date(scrubbedAt * SECONDS_TO_MS).toLocaleString(locale)}
          </Text>
        ) : changeLabel ? (
          <Amount
            className={cn("text-base", (detail.market.change24hPct ?? 0) >= 0 ? "text-success" : "text-destructive")}
          >
            {t("assets.today", { change: changeLabel })}
          </Amount>
        ) : null}
      </View>

      <View className="gap-3">
        <View accessibilityRole="radiogroup" className="bg-muted flex-row self-end rounded-full p-0.5">
          {(["line", "candles"] as const).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: chartKind === kind }}
              onPress={() => setChartKind(kind)}
              className={cn("rounded-full px-3 py-1", chartKind === kind && "bg-background")}
            >
              <Text
                className={cn(
                  "text-xs font-semibold",
                  chartKind === kind ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t(`tokenPage.chart_${kind}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {candles === undefined ? (
          <Skeleton className="rounded-2xl" style={{ height: chartHeight }} />
        ) : chartKind === "candles" && (candles?.length ?? 0) > 0 ? (
          <CandleChart
            candles={candles}
            height={chartHeight}
            colors={{
              up: colors.success,
              down: colors.destructive,
              muted: colors["muted-foreground"],
              grid: colors.border,
              scrub: colors.border,
            }}
            formatValue={(value) => price(value, fx, locale)}
            onScrub={setCandleScrub}
            accessibilityLabel={t("assets.chartLabel", { range, value: price(detail.market.priceUsd, fx, locale) })}
          />
        ) : points.length > 1 ? (
          <AreaChart
            points={points}
            height={chartHeight}
            colors={{
              up: colors.success,
              down: colors.destructive,
              muted: colors["muted-foreground"],
              scrub: colors.border,
            }}
            formatValue={(value) => price(value, fx, locale)}
            onScrub={setScrub}
            accessibilityLabel={t("assets.chartLabel", { range, value: price(detail.market.priceUsd, fx, locale) })}
          />
        ) : (
          <View
            className="bg-card border-border items-center justify-center rounded-2xl border"
            style={{ height: chartHeight }}
          >
            <Text className="text-muted-foreground text-sm">{t("tokenPage.noChart")}</Text>
          </View>
        )}
        <RangePills ranges={RANGES} value={range} onChange={setRange} label={t("assets.rangeLabel")} />
      </View>

      {(holds && detail.holding) || elsewhere.length > 0 ? (
        <View className="bg-card border-border gap-1 rounded-2xl border p-4">
          <Eyebrow>{t("tokenPage.myHolding")}</Eyebrow>
          {holds && detail.holding ? (
            <>
              <Amount className="text-foreground text-xl font-semibold">{holdingAmount(detail.holding, locale)}</Amount>
              <Text className="text-muted-foreground text-sm">
                {t("tokenPage.worth", { value: money(detail.holding.valueUsd, fx, locale) })}
              </Text>
            </>
          ) : null}
          {/* The same token on other chains (one address everywhere), with the way to bring it to Arc. */}
          {elsewhere.map((holding) => (
            <View key={`${holding.token.chainId}:${holding.token.address}`} className="flex-row items-center gap-2 pt-2">
              <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
                {t("tokenPage.onChain", { amount: holdingAmount(holding, locale), chain: holding.chainName })}
              </Text>
              <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: "/move", params: { direction: "in" } })}>
                <Text>{t("assets.bringToArc")}</Text>
              </Button>
            </View>
          ))}
        </View>
      ) : null}

      {mine.trades ? (
        <View className="bg-card border-border gap-3 rounded-2xl border p-4">
          <Eyebrow>{t("tokenPage.yourTrades", { count: mine.trades.trades })}</Eyebrow>
          <View className="flex-row flex-wrap gap-y-3">
            <View className="w-1/2 gap-0.5">
              <Text className="text-muted-foreground text-xs">{t("tokenPage.avgCost")}</Text>
              <Amount className="text-foreground text-base">
                {mine.trades.avgCostUsd !== null ? price(mine.trades.avgCostUsd, fx, locale) : "—"}
              </Amount>
            </View>
            <View className="w-1/2 gap-0.5">
              <Text className="text-muted-foreground text-xs">{t("tokenPage.costBasis")}</Text>
              <Amount className="text-foreground text-base">{money(mine.trades.costBasisUsd, fx, locale)}</Amount>
            </View>
            <View className="w-1/2 gap-0.5">
              <Text className="text-muted-foreground text-xs">{t("tokenPage.unrealized")}</Text>
              <Amount
                className={cn(
                  "text-base",
                  (mine.trades.unrealizedUsd ?? 0) >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {mine.trades.unrealizedUsd !== null
                  ? `${mine.trades.unrealizedUsd >= 0 ? "+" : "−"}${money(Math.abs(mine.trades.unrealizedUsd), fx, locale)}`
                  : "—"}
              </Amount>
            </View>
            <View className="w-1/2 gap-0.5">
              <Text className="text-muted-foreground text-xs">{t("tokenPage.realized")}</Text>
              <Amount className={cn("text-base", mine.trades.realizedUsd >= 0 ? "text-success" : "text-destructive")}>
                {`${mine.trades.realizedUsd >= 0 ? "+" : "−"}${money(Math.abs(mine.trades.realizedUsd), fx, locale)}`}
              </Amount>
            </View>
          </View>
          <Text className={cn("text-muted-foreground text-xs leading-4", TEXT_START)}>
            {t("tokenPage.tradesNote")}
          </Text>
        </View>
      ) : null}

      {mine.activity && mine.activity.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Eyebrow>{t("tokenPage.activity")}</Eyebrow>
            <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push("/activity")}>
              <Text className="text-muted-foreground text-xs font-semibold">{t("tokenPage.seeAll")}</Text>
            </Pressable>
          </View>
          <View className="bg-card border-border overflow-hidden rounded-2xl border">
            {mine.activity.map((item) => (
              <FeedRow key={item.id} item={item} onPress={() => router.push("/activity")} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Eyebrow className="px-1">{t("tokenPage.stats")}</Eyebrow>
        <View className="bg-card border-border flex-row flex-wrap rounded-2xl border p-2">
          {stats.map((stat) => (
            <Pressable
              key={stat.label}
              disabled={!stat.onPress}
              onPress={stat.onPress}
              accessibilityRole={stat.onPress ? "button" : "text"}
              className={cn(wide ? STAT_WIDTH.wide : STAT_WIDTH.phone, "gap-0.5 p-2 active:opacity-70", stat.onPress && WEB_STAT)}
            >
              <Text className="text-muted-foreground text-xs">{stat.label}</Text>
              <Amount className="text-foreground text-base">{stat.value}</Amount>
            </Pressable>
          ))}
        </View>
      </View>

      {/* B1: a launchpad token's curve and graduation alert (LIFT on Arc mainnet). */}
      {chainId === ARC_MAINNET ? <LaunchpadCard address={address} /> : null}

      <View className="gap-2">
        <Eyebrow className="px-1">{t("tokenPage.safety")}</Eyebrow>
        <View className="bg-card border-border gap-3 rounded-2xl border p-4">
          <View className="flex-row items-center gap-2">
            <Icon as={safetyIcon} className={cn("size-5", safetyTone)} />
            <Text className={cn("text-base font-semibold", safetyTone)}>
              {detail.safety.level === "block"
                ? t("tokenPage.safetyBlock")
                : detail.safety.level === "caution"
                  ? t("tokenPage.safetyCaution")
                  : t("tokenPage.safetyOk")}
            </Text>
          </View>
          {detail.safety.reasons.map((reason) => (
            <Text key={reason} className={cn("text-muted-foreground text-sm", TEXT_START)}>
              • {t(`tokenPage.r_${reason}`)}
            </Text>
          ))}
          <View className="gap-1.5">
            {detail.safety.checks.map((check) => (
              <View key={check.id} className="flex-row items-center justify-between">
                <Text className="text-muted-foreground text-sm">{t(`tokenPage.c_${check.id}`)}</Text>
                <Text
                  className={cn(
                    "text-sm font-medium",
                    check.state === "danger"
                      ? "text-destructive"
                      : check.state === "warn"
                        ? "text-foreground"
                        : check.state === "ok"
                          ? "text-success"
                          : "text-muted-foreground",
                  )}
                >
                  {check.value && check.state !== "unknown"
                    ? `${check.value}${check.id.endsWith("tax") ? "%" : ""}`
                    : t(`tokenPage.s_${check.state}`)}
                </Text>
              </View>
            ))}
          </View>
          <Text className="text-muted-foreground text-xs">
            {detail.safety.checkedBy
              ? t("tokenPage.checkedBy", { name: detail.safety.checkedBy })
              : t("tokenPage.notChecked")}
          </Text>
        </View>
        {detail.safety.lookalikes.length > 0 ? (
          <ListGroup label={t("tokenPage.lookalikes")}>
            {detail.safety.lookalikes.map((other) => (
              <ListRow
                key={other.address}
                title={other.name}
                subtitle={`${shortAddress(other.address)}${other.liquidityUsd ? ` · ${t("markets.liq", { value: money(other.liquidityUsd, fx, locale, { compact: true }) })}` : ""}`}
                chevron
                onPress={() => router.push(`/token/${chainId}/${other.address}`)}
              />
            ))}
          </ListGroup>
        ) : null}
      </View>

      {detail.about.description || detail.about.websites.length > 0 ? (
        <View className="gap-2">
          <Eyebrow className="px-1">{t("tokenPage.about")}</Eyebrow>
          <View className="bg-card border-border gap-3 rounded-2xl border p-4">
            {detail.about.description ? (
              <Pressable onPress={() => setAboutOpen((value) => !value)}>
                <Text
                  numberOfLines={aboutOpen ? undefined : ABOUT_LINES}
                  className={cn("text-foreground text-sm leading-5", TEXT_START)}
                >
                  {detail.about.description}
                </Text>
              </Pressable>
            ) : null}
            {detail.about.websites.map((site) => (
              <Text
                key={site}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(site)}
                className="text-accent text-sm"
              >
                {site.replace(/^https?:\/\//, "")}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );

  return (
    <View className="bg-background flex-1">
      <View className={cn("flex-row items-center gap-3 px-5 pb-3", wide && "px-8 pb-5")} style={{ paddingTop: top }}>
        <BackButton label={t("common.back")} onPress={leave} />
        <TokenMark token={token} size={MARK} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="text-foreground shrink text-lg font-semibold">
              {token.name}
            </Text>
            {chip ? (
              <Text
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  chip.tone === "danger" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground",
                )}
              >
                {chip.label}
              </Text>
            ) : null}
          </View>
          <Text className="text-muted-foreground text-sm">{token.symbol}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine.watched ? t("tokenPage.unwatch") : t("tokenPage.watch")}
          accessibilityState={{ selected: mine.watched }}
          hitSlop={8}
          onPress={() => {
            if (!mine.account) {
              signIn.open();
              return;
            }
            void mine.toggleWatch().then((on) => toast(on ? t("tokenPage.watched") : t("tokenPage.unwatched")));
          }}
          className={cn("bg-secondary active:bg-muted size-10 items-center justify-center rounded-full", WEB_HOVER_SECONDARY)}
        >
          <Icon as={Star} className={cn("size-5", mine.watched ? "text-primary fill-primary" : "text-foreground")} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tokenPage.share")}
          hitSlop={8}
          onPress={() =>
            void Share.share({
              message: t("tokenPage.shareMessage", {
                name: token.name,
                symbol: token.symbol,
                url: `${PUBLIC_LINKS.webApp}/token/${token.chainId}/${token.address}`,
              }),
            })
          }
          className={cn("bg-secondary active:bg-muted size-10 items-center justify-center rounded-full", WEB_HOVER_SECONDARY)}
        >
          <Icon as={Share2} className="text-foreground size-5" />
        </Pressable>
        {/* A desktop window has no sticky bar: every other action is here. */}
        {wide ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tokenPage.more")}
            hitSlop={8}
            onPress={() => setMoreOpen(true)}
            className={cn("bg-secondary active:bg-muted size-10 items-center justify-center rounded-full", WEB_HOVER_SECONDARY)}
          >
            <Icon as={MoreHorizontal} className="text-foreground size-5" />
          </Pressable>
        ) : null}
      </View>

      {wide ? (
        <View className="flex-1 flex-row gap-8 px-8 pb-8">
          {page}
          <View className="border-border overflow-hidden rounded-3xl border" style={{ width: TICKET_COLUMN_PX }}>
            <View className="px-5 pt-5">
              <SegmentedControl
                label={t("ticket.title")}
                options={[
                  { value: "buy", label: t("tokenPage.a_buy") },
                  { value: "sell", label: t("tokenPage.a_sell") },
                ]}
                value={side}
                onValueChange={(next) => setSide(next === "sell" ? "sell" : "buy")}
              />
            </View>
            {sideReason ? (
              <EmptyState
                title={sideReason}
                action={
                  sideFix ? (
                    <Button onPress={sideFix.onPress} disabled={networkSwitch.busy}>
                      <Text>{sideFix.label}</Text>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <SwapScreen
                key={`${side}:${token.chainId}:${token.address}`}
                prefill={side === "buy" ? { buy: token.address } : { sell: token.address }}
                embedded
                onFinished={() => {
                  void refresh();
                  void refreshPortfolio();
                }}
              />
            )}
          </View>
        </View>
      ) : (
        <>
          {page}
          <View
            className="bg-background border-border flex-row items-center gap-3 border-t px-5 pt-3"
            style={{ paddingBottom: insets.bottom + EDGE_INSET }}
          >
            <View className="flex-1 gap-1">
              <Button disabled={Boolean(buyReason)} onPress={() => run("buy")}>
                <Text>{t("tokenPage.a_buy")}</Text>
              </Button>
            </View>
            <View className="flex-1 gap-1">
              <Button variant="secondary" disabled={Boolean(sellReason)} onPress={() => run("sell")}>
                <Text>{t("tokenPage.a_sell")}</Text>
              </Button>
            </View>
            <Button
              variant="secondary"
              size="icon"
              className="size-12"
              accessibilityLabel={t("tokenPage.more")}
              onPress={() => setMoreOpen(true)}
            >
              <Icon as={MoreHorizontal} className="size-5" />
            </Button>
          </View>
          {buyReason && fixable(buy) ? (
            // "Mainnet only — switch?" is the question and the switch.
            <Pressable accessibilityRole="button" onPress={switchToMainnet} disabled={networkSwitch.busy} className="bg-background px-5 pb-2">
              <Text className="text-accent text-center text-xs font-semibold">{buyReason}</Text>
            </Pressable>
          ) : buyReason ? (
            <Text className="text-muted-foreground bg-background px-5 pb-2 text-center text-xs">{buyReason}</Text>
          ) : null}
        </>
      )}

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={token.symbol}
        colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
        closeLabel={t("common.close")}
        bottomInset={insets.bottom}
      >
        <ListGroup>
          {detail.actions.map((entry) => {
            const reason = reasonFor(entry);
            // A mainnet-only row stays tappable: it is the switch.
            const switches = fixable(entry);
            return (
              <ListRow
                key={entry.id}
                title={t(`tokenPage.a_${entry.id}`)}
                {...(reason ? { subtitle: reason } : {})}
                disabled={Boolean(reason) && !switches}
                chevron={!reason || switches}
                onPress={() => (switches ? switchToMainnet() : run(entry.id))}
              />
            );
          })}
          {hideable ? <ListRow title={hidden ? t("tokenPage.unhide") : t("tokenPage.hide")} chevron onPress={() => void toggleHidden()} /> : null}
          {/* A recurring buy of this token (DCA), drafted on the New automation screen. */}
          <ListRow
            title={t("tokenPage.a_automate")}
            {...(reasonFor(buy) ? { subtitle: reasonFor(buy)! } : {})}
            disabled={Boolean(reasonFor(buy))}
            chevron={!reasonFor(buy)}
            onPress={() => {
              setMoreOpen(false);
              if (status !== "account") signIn.open();
              else router.push({ pathname: "/new-automation", params: { template: "dca", token: token.address, symbol: token.symbol } });
            }}
          />
        </ListGroup>
      </Sheet>
      <MainnetConsentSheet
        open={networkSwitch.consentNeeded}
        busy={networkSwitch.busy}
        onAccept={() => void networkSwitch.acceptMainnet()}
        onClose={networkSwitch.dismissConsent}
      />
      <PriceAlertSheet open={alertOpen} onClose={() => setAlertOpen(false)} token={token} priceUsd={detail.market.priceUsd} />
    </View>
  );
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn("bg-muted active:bg-secondary items-center justify-center rounded-full", WEB_HOVER_MUTED)}
      style={{ width: BACK, height: BACK }}
    >
      <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
    </Pressable>
  );
}
