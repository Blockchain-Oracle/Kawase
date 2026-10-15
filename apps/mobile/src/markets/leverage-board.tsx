// Long or short, as its own surface at the top of Markets (Abu's 10-15 review: "long or short is different from the
// meme coins and the tokens", "graphical, moving in real time, before you even tap"). Owarine's market cards
// (mobile/src/features/markets/board/MarketCard.tsx + chart/LiveLine.tsx) in Kawase's words: one card per market
// Aave V4 lists on Arc — its mark, the price moving with the exchange's ticker, the change since the hour opened, the
// live line against that open (green while longs are ahead, red while shorts are, a pulsing head), who is ahead in
// words, and a Long and a Short plate with each side's cap that open the ticket on that side. A phone scrolls the
// cards sideways; a desktop window shows them side by side. Loading is the cards' own shape; testnet says Mainnet only.
import { useRouter } from "expo-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { formatUnits } from "viem";

import type { MarginMarketView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { ChangeChip, Icon, LiveDot, PRESS_SCALE, RADIUS, Skeleton, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { marketEntity, PRICE_DECIMALS, useMarginFormat } from "@/margin/copy";
import { useMarginMarkets } from "@/margin/use-margin";
import { useSession } from "@/session/session-provider";
import { LiveNumber } from "@/trade/bits";
import { useCandles } from "@/trade/use-candles";
import { useLivePrices } from "@/trade/use-live-prices";

import { LiveLine, type LinePoint } from "./live-line";

const CARD_MAX = 320;
const CARD_GUTTER = 56;
const LINE_H = 96;
const PRICE_H = 26;
const MARK = 32;
const PLATE_H = 48;
const KEEP_TICKS = 240;
const MS_PER_SECOND = 1000;
const SKELETON_CARDS = 3;
const TICKET_LINE_H = 72;
/** A line needs two prices. */
const MIN_LINE_POINTS = 2;
/** A card's own height while the markets load: the head, the line, the words and the plates. */
const CARD_SKELETON_H = 260;

const priceOf = (eightDecimals: string) => Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS));

export function LeverageBoard() {
  const { t } = useT();
  const { color } = useTheme();
  const wide = useWide();
  const { width } = useWindowDimensions();
  // Mainnet's markets for everyone (public data, like the token lists); a testnet session's plates say Mainnet only.
  const { view, failed, refresh } = useMarginMarkets({ live: true, network: "mainnet" });
  const { user } = useSession();
  const onTestnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const ticker = useLivePrices(view?.markets.map((market) => market.market) ?? []);
  const cardWidth = wide ? undefined : Math.min(CARD_MAX, width - CARD_GUTTER);

  const cards = !view
    ? Array.from({ length: SKELETON_CARDS }, (_, index) => <Skeleton key={index} width={cardWidth ?? "32%"} height={CARD_SKELETON_H} radius={RADIUS.lg} />)
    : view.markets.map((market) => (
        <MarketCard key={market.market} market={market} live={ticker.prices[market.market]} available={view.available && !onTestnet} width={cardWidth} />
      ));

  return (
    <View style={styles.board}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>
            {t("markets.leverageTitle")}
          </Text>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("markets.leverageSubtitle")}</Text>
        </View>
        {ticker.live ? (
          <View style={styles.live}>
            <LiveDot />
            <Text style={[TYPE.label, { color: color.text2 }]}>{t("tokenPage.live")}</Text>
          </View>
        ) : null}
      </View>
      {failed && !view ? (
        <Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.failed, { backgroundColor: color.raised2 }]}>
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("markets.loadFailed")}</Text>
          <Text style={[TYPE.chipLabel, { color: color.ink }]}>{t("common.retry")}</Text>
        </Pressable>
      ) : wide ? (
        <View style={styles.row}>{cards}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={(cardWidth ?? 0) + SPACE.md} decelerationRate="fast" contentContainerStyle={styles.scroll}>
          {cards}
        </ScrollView>
      )}
    </View>
  );
}

/** A market's hour so far: its candles' closes, then the ticker's prices since, against the hour's open. */
export function useMarketLine(market: MarginMarketView, live: { price: number; at: number } | undefined, locale: string) {
  const { candles } = useCandles(market.asset, "1H");
  const [ticks, setTicks] = React.useState<LinePoint[]>([]);
  React.useEffect(() => {
    if (!live) return;
    setTicks((current) => (current.at(-1)?.t === live.at / MS_PER_SECOND ? current : [...current, { t: live.at / MS_PER_SECOND, v: live.price }].slice(-KEEP_TICKS)));
  }, [live]);
  const history: LinePoint[] = (candles ?? []).map((candle) => ({ t: candle.t, v: candle.c }));
  const lastCandle = history.at(-1)?.t ?? 0;
  const points = [...history, ...ticks.filter((tick) => tick.t > lastCandle)];
  const open = candles?.[0]?.o ?? null;
  const price = live?.price ?? priceOf(market.price);
  return {
    points,
    open,
    price,
    change: open ? price / open - 1 : null,
    since: candles?.[0] ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(candles[0].t * MS_PER_SECOND)) : null,
    longsAhead: open !== null && price >= open,
  };
}

