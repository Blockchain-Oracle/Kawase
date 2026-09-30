import { ENGINE_MARKETS } from "@senryo/config";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkline } from "~/components/charts/Sparkline";
import { Skeleton } from "~/components/kit/states";
import { fire } from "~/feedback/fire";
import { tradeRoute } from "~/lib/constants/routes";
import { arrow, price18, signedPct } from "~/lib/money";
import { DISABLED_OPACITY, HAIRLINE_PX, SIZE, SPACE, TYPE, useTheme } from "~/theme";
import { ageLabel, STATUS_LABEL, statusTone } from "./session";
import { useMarketLine } from "./useMarketLine";

const MS_PER_SECOND = 1000n;

/**
 * One engine watchlist row (21st Market Watchlist #20110): name, venue · session · max leverage, sparkline from
 * hourly Chainlink rounds, oracle price with its age, 24 h change with ▲▼ and a sign (never colour alone).
 */
export function EngineMarketRow({ marketId, first }: { marketId: number; first: boolean }) {
  const { color } = useTheme();
  const meta = ENGINE_MARKETS.find((m) => m.id === marketId);
  const reading = useMarketLine(marketId, meta?.symbol ?? "");
  const border = first ? null : { borderTopWidth: HAIRLINE_PX, borderTopColor: color.hairline };
  if (reading.status === "unknown" || reading.status === "failed") {
    return (
      <View style={[styles.row, border]}>
        <View style={styles.name}>
          <Text style={[TYPE.bodyStrong, { color: color.ink }]}>{meta?.symbol}</Text>
          <Text style={[TYPE.caption, { color: color.inkMuted }]}>
            {reading.status === "failed" ? "Price unavailable · retrying" : "Reading the oracle"}
          </Text>
        </View>
        <Skeleton width={SIZE.sparklineWidth} height={SIZE.skeletonLine} />
      </View>
    );
  }
  const line = reading.value;
  const change = line.change24hBps;
  const tint = change === undefined ? color.inkMuted : change >= 0n ? color.up : color.down;
  const age = ageLabel(line.updatedAt, BigInt(Date.now()) / MS_PER_SECOND);
  const changeText = change === undefined ? "24h —" : `${arrow(change)} ${signedPct(change)}`;
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        router.push(tradeRoute(line.symbol));
      }}
      accessibilityRole="button"
      accessibilityLabel={`${line.name}, Senryo, ${STATUS_LABEL[line.status]}, price ${price18(line.price18)} dollars, updated ${age}${change === undefined ? "" : `, ${change >= 0n ? "up" : "down"} ${signedPct(change)}`}`}
      style={({ pressed }) => [styles.row, border, pressed ? { backgroundColor: color.muted } : null]}
    >
      <View style={styles.name}>
        <Text style={[TYPE.bodyStrong, { color: color.ink }]}>{line.symbol}</Text>
        <Text style={[TYPE.caption, { color: color.inkMuted }]} numberOfLines={1}>
          Senryo · <Text style={{ color: statusTone(line.status, color) }}>{STATUS_LABEL[line.status]}</Text> ·{" "}
          {line.maxLeverageX}×
        </Text>
      </View>
      <Sparkline values={line.spark} stroke={tint} />
      <View style={styles.price}>
        <Text style={[TYPE.numSm, { color: color.ink }]}>${price18(line.price18)}</Text>
        <Text style={[TYPE.micro, { color: tint }]}>
          {changeText} · {age}
        </Text>
      </View>
    </Pressable>
  );
}

export interface UpcomingMarket {
  symbol: string;
  name: string;
  venue: "Perpl" | "Senryo";
  note: string;
}

/** A market that isn't live yet: name and why, never a price (plan §2.5: no fabricated numbers). */
export function UpcomingMarketRow({ market, first }: { market: UpcomingMarket; first: boolean }) {
  const { color } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${market.name}, ${market.venue}, ${market.note}`}
      style={[
        styles.row,
        first ? null : { borderTopWidth: HAIRLINE_PX, borderTopColor: color.hairline },
        { opacity: DISABLED_OPACITY },
      ]}
    >
      <View style={styles.name}>
        <Text style={[TYPE.bodyStrong, { color: color.ink }]}>{market.symbol}</Text>
        <Text style={[TYPE.caption, { color: color.inkMuted }]}>
          {market.venue} · {market.note}
        </Text>
      </View>
      <Text style={[TYPE.label, { color: color.inkMuted }]}>{market.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    minHeight: SIZE.touch + SPACE.xl,
  },
  name: { flex: 1, gap: SPACE.xxs },
  price: { alignItems: "flex-end", gap: SPACE.xxs, minWidth: SIZE.sparklineWidth + SPACE.lg },
});
