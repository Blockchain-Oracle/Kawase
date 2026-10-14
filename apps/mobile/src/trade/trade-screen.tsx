// Long / Short as a terminal (plan workstream I; the Kraken Pro / Coinbase Advanced layout in 08-references §6):
// one TradePanel, two layouts. Desktop (useWide, the page at least TERMINAL_MIN_PX wide): the chart left, the ticket
// as the right column, positions under the chart. Narrower desktop pages stack them with the ticket inline. The
// phone: the chart and positions scroll, and a pinned Long / Short bar opens the same ticket as a bottom sheet (the
// ticket is mounted once per layout, so nothing polls twice). Testnet gets the designed "Mainnet only" state with
// the switch, never an empty page; a failed markets read says what still works. On the web, L and S pick a side.
import { useRouter } from "expo-router";
import { ChevronLeft, Globe } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MarginSide } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { useWide, WideFrameContext } from "@kawase/ui-native/lib/wide";

import { MainnetConsentSheet } from "@/components/network-pill";
import { useT } from "@/i18n";
import { useMarginFormat } from "@/margin/copy";
import { isMarginFinished, isMarginOpen, useMarginMarkets, useMarginPositions } from "@/margin/use-margin";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { ChartPanel } from "./chart-panel";
import { PositionsPanel } from "./positions-panel";
import { TradePanel } from "./trade-panel";
import { useHeld } from "./use-held";
import { useTrade } from "./use-trade";

/** The page width at which the chart and the ticket sit side by side. */
const TERMINAL_MIN_PX = 900;
/** The ticket column; wider on an xl window (1280+). */
const TICKET_W = 360;
const TICKET_W_XL = 400;
const XL_PX = 1280;
const CHART_H_WIDE = 420;
const CHART_H_PHONE = 240;
const EDGE_INSET = 12;
const STRIP_INSET = 6;
const BAR_GAP = 12;
const BAR_H = 76;
const PROVIDER_MARK = 28;
const TICKET_SKELETON_H = 420;
const POSITIONS_SKELETON_H = 152;

export type TradePrefill = { market?: string | undefined; side?: MarginSide | undefined };

/** L and S choose a side on the web; ignored while typing or with a dialog open (the desktop docs pack's guard). */
function useSideKeys(onSide: (side: MarginSide) => void, enabled: boolean) {
  React.useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return undefined;
    const on = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[aria-modal="true"],[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === "l") onSide("long");
      if (key === "s") onSide("short");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled, onSide]);
}

function MainnetOnly() {
  const { t } = useT();
  const networkSwitch = useNetworkSwitch();
  return (
    <View className="bg-card border-border items-start gap-4 rounded-3xl border p-6">
      <View className="flex-row items-center gap-3">
        <Mark entity="provider:aave" size={PROVIDER_MARK} />
        <Icon as={Globe} className="text-muted-foreground size-5" />
      </View>
      <View className="gap-1">
        <Text accessibilityRole="header" className={cn("font-display text-foreground text-2xl font-bold", TEXT_START)}>
          {t("desktop.mainnetOnlyTitle")}
        </Text>
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("margin.mainnetOnly")}</Text>
      </View>
      {networkSwitch.nextAvailable ? (
        <Button size="lg" disabled={networkSwitch.busy} onPress={() => void networkSwitch.switchNetwork("mainnet")}>
          <Text>{t("desktop.switchToMainnet")}</Text>
        </Button>
      ) : (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("desktop.mainnetClosed")}</Text>
      )}
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
  );
}

function MarketsFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <View className="bg-card border-border items-start gap-3 rounded-3xl border p-5">
      <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("desktop.marketsFailed")}</Text>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("desktop.marketsFailedStill")}</Text>
      <Button variant="secondary" onPress={onRetry}>
        <Text>{t("common.retry")}</Text>
      </Button>
    </View>
  );
}

