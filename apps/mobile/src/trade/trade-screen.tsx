// Long / Short as a terminal (plan workstream I; the Kraken Pro / Coinbase Advanced layout in 08-references §6), on the
// Senryo kit: one TradePanel, two layouts.
//  - Desktop (useWide): two columns. The stage holds the chart (market tabs, the price as the one hero, levels drawn)
//    and the positions table; the ticket column holds the TradePanel. A position opens in the right drawer
//    (`?d=position&id=…`), with its P&L, health, facts, close and protection, without leaving the terminal.
//  - Phone: the Swap / Bridge / Long-Short switch, the chart and the positions scroll, and a pinned pair of vivid
//    direction plates (Long on up-fill, Short on down-fill, black labels) opens the same ticket as a sheet. The ticket
//    is mounted once per layout, so nothing polls twice.
// States: loading is the terminal's own shape (chart, rows, ticket), held; testnet is the designed "Mainnet only" with
// the switch (never an empty page); a venue that can't lend right now says why with Retry and the way back; a failed
// markets read says what still works. On the web, L and S pick a side (ignored while typing or with a dialog open).
import { useRouter } from "expo-router";
import * as React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MarginSide, MarginUnavailable } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { EmptyState, ErrorState, LoadingState, PRESS_SCALE, RADIUS, Skeleton, SIZE, SPACE, TYPE, useHeldLoading, useTheme } from "@/components/kit";
import { CloudOff, LineChart } from "@/components/kit/icons";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { MainnetConsentSheet } from "@/components/network-pill";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useMarginFormat } from "@/margin/copy";
import { PositionActions, PositionState, PositionSummary, usePositionClose } from "@/margin/position-detail";
import { isMarginFinished, isMarginOpen, useMarginMarkets, useMarginPositions } from "@/margin/use-margin";
import { useSession } from "@/session/session-provider";
import { TradeSwitch } from "@/swap/trade-switch";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { ChartPanel } from "./chart-panel";
import { DetailDrawer, useDrawer } from "./drawer";
import { Columns, PageHeader } from "./page-frame";
import { PositionsPanel } from "./positions-panel";
import { TradePanel } from "./trade-panel";
import { useTrade } from "./use-trade";

/** How wide the terminal page grows on a desktop window (the stack's usual column is narrower). */
export const TERMINAL_PAGE_PX = 1440;
const CHART_H_WIDE = 420;
const CHART_H_PHONE = 240;
const PROVIDER_MARK = 28;
const TICKET_SKELETON_H = 520;
const PLATE_H = 64;

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
    <>
      <EmptyState
        icon={LineChart}
        size="page"
        why={t("desktop.mainnetOnlyTitle")}
        detail={networkSwitch.nextAvailable ? t("margin.mainnetOnly") : t("desktop.mainnetClosed")}
        {...(networkSwitch.nextAvailable ? { action: { label: t("desktop.switchToMainnet"), onPress: () => void networkSwitch.switchNetwork("mainnet") } } : {})}
      />
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </>
  );
}

/** Mainnet, but the venue can't take a new long or short right now: why, Retry, and the way back. No network switch. */
function Unavailable({ reason, onRetry, onBack }: { reason: MarginUnavailable | null; onRetry: () => void; onBack: () => void }) {
  const { t } = useT();
  return (
    <EmptyState
      icon={CloudOff}
      why={t("desktop.unavailableTitle")}
      detail={reason && reason !== "mainnet_only" ? `${t(`margin.unavailable_${reason}`)} · ${t("desktop.marketsFailedStill")}` : t("desktop.marketsFailedStill")}
      action={{ label: t("common.retry"), onPress: onRetry }}
      secondary={{ label: t("common.back"), onPress: onBack }}
    />
  );
}

/** The terminal's own shape while the markets load: the chart, the rows and, on a desktop window, the ticket. */
function TerminalSkeleton({ wide }: { wide: boolean }) {
  const stage = (
    <>
      <Skeleton height={(wide ? CHART_H_WIDE : CHART_H_PHONE) + SIZE.skeletonPlate} radius={RADIUS.lg} />
      <LoadingState shape="list" />
    </>
  );
  return wide ? <Columns stage={stage} ticket={<Skeleton height={TICKET_SKELETON_H} radius={RADIUS.lg} />} /> : <View style={styles.phoneBody}>{stage}</View>;
}