/** The ticket's own small chart (Mitoshi's TicketMiniChart): the market's hour against its open, moving live. */
export function TicketLine({ market }: { market: MarginMarketView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const ticker = useLivePrices([market.market]);
  const line = useMarketLine(market, ticker.prices[market.market], locale);
  if (line.points.length < MIN_LINE_POINTS) return <Skeleton height={TICKET_LINE_H} radius={RADIUS.md} />;
  return (
    <View style={styles.ticketLine}>
      <LiveLine points={line.points} reference={line.open} height={TICKET_LINE_H} label={t("markets.leverageChart", { market: market.market })} />
      {line.since ? (
        <Text style={[TYPE.meta, { color: line.longsAhead ? color.up : color.down }]}>{line.longsAhead ? t("markets.longsAhead", { time: line.since }) : t("markets.shortsAhead", { time: line.since })}</Text>
      ) : null}
    </View>
  );
}

function MarketCard({ market, live, available, width }: { market: MarginMarketView; live: { price: number; at: number } | undefined; available: boolean; width: number | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const format = useMarginFormat();
  const { points, open, price, change, since, longsAhead } = useMarketLine(market, live, locale);

  const go = (side?: "long" | "short") => {
    fire("tick");
    router.push({ pathname: "/margin", params: { market: market.market, ...(side ? { side } : {}) } });
  };

  return (
    <View style={[styles.card, width ? { width } : styles.cardWide, { backgroundColor: color.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={market.market} onPress={() => go()} style={styles.cardHead}>
        <Mark entity={marketEntity(market.asset)} size={MARK} />
        <View style={styles.grow}>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{market.market}</Text>
          <ChangeChip change={change} />
        </View>
        <LiveNumber text={format.usd(price)} value={price} height={PRICE_H} align="right" />
      </Pressable>
      {points.length > 1 ? (
        <LiveLine points={points} reference={open} height={LINE_H} label={t("markets.leverageChart", { market: market.market })} />
      ) : (
        <Skeleton height={LINE_H} radius={RADIUS.md} />
      )}
      {since ? (
        <Text style={[TYPE.meta, { color: longsAhead ? color.up : color.down }]}>{longsAhead ? t("markets.longsAhead", { time: since }) : t("markets.shortsAhead", { time: since })}</Text>
      ) : null}
      <View style={styles.plates}>
        {(["long", "short"] as const).map((side) => {
          const entry = market[side];
          const on = available && entry.available;
          const fill = side === "long" ? color.upFill : color.downFill;
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityState={{ disabled: !entry.available }}
              disabled={!entry.available}
              onPress={() => go(side)}
              style={({ pressed }) => [styles.plate, { backgroundColor: on ? fill : color.raised2, transform: [{ scale: pressed ? PRESS_SCALE : 1 }] }]}
            >
              <View style={styles.plateTop}>
                <Icon icon={side === "long" ? ArrowUpRight : ArrowDownRight} size={SIZE.iconSm} tint={on ? color.onFill : color.text3} />
                <Text style={[TYPE.buttonCompact, { color: on ? color.onFill : color.text3 }]}>{t(`margin.${side}`)}</Text>
              </View>
              <Text style={[TYPE.meta, { color: on ? color.onFill : color.text3 }]}>
                {entry.available ? (available ? t("margin.upTo", { leverage: format.leverage(entry.maxLeverage) }) : t("margin.unavailable_mainnet_only")) : t(`margin.unavailable_${entry.reason ?? "not_borrowable"}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: SPACE.md },
  head: { flexDirection: "row", alignItems: "flex-end", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  live: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  row: { flexDirection: "row", gap: SPACE.md },
  scroll: { gap: SPACE.md, paddingEnd: SPACE.lg },
  card: { borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  cardWide: { flex: 1, minWidth: 0 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  plates: { flexDirection: "row", gap: SPACE.sm },
  plate: { flex: 1, minHeight: PLATE_H, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, justifyContent: "center", gap: SPACE.xxs },
  plateTop: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  ticketLine: { gap: SPACE.xs },
  failed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: RADIUS.lg, padding: SPACE.lg },
});