export function TradeScreen({ prefill }: { prefill: TradePrefill }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const format = useMarginFormat();
  const wide = useWide();
  const inFrame = React.useContext(WideFrameContext);
  const { user, status } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const markets = useMarginMarkets({ live: true });
  const positions = useMarginPositions();
  const trade = useTrade(markets.view?.markets, prefill);
  const [pageWidth, setPageWidth] = React.useState(0);
  const [sheet, setSheet] = React.useState(false);
  const terminal = wide && pageWidth >= TERMINAL_MIN_PX;
  const ticketWidth = pageWidth >= XL_PX ? TICKET_W_XL : TICKET_W;
  const loadingMarkets = useHeld(markets.view === undefined && !markets.failed);
  const intent = trade.controller.intent;

  // A finished order refreshes the positions (its row moves from "order" to the list).
  const finished = intent ? isMarginFinished(intent) : false;
  const refreshPositions = positions.refresh;
  React.useEffect(() => {
    if (finished) void refreshPositions();
  }, [finished, refreshPositions]);

  // A link that names a side (`/margin?market=BTC&side=long`) opens the ticket on the phone, once.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current || wide || !prefill.side || !markets.view?.available) return;
    opened.current = true;
    setSheet(true);
  }, [markets.view?.available, prefill.side, wide]);

  const pick = React.useCallback(
    (side: MarginSide) => {
      if (trade.view && !trade.view[side].available) return;
      trade.setSide(side);
      if (!wide) setSheet(true);
    },
    [trade, wide],
  );
  useSideKeys(pick, wide && Boolean(markets.view?.available) && (!intent || isMarginOpen(intent)));

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const onLayout = (event: LayoutChangeEvent) => setPageWidth(event.nativeEvent.layout.width);
  const openPosition = positions.positions?.find((entry) => entry.market === trade.market && entry.status === "open");

  const header = (
    <>
      {testnet && !inFrame ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5 lg:px-6" style={{ paddingTop: (testnet && !inFrame) || wide ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className={cn("font-display text-foreground flex-1 text-2xl font-bold", TEXT_START)}>
          {t("margin.title")}
        </Text>
        <Mark entity="provider:aave" size={PROVIDER_MARK} />
      </View>
    </>
  );

  const positionsPanel = (
    <PositionsPanel
      positions={positions.positions}
      failed={positions.failed}
      onRetry={() => void positions.refresh()}
      order={intent}
      onOrder={wide ? undefined : () => setSheet(true)}
      onTrade={() => pick(trade.side)}
      signedIn={status === "account"}
      wide={terminal}
    />
  );

  let body: React.ReactNode;
  if (markets.view && !markets.view.available) {
    body = (
      <View className="gap-4 px-5 pt-4 lg:px-6">
        <MainnetOnly />
      </View>
    );
  } else if (loadingMarkets || (!markets.view && !markets.failed)) {
    body = (
      <View className={cn("gap-4 px-5 pt-4 lg:px-6", terminal && "flex-row")}>
        <View className="flex-1 gap-4">
          <Skeleton className="rounded-3xl" style={{ height: (terminal ? CHART_H_WIDE : CHART_H_PHONE) + BAR_H }} />
          <Skeleton className="rounded-3xl" style={{ height: POSITIONS_SKELETON_H }} />
        </View>
        {terminal ? <Skeleton className="rounded-3xl" style={{ width: ticketWidth, height: TICKET_SKELETON_H }} /> : null}
      </View>
    );
  } else if (!markets.view) {
    body = (
      <View className="gap-4 px-5 pt-4 lg:px-6">
        <MarketsFailed onRetry={() => void markets.refresh()} />
        {positionsPanel}
      </View>
    );
  } else {
    const chart = <ChartPanel trade={trade} markets={markets.view.markets} position={openPosition} height={terminal ? CHART_H_WIDE : CHART_H_PHONE} />;
    const ticket = (
      <View className="bg-card border-border rounded-3xl border p-4">
        <TradePanel trade={trade} />
      </View>
    );
    body = terminal ? (
      <ScrollView className="flex-1" contentContainerClassName="flex-row items-start gap-4 px-6 pb-8 pt-4">
        <View className="flex-1 gap-4">
          {chart}
          {positionsPanel}
        </View>
        <View style={{ width: ticketWidth }}>{ticket}</View>
      </ScrollView>
    ) : wide ? (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 pb-8 pt-4">
        {chart}
        {ticket}
        {positionsPanel}
      </ScrollView>
    ) : (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + BAR_H + BAR_GAP + BAR_GAP }}>
        {chart}
        {positionsPanel}
      </ScrollView>
    );
  }

  const phoneBar =
    !wide && markets.view?.available && trade.view ? (
      <View className="bg-background border-border absolute inset-x-0 bottom-0 flex-row gap-3 border-t px-5 pt-3" style={{ paddingBottom: insets.bottom + BAR_GAP }}>
        {(["long", "short"] as const).map((side: MarginSide) => {
          const view = trade.view![side];
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityState={{ disabled: !view.available }}
              disabled={!view.available}
              onPress={() => pick(side)}
              className={cn("flex-1 items-center rounded-2xl py-3", view.available ? (side === "long" ? "bg-success active:opacity-80" : "bg-destructive active:opacity-80") : "bg-muted")}
            >
              <Text className={cn("text-base font-bold", view.available ? "text-background" : "text-muted-foreground")}>{`${t(`margin.${side}`)} ${trade.view!.market}`}</Text>
              <Text className={cn("text-xs", view.available ? "text-background" : "text-muted-foreground")}>
                {view.available ? t("margin.upTo", { leverage: format.leverage(view.maxLeverage) }) : t(`margin.unavailable_${view.reason ?? "not_borrowable"}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <View className="bg-background flex-1" onLayout={onLayout}>
      {header}
      {body}
      {phoneBar}
      {!wide ? (
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title={trade.view ? t("desktop.sheetTitle", { market: trade.view.market }) : t("margin.title")}
          colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
          closeLabel={t("common.close")}
          bottomInset={insets.bottom}
        >
          <TradePanel trade={trade} inSheet compact />
        </Sheet>
      ) : null}
    </View>
  );
}
