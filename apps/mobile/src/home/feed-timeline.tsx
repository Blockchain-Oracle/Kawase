// The agent's feed as a wallet's activity list (D37 "watch it work"; Abu 10-15: "this is a wallet, it has to feel that
// way"): grouped by day, with Watching (the next scheduled runs, each with a draining ring) on top. Each row reads like
// Fuse's and Phantom's (Refero): the token's real mark with a small badge for what happened (a swap's two marks
// overlapping), a short title ("Sent", "USDC → EURC", "Bridged"), who or where under it with the venue, and the amount
// at the end with its sign ("+20 USDC" in the gain colour, "−5 USDC" in ink, grey when nothing moved), a swap's other
// leg under it. Rows rise in on a 40 ms stagger and filter chips with counts sit above (21st 35042 "Chip Group" on the
// kit's FilterChips). Tapping a row opens the same receipt everywhere (feed-detail-sheet).
import {
  ArrowDownLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  CalendarClock,
  EyeOff,
  Flame,
  FlaskConical,
  Hand,
  Route,
  Sparkles,
  Sprout,
  Store,
  TrendingDown,
  TrendingUp,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { AGENT_FEED_GROUPS, type AgentFeed, type AgentFeedGroup, type AgentFeedItem } from "@kawase/api-client";
import { arcIdentity, getVenueIdentity, venueKey } from "@kawase/identity";
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

/** The row's face, a little larger than a list mark (Fuse's and Family's activity rows). */
const FACE = SIZE.markRow + SPACE.xs;
/** A swap's two marks, overlapping inside the face. */
const SWAP_MARK = SIZE.markToken - SPACE.xxs;
const SWAP_RING = 2;
const RING = 14;
const RING_STROKE = 2;
const MS = 1000;
/** Rows animate in only on the first screenful; later ones just appear. */
const STAGGER_ROWS = 8;
/** How far a phone row is swiped before letting go takes it away. */
const SWIPE_THRESHOLD = 72;
const SWIPE_ACTION_WIDTH = 96;
const HALF = 2;

/** The badge on the face: what happened (sent, received, bridged…), or that it failed or waits for the person. */
const BADGE = 18;
const BADGE_ICON = 11;
const BADGE_OFFSET = 3;
/** A found row's badge: what Kawase noticed about the coin on its face. */
const FOUND_GLYPH: Partial<Record<string, LucideIcon>> = {
  trending_token: Flame,
  big_move: TrendingUp,
  service_pick: Store,
  idle_cash: Sprout,
  better_route: Route,
  stuck_bridge: Waypoints,
};
const KIND_GLYPH: Partial<Record<AgentFeedItem["kind"], LucideIcon>> = {
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  bridge: Waypoints,
  crosschain: Waypoints,
  earn: Sprout,
  lend: Sprout,
  withdraw: ArrowUpFromLine,
  margin: TrendingUp,
  automation: CalendarClock,
  practice: FlaskConical,
  suggestion: Sparkles,
};

/** The filter chips with each group's count ("Done 3"); "All" counts every row. */
export function FeedFilters({
  feed,
  value,
  onChange,
  centered = false,
}: {
  feed: AgentFeed | undefined;
  value: FeedFilter;
  onChange: (next: FeedFilter) => void;
  centered?: boolean;
}) {
  const { t } = useT();
  const copy = useFeedCopy();
  const counts = new Map<FeedFilter, number>(feed?.groups.map((group) => [group.group, group.count]) ?? []);
  counts.set("all", feed?.groups.reduce((sum, group) => sum + group.count, 0) ?? 0);
  const options = FILTERS.filter((filter) => filter === "all" || (counts.get(filter) ?? 0) > 0 || filter === value).map((filter) => ({
    value: filter,
    label: feed ? t("feed.list.filterCount", { label: copy.group(filter), count: counts.get(filter) ?? 0 }) : copy.group(filter),
  }));
  return <FilterChips options={options} value={value} onChange={onChange} label={t("feed.list.filterLabel")} centered={centered} />;
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

/**
 * The row's face: the token's mark (a swap's two, overlapping), else the venue's, else a glyph for what it is, with a
 * badge for what happened. `ring` is the colour the face sits on, so the badge and the swap's front mark are cut out.
 */
export function FeedMark({ item, ring }: { item: AgentFeedItem; ring?: string | undefined }) {
  const { color } = useTheme();
  const cut = ring ?? color.ground;
  const chainId = ARC_CHAIN_IDS[item.network];
  const mark = (token: NonNullable<AgentFeedItem["token"]>, size: number) => (
    <TokenMark token={{ chainId, address: token.address, symbol: token.symbol, logoUrl: token.logoUrl ?? null }} size={size} />
  );
  const swap = item.kind === "swap" && item.token && item.other;
  const venue = item.venue && getVenueIdentity(item.venue) ? venueKey(item.venue) : null;
  // A found row wears the coin it is about (Abu 10-15: real logos, never a star): a trending token's own mark, or USDC's
  // and EURC's from the registry; its badge says what Kawase noticed.
  const facts = item.suggestion?.facts;
  const ids = arcIdentity(item.network);
  const symbol = (facts?.token ?? facts?.asset ?? "").toUpperCase();
  const registry = symbol === "USDC" ? ids.usdc : symbol === "EURC" ? ids.eurc : null;
  const found = item.kind === "suggestion" && facts ? (facts.address ? { trending: true } : registry ? { trending: false } : null) : null;
  const glyph =
    item.kind === "suggestion"
      ? facts?.change?.startsWith("-") || facts?.change?.startsWith("−")
        ? TrendingDown
        : (FOUND_GLYPH[item.suggestion?.kind ?? ""] ?? Sparkles)
      : KIND_GLYPH[item.kind];
  const badge =
    item.outcome === "failed" || item.outcome === "skipped"
      ? { icon: X, fill: color.destructive, tint: color.onFill }
      : item.outcome === "waiting"
        ? { icon: Hand, fill: color.warn, tint: color.ground }
        : !swap && (item.token || venue || found) && glyph
          ? { icon: glyph, fill: color.raised2, tint: color.ink }
          : null;
  const face = swap ? (
    <View style={styles.face}>
      <View style={styles.swapBack}>{mark(item.other!.token, SWAP_MARK)}</View>
      <View style={[styles.swapFront, { borderColor: cut, backgroundColor: cut }]}>{mark(item.token!, SWAP_MARK)}</View>
    </View>
  ) : item.token ? (
    mark(item.other?.token ?? item.token, FACE)
  ) : found?.trending && facts?.address ? (
    <TokenMark token={{ chainId, address: facts.address, symbol: facts.token ?? "", logoUrl: facts.logo ?? null }} size={FACE} />
  ) : registry && found ? (
    <Mark entity={registry} size={FACE} />
  ) : venue ? (
    <Mark entity={venue} size={FACE} />
  ) : (
    <View style={[styles.glyph, { backgroundColor: color.raised2 }]}>
      <Icon icon={item.outcome === "waiting" ? Hand : (glyph ?? Waypoints)} size={SIZE.iconSm} />
    </View>
  );
  return (
    <View style={styles.face}>
      {face}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: badge.fill, borderColor: cut }]}>
          <Icon icon={badge.icon} size={BADGE_ICON} tint={badge.tint} />
        </View>
      ) : null}
    </View>
  );
}

