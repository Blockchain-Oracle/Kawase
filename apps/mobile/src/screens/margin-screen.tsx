// Long / Short (Kawase Margin; trade.md, surfaces.md "Trade tickets"): the markets Aave V4 lists on Arc, each with
// its live price and what each side allows ("up to 3.4×", or why not: "Short only"), the person's open positions,
// and the ticket. Choosing a side drafts the order at once (2× with $10 until they change it), so the ticket opens
// with real numbers. Testnet says plainly that this runs on mainnet only and offers the switch (R2, R11). Guests see
// the markets; any order opens sign-in in place (R13).
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { MarginMarketView, MarginSide } from "@kawase/api-client";
import { MARGIN } from "@kawase/config";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { MainnetConsentSheet } from "@/components/network-pill";
import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { MarginTicket } from "@/margin/margin-ticket";
import { PositionRow } from "@/margin/position-row";
import { isMarginFinished, isMarginMoving, useMarginMarkets, useMarginOrder, useMarginPositions } from "@/margin/use-margin";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { TradeSwitch } from "@/swap/trade-switch";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const MARK = 40;
const PROVIDER_MARK = 28;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;
const FOOTER_GAP = 24;

export type MarginPrefill = { market?: string | undefined; side?: MarginSide | undefined };

function SideButton({ side, view, onPress }: { side: MarginSide; view: MarginMarketView["long"]; onPress: () => void }) {
  const { t } = useT();
  const format = useMarginFormat();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !view.available }}
      disabled={!view.available}
      onPress={onPress}
      className={cn("min-w-24 items-center rounded-2xl px-3 py-2", view.available ? (side === "long" ? "bg-success/15 active:bg-success/25" : "bg-destructive/15 active:bg-destructive/25") : "bg-muted")}
    >
      <Text className={cn("text-sm font-semibold", view.available ? (side === "long" ? "text-success" : "text-destructive") : "text-muted-foreground")}>{t(`margin.${side}`)}</Text>
      <Text className="text-muted-foreground text-xs">{view.available ? t("margin.upTo", { leverage: format.leverage(view.maxLeverage) }) : t(`margin.unavailable_${view.reason ?? "not_borrowable"}`)}</Text>
    </Pressable>
  );
}

export function MarginScreen({ prefill }: { prefill: MarginPrefill }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useMarginFormat();
  const markets = useMarginMarkets();
  const { positions, refresh } = useMarginPositions();
  const controller = useMarginOrder();
  const [opening, setOpening] = React.useState(false);
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const intent = controller.intent;
  const ticketMarket = intent?.draft ? markets.view?.markets.find((m) => m.market === intent.draft!.market) : undefined;

  const open = React.useCallback(
    async (market: string, side: MarginSide) => {
      if (status !== "account") {
        signIn.open();
        return;
      }
      setOpening(true);
      try {
        const { intent: fresh } = await api.margin.create({ action: "open", market, side, margin: String(MARGIN.presets[0]) });
        controller.set(fresh);
      } catch {
        toast(t("margin.unavailable"));
      } finally {
        setOpening(false);
      }
    },
    [controller, signIn, status, t],
  );

  // A prefilled market and side (chat, a token page) open the ticket straight away, once.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !prefill.market || !prefill.side || !markets.view?.available) return;
    prefilled.current = true;
    void open(prefill.market, prefill.side);
  }, [markets.view?.available, open, prefill.market, prefill.side]);

  // A finished order refreshes the positions list.
  const finished = intent ? isMarginFinished(intent) : false;
  React.useEffect(() => {
    if (finished) void refresh();
  }, [finished, refresh]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (intent && !isMarginMoving(intent)) controller.reset();
    else leave();
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={intent ? back : leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <View className="flex-1">
          <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
            {t("margin.title")}
          </Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("margin.subtitle")}</Text>
        </View>
        <Mark entity="provider:aave" size={PROVIDER_MARK} />
      </View>
      {!intent ? (
        <View className="px-5 pt-3">
          <TradeSwitch current="margin" />
        </View>
      ) : null}
    </>
  );

  let body: React.ReactNode;
  if (intent) {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        {!testnet ? <Eyebrow className="text-foreground">{t("network.realMoney")}</Eyebrow> : null}
        <MarginTicket controller={controller} market={ticketMarket} />
      </ScrollView>
    );
  } else if (markets.view && !markets.view.available) {
    body = (
      <View className="flex-1 justify-center gap-4 px-5">
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("margin.mainnetOnly")}</Text>
        {networkSwitch.nextAvailable ? (
          <Button disabled={networkSwitch.busy} onPress={() => void networkSwitch.switchNetwork("mainnet")}>
            <Text>{t("margin.switchToMainnet")}</Text>
          </Button>
        ) : null}
      </View>
    );
  } else {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        {positions && positions.length > 0 ? (
          <View className="gap-2">
            <Eyebrow>{t("margin.yourPositions")}</Eyebrow>
            <ListGroup>
              {positions.map((position) => (
                <PositionRow key={position.id} position={position} />
              ))}
            </ListGroup>
          </View>
        ) : null}
        <View className="gap-2">
          <Eyebrow>{t("margin.markets")}</Eyebrow>
          {!markets.view ? (
            markets.failed ? (
              <Button variant="secondary" onPress={() => void markets.refresh()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            ) : (
              <View className="gap-2">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
                ))}
              </View>
            )
          ) : (
            <ListGroup>
              {markets.view.markets.map((market) => (
                <View key={market.market} className="flex-row items-center gap-3 px-4 py-3">
                  <Mark entity={marketEntity(market.asset)} size={MARK} />
                  <View className="min-w-0 flex-1">
                    <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{market.market}</Text>
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{format.price(market.price)}</Text>
                  </View>
                  <SideButton side="short" view={market.short} onPress={() => void open(market.market, "short")} />
                  <SideButton side="long" view={market.long} onPress={() => void open(market.market, "long")} />
                </View>
              ))}
            </ListGroup>
          )}
          {opening ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("margin.loading")}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="bg-background flex-1">
      {header}
      {body}
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
  );
}
