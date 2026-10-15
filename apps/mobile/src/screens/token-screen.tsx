// The token page, one template for every asset (surfaces.md "Token page"; R1, R2, R13), on the Senryo kit. The header
// has the real mark, the copycat chip, a star (the Markets Watchlist), share and, on a desktop window, More. The price
// is the one hero figure in rolling digits, with its change over the range (ChangeChip) and a sparkline; the chart is
// a line or candles (the one candle chart, TradeChart) with the ranges as chips, and a finger or the mouse scrubs the
// price. Then the person's holding (with the same token on other chains and Bring to Arc), their own trades' profit
// and loss, this asset's activity, the stats, Safety (Kawase's copycat rule and GoPlus, lookalikes linked) and About.
// Phone: a sticky bar with Buy · Sell and More (a sheet where every other action is listed with its reason when it
// cannot be done here). Desktop: two columns, the page as the stage and the swap ticket itself as the ticket column
// (Buy · Sell, the same ticket as /swap, inline), More in the right drawer (?d=more). Guests see everything; any
// write asks them to sign in in place. Loading is the page's own shape; a missing token or a failed read says so.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CandlestickChart,
  ChartSpline,
  Eye,
  EyeOff,
  HandCoins,
  Landmark,
  type LucideIcon,
  MoreHorizontal,
  QrCode,
  Route,
  Send,
  Sprout,
  TrendingUp,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  TriangleAlert,
} from "lucide-react-native";
import * as React from "react";
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { Candle, ChartRange, TokenAction, TokenActionView } from "@kawase/api-client";
import { explorerAddressUrl, PUBLIC_LINKS } from "@kawase/config";
import { CHAIN_IDS } from "@kawase/identity";
import { AreaChart, type ChartPoint } from "@kawase/ui-native/components/area-chart";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import {
  Button,
  ChangeChip,
  DisclosureRow,
  EmptyState,
  ErrorState,
  Icon,
  KeyValue,
  ListRow,
  LiveDot,
  LoadingState,
  Panel,
  RADIUS,
  SectionLabel,
  Segmented,
  Skeleton,
  SIZE,
  SPACE,
  StaleTick,
  TYPE,
  useTheme,
} from "@/components/kit";
import { MainnetConsentSheet } from "@/components/network-pill";
import { FeedRow } from "@/activity/feed-row";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { LaunchpadCard } from "@/launchpad/launchpad-card";
import { change, holdingAmount, money, price, shortAddress } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";
import { useFx } from "@/portfolio/use-fx";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { SwapScreen } from "@/screens/swap-screen";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { PriceAlertSheet } from "@/token/price-alert-sheet";
import { useToken } from "@/token/use-token";
import { useTokenMine } from "@/token/use-token-mine";
import { LiveNumber } from "@/trade/bits";
import { DetailDrawer, useDrawer } from "@/trade/drawer";
import { PageHeader, PhoneScroll } from "@/trade/page-frame";
import { TradeChart } from "@/trade/trade-chart";
import { useCandles } from "@/trade/use-candles";
import { useLiveTrades } from "@/markets/live-trades";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { withdrawHref } from "@/withdraw/href";

/** "LIVE": the last ~30 minutes of trades as they land (Arc mainnet tokens); the rest are history from candles. */
type PageRange = "LIVE" | ChartRange;
const RANGES: readonly PageRange[] = ["LIVE", "1H", "1D", "1W", "1M", "1Y", "ALL"];
/** The live line is redrawn this often so its head walks with the clock between trades. */
const LIVE_TICK_MS = 1_000;
/** The sites' own published marks. */
const BASEDBOT_LOGO = "https://basedbot.app/logo.png";
const DEXSCREENER_LOGO = "https://dexscreener.com/favicon.png";
const SITE_MARK = 28;
const HALF_RADIUS = 2;
/** Ranges whose last point is the live price. */
const LIVE_RANGES: ReadonlySet<ChartRange> = new Set(["1H", "1D"]);
const MARK = 36;
const TILE_MIN_H = 96;
const CHART_HEIGHT = 200;
const WIDE_CHART_HEIGHT = 320;
const HERO_H = 52;
const SECONDS_TO_MS = 1000;
const BAR_H = 56;
/** Stats per row: two on a phone, three on a desktop window. */
const STAT_SHARE = { phone: "50%", wide: "33.33%" } as const;
const ZERO = 0n;
const PERCENT = 100;
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