export function FeedRow({
  item,
  onPress,
  onDismiss,
  plated = false,
  selected = false,
}: {
  item: AgentFeedItem;
  onPress: (item: AgentFeedItem) => void;
  /** The row whose receipt shows beside the list (Activity on a desktop). */
  selected?: boolean;
  /** A held or found row the person can take away (on the web its × shows; a phone swipes it). */
  onDismiss?: (() => void) | undefined;
  /** On a plate (Activity): the row is inset like every list row on a panel. */
  plated?: boolean;
}) {
  const { color } = useTheme();
  const copy = useFeedCopy();
  const watching = item.outcome === "scheduled";
  const due = Math.floor(new Date(item.at).getTime() / MS);
  const period = PERIOD_SECONDS[item.reasonParams?.every ?? "day"] ?? PERIOD_SECONDS.day!;
  const title = copy.title(item);
  const under = copy.counterpart(item);
  const amount = copy.amountOf(item);
  const other = copy.otherLeg(item);
  const when = watching ? copy.until(item.at) : copy.time(item.at);
  const underTone = item.outcome === "failed" ? color.destructive : item.outcome === "waiting" ? color.warn : color.text3;
  const amountTone = amount?.tone === "up" ? color.up : amount?.tone === "ink" ? color.ink : color.text3;
  const struck = item.outcome === "failed" || item.outcome === "skipped";
  const figure = amount ? `${amount.sign}${amount.text}` : "";
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        onPress(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={[title, under, figure, other ?? when].filter(Boolean).join(". ")}
      accessibilityState={selected ? { selected: true } : undefined}
      style={({ pressed }) => [styles.row, plated ? styles.rowPlated : null, pressed || selected ? { backgroundColor: color.rowPressed } : null]}
    >
      <FeedMark item={item} ring={plated ? (selected ? color.rowPressed : color.card) : color.ground} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
          {title}
        </Text>
        {under ? (
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: underTone }]}>
            {under}
          </Text>
        ) : null}
      </View>
      <View style={styles.end}>
        {figure ? (
          <Text numberOfLines={1} style={[TYPE.rowAmount, { color: amountTone }, struck ? styles.struck : null]}>
            {figure}
          </Text>
        ) : null}
        <View style={styles.endLine}>
          {watching ? <CountdownRing fromSec={due - period} toSec={due} size={RING} stroke={RING_STROKE} /> : null}
          <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
            {other ?? when}
          </Text>
        </View>
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
  keep,
  selectedId,
}: {
  feed: AgentFeed | undefined;
  /** The row shown beside the list (Activity's receipt panel). */
  selectedId?: string | undefined;
  filter: FeedFilter;
  /** A finer cut than the group (Activity's In · Out · Trades). */
  keep?: ((item: AgentFeedItem) => boolean) | undefined;
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
  const rows = rowsFor(feed, filter)
    .filter((row) => !keep || keep(row))
    .slice(0, limit);
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
            {section.rows.map((row) => {
              const order = index++;
              return (
                <Animated.View key={row.id} entering={reduced || order >= STAGGER_ROWS ? undefined : FadeInDown.delay(order * TIMING.stagger).duration(TIMING.staggerItem)}>
                  {dismissible(row) && Platform.OS !== "web" ? (
                    <SwipeAway item={row} onDismiss={() => dismiss(row)}>
                      <FeedRow item={row} onPress={onOpen} plated={plated} selected={row.id === selectedId} />
                    </SwipeAway>
                  ) : (
                    <FeedRow
                      item={row}
                      onPress={onOpen}
                      onDismiss={dismissible(row) ? () => dismiss(row) : undefined}
                      plated={plated}
                      selected={row.id === selectedId}
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
  section: { gap: SPACE.xxs },
  head: { paddingHorizontal: SPACE.xs, paddingBottom: SPACE.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.sm + SPACE.xxs, paddingHorizontal: SPACE.xs, borderRadius: SPACE.md },
  face: { width: FACE, height: FACE },
  swapBack: { position: "absolute", top: 0, start: 0 },
  swapFront: { position: "absolute", bottom: 0, end: 0, borderRadius: FACE, borderWidth: SWAP_RING },
  badge: { position: "absolute", end: -BADGE_OFFSET, bottom: -BADGE_OFFSET, width: BADGE, height: BADGE, borderRadius: BADGE, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  glyph: { width: FACE, height: FACE, borderRadius: FACE / HALF, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: SPACE.xxs },
  end: { alignItems: "flex-end", gap: SPACE.xxs, flexShrink: 0, maxWidth: "45%" },
  endLine: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  struck: { textDecorationLine: "line-through" },
});
