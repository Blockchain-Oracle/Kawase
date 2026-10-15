// The agent's feed as a timeline (D37 "watch it work"): what Kawase did, grouped by day, with Watching (the next
// scheduled runs, each with a draining ring) on top. Each row is one object: the venue's real mark (or the token's,
// or a quiet glyph when neither exists), one line saying what happened, the outcome as a word with the venue, and the
// time. A rail joins the marks of one day (21st 28340 "Activity Timeline", olewandowski1: day groups, a rail behind
// the marks, relative times), rows rise in on a 40 ms stagger, and filter chips with counts sit above (21st 35042
// "Chip Group" on the kit's FilterChips). Tapping a row opens its detail (the race it came from and its receipt).
import { CalendarClock, FlaskConical, Hand, Sparkles, Waypoints, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { AGENT_FEED_GROUPS, type AgentFeed, type AgentFeedGroup, type AgentFeedItem } from "@kawase/api-client";
import { getVenueIdentity, venueKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { CountdownRing, FilterChips, Icon, LoadingState, Panel, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";

import { PERIOD_SECONDS, useFeedCopy } from "./feed-copy";

export type FeedFilter = AgentFeedGroup | "all";
const FILTERS: readonly FeedFilter[] = ["all", ...AGENT_FEED_GROUPS];

const MARK = SIZE.markRow;
const RING = SIZE.markRow;
const RING_STROKE = 3;
const MS = 1000;
/** The rail runs through the middle of the marks. */
const RAIL_WIDTH = 2;
/** Rows animate in only on the first screenful; later ones just appear. */
const STAGGER_ROWS = 8;
const HALF = 2;

const KIND_GLYPH: Partial<Record<AgentFeedItem["kind"], LucideIcon>> = { automation: CalendarClock, practice: FlaskConical, suggestion: Sparkles };

/** The filter chips with each group's count ("Done 3"); "All" counts every row. */
export function FeedFilters({ feed, value, onChange }: { feed: AgentFeed | undefined; value: FeedFilter; onChange: (next: FeedFilter) => void }) {
  const { t } = useT();
  const copy = useFeedCopy();
  const counts = new Map<FeedFilter, number>(feed?.groups.map((group) => [group.group, group.count]) ?? []);
  counts.set("all", feed?.groups.reduce((sum, group) => sum + group.count, 0) ?? 0);
  const options = FILTERS.filter((filter) => filter === "all" || (counts.get(filter) ?? 0) > 0 || filter === value).map((filter) => ({
    value: filter,
    label: feed ? t("feed.list.filterCount", { label: copy.group(filter), count: counts.get(filter) ?? 0 }) : copy.group(filter),
  }));
  return <FilterChips options={options} value={value} onChange={onChange} label={t("feed.list.filterLabel")} />;
}

/** The rows a filter shows, Watching first (soonest first), then everything else newest first. */
export function rowsFor(feed: AgentFeed | undefined, filter: FeedFilter): AgentFeedItem[] {
  if (!feed) return [];
  const groups = feed.groups.filter((group) => filter === "all" || group.group === filter);
  const watching = groups.find((group) => group.group === "watching")?.items ?? [];
  const rest = groups
    .filter((group) => group.group !== "watching")
    .flatMap((group) => group.items)
    .sort((a, b) => (a.group === "found" ? 1 : 0) - (b.group === "found" ? 1 : 0) || b.at.localeCompare(a.at));
  return [...watching, ...rest];
}

/** The row's face: the venue's mark, else the token's, else a glyph for what it is. */
function FeedMark({ item }: { item: AgentFeedItem }) {
  const { color } = useTheme();
  const venue = item.venue && getVenueIdentity(item.venue) ? venueKey(item.venue) : null;
  if (venue) return <Mark entity={venue} size={MARK} />;
  if (item.token && item.kind !== "automation") {
    const token = item.other?.token ?? item.token;
    return <TokenMark token={{ chainId: ARC_CHAIN_IDS[item.network], address: token.address, symbol: token.symbol }} size={MARK} />;
  }
  const glyph = item.outcome === "waiting" ? Hand : (KIND_GLYPH[item.kind] ?? Waypoints);
  return (
    <View style={[styles.glyph, { backgroundColor: color.raised2 }]}>
      <Icon icon={glyph} size={SIZE.iconSm} />
    </View>
  );
}

export function FeedRow({
  item,
  onPress,
  rail,
  plated = false,
}: {
  item: AgentFeedItem;
  onPress: (item: AgentFeedItem) => void;
  rail: { above: boolean; below: boolean };
  /** On a plate (Activity): the row is inset like every list row on a panel, and the rail reaches the next row. */
  plated?: boolean;
}) {
  const { color } = useTheme();
  const copy = useFeedCopy();
  const watching = item.outcome === "scheduled";
  const due = Math.floor(new Date(item.at).getTime() / MS);
  const period = PERIOD_SECONDS[item.reasonParams?.every ?? "day"] ?? PERIOD_SECONDS.day!;
  const tone = item.outcome === "failed" ? color.destructive : item.outcome === "waiting" ? color.warn : color.text3;
  const line = copy.line(item);
  const detail = copy.detail(item);
  const when = watching ? copy.until(item.at) : copy.time(item.at);
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        onPress(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${line}. ${detail}. ${when}`}
      style={({ pressed }) => [styles.row, plated ? styles.rowPlated : null, pressed ? { backgroundColor: color.rowPressed } : null]}
    >
      <View style={styles.lead}>
        {rail.above ? <View style={[styles.rail, plated ? styles.railAbovePlated : styles.railAbove, { backgroundColor: color.skeleton }]} /> : null}
        {rail.below ? <View style={[styles.rail, plated ? styles.railBelowPlated : styles.railBelow, { backgroundColor: color.skeleton }]} /> : null}
        <FeedMark item={item} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[TYPE.rowTitle, { color: color.ink }]}>
          {line}
        </Text>
        <Text numberOfLines={2} style={[TYPE.rowDetail, { color: tone }]}>
          {detail}
        </Text>
      </View>
      <View style={styles.end}>
        {watching ? <CountdownRing fromSec={due - period} toSec={due} size={RING} stroke={RING_STROKE} /> : null}
        <Text style={[TYPE.meta, { color: color.text3 }]}>{when}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The timeline: Watching on top, then a heading per day. `limit` keeps Home's glance short (Activity shows all).
 * Loading is the feed's own skeleton; empty and error states are the host's (they differ between Home and Activity).
 */
export function FeedTimeline({
  feed,
  filter,
  limit,
  onOpen,
  plated = false,
}: {
  feed: AgentFeed | undefined;
  filter: FeedFilter;
  limit?: number;
  onOpen: (item: AgentFeedItem) => void;
  /** Each day's rows on a panel, the way Activity's "All money" list sits (Activity); Home keeps them on the ground. */
  plated?: boolean;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const copy = useFeedCopy();
  const reduced = useReducedMotion();
  if (!feed) return <LoadingState shape="feed" />;
  const rows = rowsFor(feed, filter).slice(0, limit);
  const sections: { title: string; rows: AgentFeedItem[] }[] = [];
  for (const row of rows) {
    const title = row.outcome === "scheduled" ? t("feed.list.watchingHead") : row.group === "found" ? t("feed.list.foundHead") : copy.day(row.at);
    const last = sections.at(-1);
    if (last && last.title === title) last.rows.push(row);
    else sections.push({ title, rows: [row] });
  }
  let index = 0;
  return (
    <View style={styles.list}>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={[TYPE.label, styles.head, plated ? styles.headPlated : null, { color: color.text3 }]}>
            {section.title}
          </Text>
          <Plate plated={plated}>
            {section.rows.map((row, at) => {
              const order = index++;
              return (
                <Animated.View key={row.id} entering={reduced || order >= STAGGER_ROWS ? undefined : FadeInDown.delay(order * TIMING.stagger).duration(TIMING.staggerItem)}>
                  <FeedRow item={row} onPress={onOpen} plated={plated} rail={{ above: at > 0, below: at < section.rows.length - 1 }} />
                </Animated.View>
              );
            })}
          </Plate>
        </View>
      ))}
    </View>
  );
}

function Plate({ plated, children }: { plated: boolean; children: React.ReactNode }) {
  return plated ? <Panel style={styles.plate}>{children}</Panel> : <>{children}</>;
}

const styles = StyleSheet.create({
  list: { gap: SPACE.lg },
  plate: { paddingVertical: SPACE.xs },
  headPlated: { paddingHorizontal: SPACE.lg },
  rowPlated: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: 0 },
  railAbovePlated: { top: -SPACE.md, height: "50%" },
  railBelowPlated: { bottom: -SPACE.md, height: "50%" },
  section: { gap: SPACE.xxs },
  head: { paddingHorizontal: SPACE.xs, paddingBottom: SPACE.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xs, borderRadius: SPACE.md },
  lead: { width: MARK, alignItems: "center", alignSelf: "stretch", justifyContent: "center" },
  rail: { position: "absolute", width: RAIL_WIDTH, start: (MARK - RAIL_WIDTH) / HALF },
  railAbove: { top: -SPACE.sm, height: "50%" },
  railBelow: { bottom: -SPACE.sm, height: "50%" },
  glyph: { width: MARK, height: MARK, borderRadius: MARK / HALF, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: SPACE.xxs },
  end: { alignItems: "flex-end", gap: SPACE.xxs },
});