/** A site to look closer at the token on, as a pill with its own logo. */
function SitePill({ label, mark, onPress }: { label: string; mark: React.ReactNode; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.site, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      {mark}
      <Text style={[TYPE.chipLabel, { color: color.ink }]}>{label}</Text>
      <Icon icon={ArrowUpRight} size={SIZE.iconSm} tint={color.text3} />
    </Pressable>
  );
}

type ActionTileProps = { icon: LucideIcon; label: string; reason: string | null; fix: boolean; onPress?: () => void };

/** One action as a tile: its icon on a disc and its name; off (dimmed, not pressable) with its reason when it can't be done. */
function ActionTile({ icon, label, reason, fix, onPress }: ActionTileProps) {
  const { color } = useTheme();
  const on = Boolean(onPress);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reason ? `${label}. ${reason}` : label}
      accessibilityState={{ disabled: !on }}
      disabled={!on}
      onPress={() => {
        fire("tick");
        onPress?.();
      }}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? color.rowPressed : color.raised2, opacity: on ? 1 : OFF_OPACITY }]}
    >
      <View style={[styles.tileDisc, { backgroundColor: on ? color.ink : color.hairline }]}>
        <Icon icon={icon} size={SIZE.iconSm} tint={on ? color.ground : color.text3} />
      </View>
      <Text numberOfLines={1} style={[TYPE.chipLabel, { color: color.ink }]}>
        {label}
      </Text>
      {reason ? (
        <Text numberOfLines={2} style={[TYPE.meta, { color: fix ? color.link : color.text3 }]}>
          {reason}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Each action's icon (the tiles, the desktop's action row). */
const ACTION_ICON: Record<TokenAction, LucideIcon> = {
  buy: ArrowDownToLine,
  sell: ArrowUpFromLine,
  long_short: TrendingUp,
  send: Send,
  receive: QrCode,
  withdraw: Landmark,
  bridge: Route,
  earn: Sprout,
  borrow: HandCoins,
  alert: Bell,
};
/** An action that can't be done here, dimmed. */
const OFF_OPACITY = 0.45;

function RoundAction({
  icon,
  label,
  onPress,
  on,
}: {
  icon: typeof Star;
  label: string;
  onPress: () => void;
  on?: boolean;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      hitSlop={SPACE.xs}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: on ? color.accent : pressed ? color.rowPressed : color.raised2 },
      ]}
    >
      <Icon icon={icon} size={SIZE.icon} tint={on ? color.accentForeground : color.ink} />
    </Pressable>
  );
}