export function TradeScreen({ prefill }: { prefill: TradePrefill }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const format = useMarginFormat();
  const wide = useWide();
  const { user, status } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const markets = useMarginMarkets({ live: true });
  const positions = useMarginPositions();
  const trade = useTrade(markets.view?.markets, prefill);
  const [sheet, setSheet] = React.useState(false);
  const drawer = useDrawer("position");
  const loadingMarkets = useHeldLoading(markets.view === undefined && !markets.failed);
  const intent = trade.controller.intent;
  const drawerClose = usePositionClose(drawer.id ?? "", positions.refresh);

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

  // Stable, so the web's L / S listener is added once, not on every render.
  const tradeRef = React.useRef(trade);
  tradeRef.current = trade;
  const pick = React.useCallback(
    (side: MarginSide) => {
      const current = tradeRef.current;
      if (current.view && !current.view[side].available) return;
      current.setSide(side);
      if (!wide) setSheet(true);
    },
    [wide],
  );
  useSideKeys(pick, wide && Boolean(markets.view?.available) && (!intent || isMarginOpen(intent)));

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const openPosition = positions.positions?.find((entry) => entry.market === trade.market && entry.status === "open");

  const positionsPanel = (
    <PositionsPanel
      positions={positions.positions}
      failed={positions.failed}
      asOf={positions.asOf}
      onRetry={() => void positions.refresh()}
      order={intent}
      onOrder={wide ? undefined : () => setSheet(true)}
      onTrade={() => pick(trade.side)}
      onOpen={(position) => (wide ? drawer.show(position.id) : router.push(`/position/${position.id}`))}
      signedIn={status === "account"}
      wide={wide}
    />
  );

  let body: React.ReactNode;
  if (markets.view && !markets.view.available && testnet) body = <MainnetOnly />;
  else if (markets.view && !markets.view.available)
    body = (
      <ScrollView contentContainerStyle={wide ? styles.wideBody : styles.phoneBody}>
        <Unavailable reason={markets.view.reason} onRetry={() => void markets.refresh()} onBack={leave} />
        {positionsPanel}
      </ScrollView>
    );
  else if (loadingMarkets || (!markets.view && !markets.failed)) body = <TerminalSkeleton wide={wide} />;
  else if (!markets.view)
    body = (
      <ScrollView contentContainerStyle={wide ? styles.wideBody : styles.phoneBody}>
        <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void markets.refresh()} stillWorks={t("desktop.marketsFailedStill")} />
        {positionsPanel}
      </ScrollView>
    );
  else {
    const chart = <ChartPanel trade={trade} markets={markets.view.markets} position={openPosition} height={wide ? CHART_H_WIDE : CHART_H_PHONE} />;
    body = wide ? (
      <Columns
        stage={
          <>
            {chart}
            {positionsPanel}
          </>
        }
        ticket={<TradePanel trade={trade} />}
      />
    ) : (
      <ScrollView contentContainerStyle={[styles.phoneBody, { paddingBottom: insets.bottom + PLATE_H + SPACE.xxl }]}>
        {chart}
        {positionsPanel}
      </ScrollView>
    );
  }

  const phoneBar =
    !wide && markets.view?.available && trade.view ? (
      <View style={[styles.bar, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: color.ground }]}>
        {(["long", "short"] as const).map((side: MarginSide) => {
          const view = trade.view![side];
          const fill = side === "long" ? color.upFill : color.downFill;
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityState={{ disabled: !view.available }}
              disabled={!view.available}
              onPress={() => {
                fire("press");
                pick(side);
              }}
              style={({ pressed }) => [styles.plate, { backgroundColor: view.available ? fill : color.raised2, transform: [{ scale: pressed ? PRESS_SCALE : 1 }] }]}
            >
              <Text style={[TYPE.buttonLabel, { color: view.available ? color.onFill : color.text3 }]}>{`${t(`margin.${side}`)} ${trade.view!.market}`}</Text>
              <Text style={[TYPE.meta, { color: view.available ? color.onFill : color.text3 }]}>
                {view.available ? t("margin.upTo", { leverage: format.leverage(view.maxLeverage) }) : t(`margin.unavailable_${view.reason ?? "not_borrowable"}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={[styles.page, { backgroundColor: color.ground }]}>
      <PageHeader title={t("margin.title")} onBack={leave} trailing={<Mark entity="provider:aave" size={PROVIDER_MARK} />} />
      {!wide && (!intent || isMarginOpen(intent)) ? (
        <View style={styles.switch}>
          <TradeSwitch current="margin" />
        </View>
      ) : null}
      {body}
      {phoneBar}
      {!wide && sheet ? (
        <Sheet onClose={() => setSheet(false)} closeLabel={t("common.close")} detents={[1]}>
          <SheetHeading title={trade.view ? t("desktop.sheetTitle", { market: trade.view.market }) : t("margin.title")} />
          <TradePanel trade={trade} compact />
        </Sheet>
      ) : null}
      <DetailDrawer open={wide && drawer.open} title={positions.positions?.find((entry) => entry.id === drawer.id)?.market ?? t("margin.title")} onClose={drawer.hide}>
        {drawer.id ? (
          <PositionState positions={positions.positions} id={drawer.id} failed={positions.failed} onRetry={() => void positions.refresh()} onMissing={drawer.hide}>
            {(position) => (
              <>
                <PositionSummary position={position} />
                <PositionActions position={position} closing={drawerClose} onSaved={() => void positions.refresh()} />
              </>
            )}
          </PositionState>
        ) : null}
      </DetailDrawer>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  switch: { paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm },
  phoneBody: { gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
  wideBody: { gap: SPACE.lg, paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.xxxl },
  bar: { position: "absolute", start: 0, end: 0, bottom: 0, flexDirection: "row", gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingTop: SPACE.md },
  plate: { flex: 1, minHeight: PLATE_H, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center" },
});
