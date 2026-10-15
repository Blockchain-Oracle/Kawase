// The agent's feed as a timeline (D37 "watch it work"): what Kawase did, grouped by day, with Watching (the next
// scheduled runs, each with a draining ring) on top. Each row is one object: the venue's real mark (or the token's,
// or a quiet glyph when neither exists), one line saying what happened, the outcome as a word with the venue, and the
// time. A rail joins the marks of one day (21st 28340 "Activity Timeline", olewandowski1: day groups, a rail behind
// the marks, relative times), rows rise in on a 40 ms stagger, and filter chips with counts sit above (21st 35042
// "Chip Group" on the kit's FilterChips). Tapping a row opens its detail (the race it came from and its receipt).
import { CalendarClock, EyeOff, FlaskConical, Hand, Sparkles, Waypoints, X, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { AGENT_FEED_GROUPS, type AgentFeed, type AgentFeedGroup, type AgentFeedItem } from "@kawase/api-client";
import { getVenueIdentity, venueKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { CountdownRing, FilterChips, Icon, LoadingState, Panel, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";

import { PERIOD_SECONDS, useFeedCopy } from "./feed-copy";
import { dismissFeedItem, dismissible } from "./use-agent-feed";

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
/** How far a phone row is swiped before letting go takes it away. */
const SWIPE_THRESHOLD = 72;
const SWIPE_ACTION_WIDTH = 96;
const HALF = 2;

/** The run-kind badge on a token's mark (a calendar on a scheduled run). */
const BADGE = 18;
const BADGE_ICON = 11;
const BADGE_OFFSET = 4;
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
export function FeedMark({ item }: { item: AgentFeedItem }) {
  const { color } = useTheme();
  const venue = item.venue && getVenueIdentity(item.venue) ? venueKey(item.venue) : null;
  if (venue) return <Mark entity={venue} size={MARK} />;
  if (item.token) {
    const token = item.other?.token ?? item.token;
    const mark = <TokenMark token={{ chainId: ARC_CHAIN_IDS[item.network], address: token.address, symbol: token.symbol }} size={MARK} />;
    // A scheduled or practised run still wears its token; a small badge says what kind of run it is.
    const badge = item.kind === "automation" || item.kind === "practice" ? KIND_GLYPH[item.kind] : item.outcome === "waiting" ? Hand : null;
    if (!badge) return mark;
    return (
      <View>
        {mark}
        <View style={[styles.badge, { backgroundColor: color.card, borderColor: color.ground }]}>
          <Icon icon={badge} size={BADGE_ICON} />
        </View>
      </View>
    );
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
  onDismiss,
  rail,
  plated = false,
}: {
  item: AgentFeedItem;
  onPress: (item: AgentFeedItem) => void;
  /** A held or found row the person can take away (on the web its × shows; a phone swipes it). */
  onDismiss?: (() => void) | undefined;
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
      {onDismiss && Platform.OS === "web" ? <DismissButton item={item} onDismiss={onDismiss} /> : null}
    </Pressable>
  );
}

/** The web's way to take a held or found row away: a quiet × at the row's end. */
function DismissButton({ item, onDismiss }: { item: AgentFeedItem; onDismiss: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const label = item.source === "proposal" ? t("feed.list.cancelHeld") : t("feed.list.dismissFound");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={SPACE.xs}
      onPress={onDismiss}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.dismiss, { backgroundColor: pressed || hovered ? color.rowPressed : color.transparent }]}
    >
      <Icon icon={X} size={SIZE.iconSm} tint={color.text3} />
    </Pressable>
  );
}

/** A phone row that swipes away: past the threshold, letting go cancels a held one or dismisses a found one. */
function SwipeAway({ item, onDismiss, children }: { item: AgentFeedItem; onDismiss: () => void; children: React.ReactNode }) {
  const { t } = useT();
  const { color } = useTheme();
  const held = item.source === "proposal";
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={SWIPE_THRESHOLD}
      overshootRight={false}
      onSwipeableOpen={onDismiss}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: held ? color.destructive : color.raised2 }]}>
          <Icon icon={held ? X : EyeOff} size={SIZE.iconSm} tint={held ? color.onFill : color.ink} />
          <Text style={[TYPE.chipLabel, { color: held ? color.onFill : color.ink }]}>{held ? t("feed.list.cancelHeld") : t("feed.list.dismissFound")}</Text>
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/** Takes the row off the feed; a held one says nothing moved, a refusal says so. */
function useDismiss() {
  const { t } = useT();
  return React.useCallback(
    (item: AgentFeedItem) => {
      fire("tick");
      void dismissFeedItem(item).then((gone) => {
        if (!gone) notify.error(t("feed.list.dismissFailed"));
        else if (item.source === "proposal") notify.info(t("feed.list.cancelledHeld"));
      });
    },
    [t],
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
  const dismiss = useDismiss();
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
                  {dismissible(row) && Platform.OS !== "web" ? (
                    <SwipeAway item={row} onDismiss={() => dismiss(row)}>
                      <FeedRow item={row} onPress={onOpen} plated={plated} rail={{ above: at > 0, below: at < section.rows.length - 1 }} />
                    </SwipeAway>
                  ) : (
                    <FeedRow
                      item={row}
                      onPress={onOpen}
                      onDismiss={dismissible(row) ? () => dismiss(row) : undefined}
                      plated={plated}
                      rail={{ above: at > 0, below: at < section.rows.length - 1 }}
                    />
                  )}
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
  dismiss: { width: SIZE.touch - SPACE.md, height: SIZE.touch - SPACE.md, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  swipeAction: { width: SWIPE_ACTION_WIDTH, alignItems: "center", justifyContent: "center", gap: SPACE.xxs },
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
  badge: { position: "absolute", end: -BADGE_OFFSET, bottom: -BADGE_OFFSET, width: BADGE, height: BADGE, borderRadius: BADGE, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  glyph: { width: MARK, height: MARK, borderRadius: MARK / HALF, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: SPACE.xxs },
  end: { alignItems: "flex-end", gap: SPACE.xxs },
});