/** The chart's ranges as one even row under it (every range in reach of the thumb, never clipped). */
function RangeTabs({
  ranges,
  value,
  onChange,
  label,
  liveLabel,
}: {
  ranges: readonly PageRange[];
  value: PageRange;
  onChange: (range: PageRange) => void;
  label: string;
  liveLabel: string;
}) {
  const { color } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.tabs}>
      {ranges.map((range) => {
        const on = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              fire("tick");
              onChange(range);
            }}
            style={({ pressed }) => [
              styles.tab,
              { backgroundColor: on ? color.raised2 : pressed ? color.rowPressed : color.transparent },
            ]}
          >
            {range === "LIVE" ? (
              <View style={styles.liveTab}>
                <LiveDot />
                <Text style={[TYPE.chipLabel, { color: on ? color.ink : color.text3 }]}>{liveLabel}</Text>
              </View>
            ) : (
              <Text style={[TYPE.chipLabel, { color: on ? color.ink : color.text3 }]}>{range}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function TokenScreen({ chainId, address }: { chainId: number; address: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const { detail, error, loading, refresh } = useToken(chainId, address);
  // Arc mainnet tokens open on their live trades; history ranges read candles.
  const liveCapable = chainId === CHAIN_IDS.arc;
  const [range, setRange] = React.useState<PageRange>(liveCapable ? "LIVE" : "1D");
  const chart = useCandles(address || undefined, range === "LIVE" ? "1H" : range, chainId);
  const live = useLiveTrades(liveCapable && address ? [address] : []);
  const trades = live.trades[address.toLowerCase()] ?? [];
  const latest = trades.at(-1);
  // The live line's head walks with the clock between trades (honest: flat until the next swap moves it).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (range !== "LIVE") return undefined;
    const timer = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(timer);
  }, [range]);
  const mine = useTokenMine(chainId, address);
  // The person's holdings on other chains: the same token there is part of "my holding" (§D: across chains).
  const portfolio = usePortfolio();
  const refreshPortfolio = portfolio.refresh;
  React.useEffect(() => {
    if (status === "account") void refreshPortfolio();
  }, [status, refreshPortfolio]);
  const [chartKind, setChartKind] = React.useState<"line" | "candles">("line");
  const [scrub, setScrub] = React.useState<ChartPoint | null>(null);
  const [candleScrub, setCandleScrub] = React.useState<Candle | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [ticket, setTicket] = React.useState<"buy" | "sell" | null>(null);
  const [alertOpen, setAlertOpen] = React.useState(false);
  const drawer = useDrawer("more");
  const fx = useFx();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/markets"));

  const activeChain = user?.activeNetwork === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;
  const candles = chart.candles;
  // The last point follows the live price on the short ranges, so the line moves with the market between reads.
  const livePrice = latest?.priceUsd ?? detail?.market.priceUsd ?? null;
  const showLive = range === "LIVE" && trades.length > 1;
  const points: ChartPoint[] = showLive
    ? [
        ...trades.map((trade) => ({ t: trade.at / SECONDS_TO_MS, v: trade.priceUsd })),
        { t: now / SECONDS_TO_MS, v: latest!.priceUsd },
      ]
    : (candles ?? []).map((candle, index, all) => ({
        t: candle.t,
        v:
          index === all.length - 1 && livePrice !== null && LIVE_RANGES.has(range === "LIVE" ? "1H" : range)
            ? livePrice
            : candle.c,
      }));

  if (!detail) {
    return (
      <View style={styles.page}>
        <PageHeader title={t("desktop.tokenTitle")} onBack={leave} />
        <PhoneScroll>
          {loading ? (
            <>
              <LoadingState shape="hero" />
              <LoadingState shape="detail" />
            </>
          ) : error === "not_found" ? (
            <EmptyState
              size="page"
              why={t("tokenPage.notFound")}
              action={{ label: t("common.back"), onPress: leave }}
            />
          ) : (
            <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void refresh()} />
          )}
        </PhoneScroll>
      </View>
    );
  }

  const token = detail.token;
  const chip = tokenChip(token, t);
  const shownPrice = scrub ? scrub.v : candleScrub ? candleScrub.c : (latest?.priceUsd ?? detail.market.priceUsd);
  const scrubbedAt = scrub?.t ?? candleScrub?.t;
  const first = showLive ? trades[0]?.priceUsd : candles?.[0]?.o;
  const rangeChange =
    first && shownPrice
      ? shownPrice / first - 1
      : detail.market.change24hPct !== null
        ? detail.market.change24hPct / PERCENT
        : null;
  const holds = detail.holding && BigInt(detail.holding.balance) > ZERO;
  const elsewhere = (portfolio.portfolio?.otherChains ?? []).filter(
    (holding) => holding.token.symbol.toUpperCase() === token.symbol.toUpperCase(),
  );

  /** The page's own reason first (another network, signing in), then the api's (R2). */
  const reasonFor = (action: TokenActionView): string | null => {
    if (WRITES.has(action.id) && token.chainId !== activeChain) return t("tokenPage.n_mainnet_only");
    if (!action.available) return t(`tokenPage.n_${action.reason ?? "blocked"}`);
    return null;
  };

  const closeMore = () => {
    setMoreOpen(false);
    if (drawer.open) drawer.hide();
  };
  const run = (action: TokenAction) => {
    closeMore();
    // A desktop window opens the ticket in its drawer, on that side.
    if (wide && (action === "buy" || action === "sell")) {
      closeMore();
      setTicket(action);
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
        router.push({
          pathname: "/wallet/receive",
          params: {
            asset: token.address,
            chainId: String(token.chainId),
            symbol: token.symbol,
            decimals: String(token.decimals),
            name: token.name,
          },
        });
        return;
      case "bridge":
        // USDC by CCTP; any other token as itself through the cross-chain routes.
        if (token.kind === "dollar") router.push("/move");
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
        router.push({
          pathname: "/earn",
          params: {
            asset: token.address,
            chainId: String(token.chainId),
            symbol: token.symbol,
            decimals: String(token.decimals),
            name: token.name,
          },
        });
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
  // A mainnet token seen from testnet: "Mainnet only, switch?" is the switch (the page is the same token after it).
  const toMainnet = activeChain !== CHAIN_IDS.arc && token.chainId === CHAIN_IDS.arc;
  const switchToMainnet = () => {
    closeMore();
    void networkSwitch.switchNetwork("mainnet");
  };
  const fixable = (entry: TokenActionView) => toMainnet && reasonFor(entry) === t("tokenPage.n_mainnet_only");
  // Hide (capability-matrix H): a held token can leave Home's list for Hidden, and come back; the dollars, euros,
  // Bitcoin and Ether are never hidden.
  const hideable = Boolean(holds && detail.holding) && !NEVER_HIDDEN.has(token.kind) && token.symbol !== "EURC";
  const hidden = detail.holding?.hidden ?? false;
  const toggleHidden = async () => {
    closeMore();
    try {
      await portfolio.setVisibility(token.address, hidden ? "shown" : "hidden");
      await refresh();
      toast(hidden ? t("tokenPage.shownToast") : t("tokenPage.hiddenToast"));
    } catch {
      toast(t("common.error"));
    }
  };
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
    ...(detail.market.buys24h != null && detail.market.sells24h != null
      ? [
          {
            label: t("tokenPage.buysSells"),
            value: `${new Intl.NumberFormat(locale).format(detail.market.buys24h)} / ${new Intl.NumberFormat(locale).format(detail.market.sells24h)}`,
          },
        ]
      : []),
    { label: t("tokenPage.fdv"), value: money(detail.market.fdvUsd, fx, locale, { compact: true }) },
    { label: t("tokenPage.contract"), value: shortAddress(token.address), onPress: () => void copy() },
  ];

  const safetyTone =
    detail.safety.level === "block" ? color.down : detail.safety.level === "caution" ? color.warn : color.up;
  const safetyIcon =
    detail.safety.level === "block" ? ShieldAlert : detail.safety.level === "caution" ? TriangleAlert : ShieldCheck;
  const checkTone = (state: string) =>
    state === "danger" ? color.down : state === "warn" ? color.warn : state === "ok" ? color.up : color.text3;
  const chartHeight = wide ? WIDE_CHART_HEIGHT : CHART_HEIGHT;
  const chartLabel = t("assets.chartLabel", { range, value: price(detail.market.priceUsd, fx, locale) });

  let chartView: React.ReactNode;
  // Live draws from the chain's own trades, so a busy history source never blanks a chart that has trades to show.
  if (showLive && chartKind === "line")
    chartView = (
      <AreaChart
        points={points}
        height={chartHeight}
        colors={{ up: color.up, down: color.down, muted: color.text3, scrub: color.hairline }}
        formatValue={(value) => price(value, fx, locale)}
        onScrub={setScrub}
        accessibilityLabel={chartLabel}
      />
    );
  else if (candles === undefined && !chart.failed) chartView = <Skeleton height={chartHeight} radius={RADIUS.md} />;
  else if (candles === undefined && range === "LIVE")
    chartView = <EmptyState why={t("tokenPage.waitingTrades")} detail={t("tokenPage.waitingTradesBody")} size="inline" />;
  else if (candles === undefined)
    chartView = (
      <ErrorState
        diagnosis={{ kind: "server", retryable: true }}
        retry={chart.retry}
        stillWorks={t("desktop.tokenChartFailed")}
      />
    );
  else if (chartKind === "candles" && candles.length > 0)
    chartView = (
      <TradeChart
        candles={candles}
        levels={[]}
        height={chartHeight}
        onScrub={setCandleScrub}
        formatValue={(value) => price(value, fx, locale)}
        formatTime={(seconds) => new Date(seconds * SECONDS_TO_MS).toLocaleString(locale)}
        accessibilityLabel={chartLabel}
      />
    );
  else if (points.length > 1)
    chartView = (
      <AreaChart
        points={points}
        height={chartHeight}
        colors={{ up: color.up, down: color.down, muted: color.text3, scrub: color.hairline }}
        formatValue={(value) => price(value, fx, locale)}
        onScrub={setScrub}
        accessibilityLabel={chartLabel}
      />
    );
  else chartView = <EmptyState why={t("tokenPage.noChart")} size="inline" />;

  const page = (
    <>
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.grow}>
            <LiveNumber text={price(shownPrice, fx, locale)} value={shownPrice ?? 0} height={HERO_H} />
          </View>
          <RoundAction
            icon={chartKind === "line" ? CandlestickChart : ChartSpline}
            label={chartKind === "line" ? t("tokenPage.chart_candles") : t("tokenPage.chart_line")}
            onPress={() => setChartKind(chartKind === "line" ? "candles" : "line")}
          />
        </View>
        {scrubbedAt !== undefined ? (
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>
            {new Date(scrubbedAt * SECONDS_TO_MS).toLocaleString(locale)}
          </Text>
        ) : (
          <View style={styles.line}>
            <ChangeChip change={rangeChange} />
            <Text style={[TYPE.rowDetail, { color: color.text3 }]}>
              {showLive
                ? t("tokenPage.liveWindow")
                : candles && first
                  ? range
                  : t("assets.today", { change: change(detail.market.change24hPct, locale) ?? "" })}
            </Text>
            {detail.market.priceUsd !== null && !detail.stale ? (
              <View style={styles.live} accessibilityLabel={t("tokenPage.live")}>
                <LiveDot />
                <Text style={[TYPE.label, { color: color.text2 }]}>{t("tokenPage.live")}</Text>
                {detail.market.change5mPct != null ? (
                  <Text
                    style={[TYPE.label, { color: detail.market.change5mPct >= 0 ? color.up : color.down }]}
                  >{`5m ${change(detail.market.change5mPct, locale) ?? ""}`}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.group}>
        {chartView}
        {chart.failed && candles !== undefined && chart.asOf ? <StaleTick asOf={chart.asOf} /> : null}
        <RangeTabs
          ranges={liveCapable ? RANGES : RANGES.filter((entry) => entry !== "LIVE")}
          value={range}
          onChange={setRange}
          label={t("assets.rangeLabel")}
          liveLabel={t("tokenPage.live")}
        />
        {/* Deeper looks elsewhere (Abu, 10-14/15): right under the chart, never at the page's foot — BasedBot's
            terminal (trades, holders, snipers), the pair on DexScreener, the contract on Arc's explorer. */}
        {liveCapable ? (
          <View style={styles.sites} accessibilityLabel={t("tokenPage.elsewhere")}>
            <SitePill label="BasedBot" mark={<Image source={{ uri: BASEDBOT_LOGO }} style={styles.siteMark} accessibilityIgnoresInvertColors />} onPress={() => void Linking.openURL(`https://basedbot.app/token/arc/${token.address}`)} />
            <SitePill label="DexScreener" mark={<Image source={{ uri: DEXSCREENER_LOGO }} style={styles.siteMark} accessibilityIgnoresInvertColors />} onPress={() => void Linking.openURL(`https://dexscreener.com/arc/${token.address}`)} />
            <SitePill label="ArcScan" mark={<Mark entity="chain:eip155:5042" size={SITE_MARK} />} onPress={() => void Linking.openURL(explorerAddressUrl("arc", token.address))} />
          </View>
        ) : null}
      </View>

      {(holds && detail.holding) || elsewhere.length > 0 ? (
        <Panel style={styles.panel}>
          <SectionLabel>{t("tokenPage.myHolding")}</SectionLabel>
          {holds && detail.holding ? (
            <>
              <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{holdingAmount(detail.holding, locale)}</Text>
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
                {t("tokenPage.worth", { value: money(detail.holding.valueUsd, fx, locale) })}
              </Text>
            </>
          ) : null}
          {/* The same token on other chains (one address everywhere), with the way to bring it to Arc. */}
          {elsewhere.map((holding) => (
            <View key={`${holding.token.chainId}:${holding.token.address}`} style={styles.line}>
              <Text style={[TYPE.rowDetail, styles.grow, { color: color.text2 }]}>
                {t("tokenPage.onChain", { amount: holdingAmount(holding, locale), chain: holding.chainName })}
              </Text>
              <Button
                label={t("assets.bringToArc")}
                size="sm"
                variant="secondary"
                block={false}
                onPress={() => router.push({ pathname: "/move", params: { direction: "in" } })}
              />
            </View>
          ))}
        </Panel>
      ) : null}

      {mine.trades ? (
        <Panel style={styles.panel}>
          <SectionLabel>{t("tokenPage.yourTrades", { count: mine.trades.trades })}</SectionLabel>
          <KeyValue
            label={t("tokenPage.avgCost")}
            value={mine.trades.avgCostUsd !== null ? price(mine.trades.avgCostUsd, fx, locale) : "—"}
          />
          <KeyValue label={t("tokenPage.costBasis")} value={money(mine.trades.costBasisUsd, fx, locale)} />
          <KeyValue
            label={t("tokenPage.unrealized")}
            value={
              mine.trades.unrealizedUsd !== null
                ? `${mine.trades.unrealizedUsd >= 0 ? "+" : "−"}${money(Math.abs(mine.trades.unrealizedUsd), fx, locale)}`
                : "—"
            }
            valueColor={
              mine.trades.unrealizedUsd === null ? undefined : mine.trades.unrealizedUsd >= 0 ? color.up : color.down
            }
          />
          <KeyValue
            label={t("tokenPage.realized")}
            value={`${mine.trades.realizedUsd >= 0 ? "+" : "−"}${money(Math.abs(mine.trades.realizedUsd), fx, locale)}`}
            valueColor={mine.trades.realizedUsd >= 0 ? color.up : color.down}
          />
          <Text style={[TYPE.caption, { color: color.text3 }]}>{t("tokenPage.tradesNote")}</Text>
        </Panel>
      ) : null}

      {mine.activity && mine.activity.length > 0 ? (
        <View style={styles.group}>
          <View style={styles.line}>
            <SectionLabel style={styles.grow}>{t("tokenPage.activity")}</SectionLabel>
            <Button
              label={t("tokenPage.seeAll")}
              variant="ghost"
              size="sm"
              block={false}
              onPress={() => router.push("/activity")}
            />
          </View>
          <Panel>
            {mine.activity.map((item) => (
              <FeedRow key={item.id} item={item} onPress={() => router.push("/activity")} />
            ))}
          </Panel>
        </View>
      ) : null}

      <View style={styles.group}>
        <SectionLabel>{t("tokenPage.stats")}</SectionLabel>
        <Panel style={styles.stats}>
          {stats.map((stat) => (
            <Pressable
              key={stat.label}
              disabled={!stat.onPress}
              onPress={stat.onPress}
              accessibilityRole={stat.onPress ? "button" : "text"}
              style={[styles.stat, { width: wide ? STAT_SHARE.wide : STAT_SHARE.phone }]}
            >
              <Text style={[TYPE.meta, { color: color.text3 }]}>{stat.label}</Text>
              <Text style={[TYPE.rowAmount, { color: color.ink }]}>{stat.value}</Text>
            </Pressable>
          ))}
        </Panel>
      </View>

      {/* B1: a launchpad token's curve and graduation alert (LIFT on Arc mainnet). */}
      {chainId === ARC_MAINNET ? <LaunchpadCard address={address} /> : null}

      <View style={styles.group}>
        <SectionLabel>{t("tokenPage.safety")}</SectionLabel>
        <Panel style={styles.panel}>
          <View style={styles.line}>
            <Icon icon={safetyIcon} size={SIZE.icon} tint={safetyTone} />
            <Text style={[TYPE.rowStrong, { color: safetyTone }]}>
              {detail.safety.level === "block"
                ? t("tokenPage.safetyBlock")
                : detail.safety.level === "caution"
                  ? t("tokenPage.safetyCaution")
                  : t("tokenPage.safetyOk")}
            </Text>
          </View>
          {detail.safety.reasons.map((reason) => (
            <Text key={reason} style={[TYPE.rowDetail, { color: color.text2 }]}>
              {`• ${t(`tokenPage.r_${reason}`)}`}
            </Text>
          ))}
          {detail.safety.checks.map((check) => (
            <KeyValue
              key={check.id}
              label={t(`tokenPage.c_${check.id}`)}
              value={
                check.value && check.state !== "unknown"
                  ? `${check.value}${check.id.endsWith("tax") ? "%" : ""}`
                  : t(`tokenPage.s_${check.state}`)
              }
              valueColor={checkTone(check.state)}
            />
          ))}
          <Text style={[TYPE.caption, { color: color.text3 }]}>
            {detail.safety.checkedBy
              ? t("tokenPage.checkedBy", { name: detail.safety.checkedBy })
              : t("tokenPage.notChecked")}
          </Text>
        </Panel>
        {detail.safety.lookalikes.length > 0 ? (
          <>
            <SectionLabel>{t("tokenPage.lookalikes")}</SectionLabel>
            <Panel>
              {detail.safety.lookalikes.map((other) => (
                <ListRow
                  key={other.address}
                  title={other.name}
                  detail={`${shortAddress(other.address)}${other.liquidityUsd ? ` · ${t("markets.liq", { value: money(other.liquidityUsd, fx, locale, { compact: true }) })}` : ""}`}
                  onPress={() => router.push(`/token/${chainId}/${other.address}`)}
                />
              ))}
            </Panel>
          </>
        ) : null}
      </View>

      {detail.about.description || detail.about.websites.length > 0 ? (
        <Panel style={styles.panel}>
          {detail.about.description ? (
            <DisclosureRow title={t("tokenPage.about")} value={token.symbol}>
              <Text style={[TYPE.body, { color: color.ink }]}>{detail.about.description}</Text>
            </DisclosureRow>
          ) : (
            <SectionLabel>{t("tokenPage.about")}</SectionLabel>
          )}
          {detail.about.websites.map((site) => (
            <Text
              key={site}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(site)}
              style={[TYPE.rowDetail, { color: color.link }]}
            >
              {site.replace(/^https?:\/\//, "")}
            </Text>
          ))}
        </Panel>
      ) : null}

    </>
  );

  // Every action, grouped and drawn as tiles with their icons; what cannot be done here is visibly off (its reason
  // under it) instead of a tappable row, and a mainnet-only one stays live because it is the switch.
  const tile = (id: TokenAction): ActionTileProps => {
    const entry = detail.actions.find((candidate) => candidate.id === id);
    const reason = entry ? reasonFor(entry) : null;
    const switches = entry ? fixable(entry) : false;
    return {
      icon: ACTION_ICON[id],
      label: t(`tokenPage.a_${id}`),
      reason,
      fix: switches,
      ...(entry && (!reason || switches) ? { onPress: () => (switches ? switchToMainnet() : run(id)) } : {}),
    };
  };
  const has = (id: TokenAction) => detail.actions.some((entry) => entry.id === id);
  const groups: { title: string; tiles: ActionTileProps[] }[] = [
    { title: t("tokenPage.group_trade"), tiles: (["buy", "sell", "long_short"] as const).filter(has).map(tile) },
    { title: t("tokenPage.group_move"), tiles: (["send", "receive", "withdraw", "bridge"] as const).filter(has).map(tile) },
    { title: t("tokenPage.group_grow"), tiles: (["earn", "borrow"] as const).filter(has).map(tile) },
    {
      title: t("tokenPage.group_tools"),
      tiles: [
        ...(["alert"] as const).filter(has).map(tile),
        {
          icon: CalendarClock,
          label: t("tokenPage.a_automate"),
          reason: buyReason ?? null,
          fix: false,
          ...(!buyReason
            ? {
                onPress: () => {
                  closeMore();
                  if (status !== "account") signIn.open();
                  else router.push({ pathname: "/new-automation", params: { template: "dca", token: token.address, symbol: token.symbol } });
                },
              }
            : {}),
        },
        ...(hideable ? [{ icon: hidden ? Eye : EyeOff, label: hidden ? t("tokenPage.unhide") : t("tokenPage.hide"), reason: null, fix: false, onPress: () => void toggleHidden() }] : []),
      ],
    },
  ].filter((group) => group.tiles.length > 0);
  const moreList = (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <SectionLabel>{group.title}</SectionLabel>
          <View style={styles.tiles}>
            {group.tiles.map((entry) => (
              <ActionTile key={entry.label} {...entry} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const header = (
    <PageHeader
      title={token.name}
      subtitle={chip ? `${token.symbol} · ${chip.label}` : token.symbol}
      onBack={leave}
      mark={<TokenMark token={token} size={MARK} />}
      trailing={
        <View style={styles.headerActions}>
          <RoundAction
            icon={Star}
            on={mine.watched}
            label={mine.watched ? t("tokenPage.unwatch") : t("tokenPage.watch")}
            onPress={() => {
              if (!mine.account) {
                signIn.open();
                return;
              }
              void mine.toggleWatch().then((on) => toast(on ? t("tokenPage.watched") : t("tokenPage.unwatched")));
            }}
          />
          <RoundAction
            icon={Share2}
            label={t("tokenPage.share")}
            onPress={() =>
              void Share.share({
                message: t("tokenPage.shareMessage", {
                  name: token.name,
                  symbol: token.symbol,
                  url: `${PUBLIC_LINKS.webApp}/token/${token.chainId}/${token.address}`,
                }),
              })
            }
          />
          {/* A desktop window has no sticky bar: every other action is in the drawer. */}
          {wide ? (
            <RoundAction icon={MoreHorizontal} label={t("tokenPage.more")} onPress={() => drawer.show()} />
          ) : null}
        </View>
      }
    />
  );

  const sheets = (
    <>
      <MainnetConsentSheet
        open={networkSwitch.consentNeeded}
        busy={networkSwitch.busy}
        onAccept={() => void networkSwitch.acceptMainnet()}
        onClose={networkSwitch.dismissConsent}
      />
      <PriceAlertSheet
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        token={token}
        priceUsd={detail.market.priceUsd}
      />
    </>
  );

  if (wide) {
    // A desktop window: the page takes the whole stage; Buy and Sell open the ticket in a drawer (the same ticket as
    // /swap) instead of a column that stands mostly empty beside it.
    const actionRow = (
      <View style={styles.actionRow}>
        <Button
          label={t("tokenPage.a_buy")}
          block={false}
          leading={<Icon icon={ACTION_ICON.buy} size={SIZE.iconSm} />}
          disabled={Boolean(buyReason) && !fixable(buy)}
          onPress={() => (buyReason && fixable(buy) ? switchToMainnet() : setTicket("buy"))}
        />
        <Button label={t("tokenPage.a_sell")} block={false} variant="secondary" leading={<Icon icon={ACTION_ICON.sell} size={SIZE.iconSm} />} disabled={Boolean(sellReason)} onPress={() => setTicket("sell")} />
        {has("long_short") && !reasonFor(action("long_short")) ? (
          <Button label={t("tokenPage.a_long_short")} block={false} variant="secondary" leading={<Icon icon={ACTION_ICON.long_short} size={SIZE.iconSm} />} onPress={() => run("long_short")} />
        ) : null}
        <RoundAction icon={MoreHorizontal} label={t("tokenPage.more")} onPress={() => drawer.show()} />
        {buyReason ? <Text style={[TYPE.caption, { color: fixable(buy) ? color.link : color.text3 }]}>{buyReason}</Text> : null}
      </View>
    );
    return (
      <View style={styles.page}>
        {header}
        <ScrollView style={styles.grow} contentContainerStyle={styles.wideStage} keyboardShouldPersistTaps="handled">
          {actionRow}
          {page}
        </ScrollView>
        <DetailDrawer open={ticket !== null} title={`${ticket === "sell" ? t("tokenPage.a_sell") : t("tokenPage.a_buy")} ${token.symbol}`} onClose={() => setTicket(null)}>
          <View style={styles.group}>
            <Segmented<"buy" | "sell">
              label={t("ticket.title")}
              value={ticket ?? "buy"}
              onChange={(next) => setTicket(next)}
              options={[
                { value: "buy", label: t("tokenPage.a_buy") },
                { value: "sell", label: t("tokenPage.a_sell"), ...(sellReason ? { disabled: true } : {}) },
              ]}
            />
            {(ticket === "sell" ? sellReason : buyReason) ? (
              <Text style={[TYPE.caption, { color: color.text3 }]}>{ticket === "sell" ? sellReason : buyReason}</Text>
            ) : (
              <SwapScreen
                key={`${ticket}:${token.chainId}:${token.address}`}
                prefill={ticket === "sell" ? { sell: token.address } : { buy: token.address }}
                embedded
                onFinished={() => {
                  void refresh();
                  void refreshPortfolio();
                }}
              />
            )}
          </View>
        </DetailDrawer>
        <DetailDrawer open={drawer.open} title={token.symbol} onClose={drawer.hide}>
          {moreList}
        </DetailDrawer>
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {header}
      <PhoneScroll bottom={BAR_H + SPACE.xxl}>{page}</PhoneScroll>
      <View style={[styles.bar, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: color.ground }]}>
        <View style={styles.grow}>
          <Button
            label={t("tokenPage.a_buy")}
            disabled={Boolean(buyReason) && !fixable(buy)}
            onPress={() => (buyReason && fixable(buy) ? switchToMainnet() : run("buy"))}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label={t("tokenPage.a_sell")}
            variant="secondary"
            disabled={Boolean(sellReason)}
            onPress={() => run("sell")}
          />
        </View>
        <RoundAction icon={MoreHorizontal} label={t("tokenPage.more")} onPress={() => setMoreOpen(true)} />
      </View>
      {buyReason ? (
        <Text
          style={[
            TYPE.caption,
            styles.reason,
            { color: fixable(buy) ? color.link : color.text3, backgroundColor: color.ground },
          ]}
        >
          {buyReason}
        </Text>
      ) : null}
      <DetailDrawer open={moreOpen} title={token.symbol} onClose={() => setMoreOpen(false)}>
        {moreList}
      </DetailDrawer>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  hero: { gap: SPACE.xs },
  heroRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  group: { gap: SPACE.md },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1, minWidth: 0 },
  live: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, marginStart: SPACE.xs },
  tabs: { flexDirection: "row", gap: SPACE.xxs },
  tab: { flex: 1, height: SIZE.chipHeight, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  liveTab: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  siteMark: { width: SITE_MARK, height: SITE_MARK, borderRadius: SITE_MARK / HALF_RADIUS },
  panel: { gap: SPACE.sm, padding: SPACE.lg },
  stats: { flexDirection: "row", flexWrap: "wrap", padding: SPACE.sm },
  stat: { gap: SPACE.xxs, padding: SPACE.sm },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  sites: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  site: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight + SPACE.xs, borderRadius: RADIUS.pill, paddingStart: SPACE.xs, paddingEnd: SPACE.md },
  groups: { gap: SPACE.lg },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  tile: { width: "31%", minHeight: TILE_MIN_H, borderRadius: RADIUS.lg, padding: SPACE.md, gap: SPACE.xs },
  tileDisc: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm },
  wideStage: { gap: SPACE.xl, paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.xxxl },
  round: {
    width: SIZE.touch,
    height: SIZE.touch,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.inset,
    paddingTop: SPACE.md,
  },
  reason: { textAlign: "center", paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
});
