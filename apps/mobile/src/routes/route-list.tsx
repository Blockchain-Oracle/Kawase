// The ONE RouteList (plan decision 6): every "which venue?" choice — swap, bridge/move, yield, buy — as Wise-style
// ranked rows: the venue's real logo, its name, what you receive, how much less than the best, and when it arrives;
// fee and details behind one chevron; tap a row to pick it; "Best" is the preselected top row. During a race the rows
// shimmer while a venue is pricing, light up as its quote lands and re-rank with a spring (Reanimated
// LinearTransition, the native twin of 21st 29368 "streaming data rows"); the selectable rows are 21st 28337 radio
// cards and the "Best" mark is 21st 6955's badge tag. Routes Kawase cannot run are never offered: they are listed once,
// below, with why. Native and web (react-native-web) from this one file; token names only, so the Look lane's values
// apply as they land.
import type { RouteQuote, RouteRace } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { ChevronDown, CloudOff, RotateCw, SearchX } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { tapFeedback } from "@/feedback/feedback";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

import { deltaToBest, etaWords, formatAmount, formatTokens, formatUsd, splitRows, toUnits } from "./route-format";

const MARK_SIZE = 36;
const SMALL_MARK = 20;
/** Waiting text (premium bar §2): a verb, elapsed seconds after 3 s, "Still waiting · Retry" at about 15 s. */
const ELAPSED_AFTER_S = 3;
const STILL_WAITING_S = 15;
/** A skeleton is held at least this long so it never flashes (Mitoshi useHeldLoading). */
const HOLD_LOADING_MS = 300;
const TICK_MS = 1_000;
const DIM = 0.38;
const SKELETON_ROWS = 3;
const BPS_PER_PERCENT = 100;
const PERCENT_DIGITS = 2;
const SPRING = { damping: 20, stiffness: 220 } as const;
const REDUCED_MS = 100;
const ROTATE_OPEN = 180;
/** Marks shown overlapped on the collapsed "didn't quote" line. */
const OTHER_MARKS = 5;
/** Those marks sit halfway between dimmed and lit. */
const OTHER_OPACITY = 0.69;

export type RouteListState = "live" | "error" | "offline";

export type RouteListProps = {
  /** The race as it stands (null before the first snapshot: the skeleton). */
  race: RouteRace | null;
  /** "error": nothing could be priced; "offline": the rows shown are the last ones fetched, marked stale. */
  state?: RouteListState;
  /** The picked venue; defaults to the race's best, and follows it until the person picks. */
  selected?: string | null;
  onSelect?: (venue: string) => void;
  /** Ask every venue again (error, empty, "Still waiting"). */
  onRetry?: () => void;
  /** Read-only (a receipt, the feed): no picking, no radio. */
  readOnly?: boolean;
  className?: string;
};

/** Holds `busy` true for at least HOLD_LOADING_MS once it has been true. */
function useHeld(busy: boolean) {
  const [held, setHeld] = React.useState(busy);
  const since = React.useRef<number | null>(busy ? Date.now() : null);
  React.useEffect(() => {
    if (busy) {
      since.current = Date.now();
      setHeld(true);
      return;
    }
    const left = since.current === null ? 0 : HOLD_LOADING_MS - (Date.now() - since.current);
    if (left <= 0) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(false), left);
    return () => clearTimeout(timer);
  }, [busy]);
  return held;
}

/** Seconds since the race started, ticking while it runs. */
function useElapsed(race: RouteRace | null) {
  const [now, setNow] = React.useState(() => Date.now());
  const running = Boolean(race && !race.done);
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);
  const started = race?.startedAt ? Date.parse(race.startedAt) : null;
  return started === null ? 0 : Math.max(0, Math.floor((now - started) / TICK_MS));
}

function useLayout() {
  const reduced = useReducedMotionLive();
  return reduced ? LinearTransition.duration(REDUCED_MS) : LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness);
}

export function RouteList({ race, state = "live", selected, onSelect, onRetry, readOnly = false, className }: RouteListProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const held = useHeld(race === null && state !== "error");
  const elapsed = useElapsed(race);
  const layout = useLayout();
  const [picked, setPicked] = React.useState<string | null>(null);
  const [openVenue, setOpenVenue] = React.useState<string | null>(null);
  const [othersOpen, setOthersOpen] = React.useState(false);

  if (state === "error" && !race) return <RouteListError onRetry={onRetry} className={className} />;
  if (held || !race) return <RouteListSkeleton className={className} />;

  const { choices, others } = splitRows(race.rows);
  const best = race.rows.find((row) => row.venue === race.best);
  const chosen = selected ?? picked ?? race.best;
  const answered = race.rows.filter((row) => row.status !== "checking").length;
  const empty = race.done && choices.length === 0;
  const pick = (venue: string) => {
    if (readOnly) return;
    tapFeedback("selection");
    setPicked(venue);
    onSelect?.(venue);
  };

  return (
    <View className={cn("gap-3", className)}>
      <RaceHeader race={race} state={state} answered={answered} elapsed={elapsed} onRetry={onRetry} />
      {empty ? (
        <RouteListEmpty onRetry={onRetry} />
      ) : (
        <View accessibilityRole="radiogroup" className="gap-2">
          {choices.map((row) => (
            <Animated.View key={row.venue} layout={layout} entering={FadeIn.duration(MOTION.pressMs)} exiting={FadeOut.duration(MOTION.pressMs)}>
              <RouteRow
                row={row}
                best={best}
                isBest={row.venue === race.best}
                selected={row.venue === chosen && row.status === "quoted"}
                open={openVenue === row.venue}
                readOnly={readOnly}
                locale={locale}
                onPress={() => pick(row.venue)}
                onToggle={() => setOpenVenue((current) => (current === row.venue ? null : row.venue))}
              />
            </Animated.View>
          ))}
        </View>
      )}
      {others.length > 0 ? (
        <Animated.View layout={layout} className="border-border bg-card rounded-2xl border px-4 py-3">
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: othersOpen }} onPress={() => setOthersOpen((open) => !open)} className="flex-row items-center gap-2">
            <View className="flex-row">
              {others.slice(0, OTHER_MARKS).map((row, index) => (
                <View key={row.venue} className={cn("rounded-full", index > 0 && "-ms-1.5")} style={{ opacity: OTHER_OPACITY }}>
                  <Mark entity={row.mark} size={SMALL_MARK} />
                </View>
              ))}
            </View>
            <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("routes.notQuoted")}</Text>
            <Chevron open={othersOpen} />
          </Pressable>
          {othersOpen ? (
            <Animated.View entering={FadeIn.duration(MOTION.pressMs)} className="mt-2 gap-2">
              {others.map((row) => (
                <View key={row.venue} className="flex-row items-center gap-2">
                  <Mark entity={row.mark} size={SMALL_MARK} />
                  <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{row.label}</Text>
                  <Text className="text-muted-foreground text-xs">{row.status === "quoted" ? t("routes.alsoChecked") : t(`routes.reason_${reasonKey(row.reason)}`)}</Text>
                </View>
              ))}
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const KNOWN_REASONS = new Set(["timeout", "no_route", "not_on_network", "needs_key", "amount_too_low", "rate_limited", "failed", "not_enabled", "low_liquidity", "small_for_amount", "advanced"]);
const reasonKey = (reason: string | null) => (reason && KNOWN_REASONS.has(reason) ? reason : "failed");

function RaceHeader({ race, state, answered, elapsed, onRetry }: { race: RouteRace; state: RouteListState; answered: number; elapsed: number; onRetry?: (() => void) | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const total = race.rows.length;
  let status: React.ReactNode;
  if (state === "offline") {
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(race.quotedAt));
    status = (
      <View className="flex-row items-center gap-1.5">
        <Icon as={CloudOff} className="text-muted-foreground size-3.5" />
        <Text className="text-muted-foreground text-xs">{t("routes.offline", { time })}</Text>
      </View>
    );
  } else if (!race.done && elapsed >= STILL_WAITING_S) {
    status = (
      <Pressable accessibilityRole="button" onPress={onRetry} disabled={!onRetry} className="flex-row items-center gap-1.5">
        <Text className="text-muted-foreground text-xs">{t("routes.stillWaiting")}</Text>
        {onRetry ? <Text className="text-foreground text-xs font-semibold">· {t("routes.retry")}</Text> : null}
      </Pressable>
    );
  } else if (!race.done) {
    status = <Text className="text-muted-foreground text-xs">{elapsed >= ELAPSED_AFTER_S ? t("routes.pricingElapsed", { seconds: elapsed }) : t("routes.pricing")}</Text>;
  } else {
    status = <Text className="text-muted-foreground text-xs">{t("routes.answered", { done: answered, total })}</Text>;
  }
  return (
    <View className="flex-row items-center justify-between gap-3 px-1" accessibilityLiveRegion="polite">
      <Text className={cn("text-foreground font-display text-base font-semibold", TEXT_START)}>{t("routes.title")}</Text>
      {status}
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotionLive();
  const turn = useSharedValue(open ? ROTATE_OPEN : 0);
  React.useEffect(() => {
    turn.value = withTiming(open ? ROTATE_OPEN : 0, { duration: reduced ? REDUCED_MS : MOTION.pressMs });
  }, [open, reduced, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon as={ChevronDown} className="text-muted-foreground size-4" />
    </Animated.View>
  );
}

type RowProps = {
  row: RouteQuote;
  best: RouteQuote | undefined;
  isBest: boolean;
  selected: boolean;
  open: boolean;
  readOnly: boolean;
  locale: string;
  onPress: () => void;
  onToggle: () => void;
};

/** One venue: a radio card (21st 28337) that shimmers while pricing and lights up when its quote lands. */
function RouteRow({ row, best, isBest, selected, open, readOnly, locale, onPress, onToggle }: RowProps) {
  const { t } = useT();
  const reduced = useReducedMotionLive();
  const quoted = row.status === "quoted";
  const lit = useSharedValue(quoted ? 1 : DIM);
  React.useEffect(() => {
    lit.value = withTiming(quoted ? 1 : DIM, { duration: reduced ? REDUCED_MS : MOTION.sheetMs });
  }, [quoted, reduced, lit]);
  const markStyle = useAnimatedStyle(() => ({ opacity: lit.value }));

  const delta = deltaToBest(row, best);
  const eta = etaWords(row.etaSeconds);
  const receive = row.receive ? formatAmount(row.receive, locale) : null;
  const yieldRow = row.apyBps !== undefined && row.apyBps !== null;
  const label = quoted && receive ? t("routes.pickA11y", { name: row.label, amount: receive }) : t("routes.checkingA11y", { name: row.label });

  return (
    <View className={cn("bg-card overflow-hidden rounded-2xl border", selected ? "border-primary border-2" : "border-border")}>
      <Pressable
        accessibilityRole={readOnly ? "text" : "radio"}
        accessibilityState={{ checked: selected, disabled: !quoted }}
        accessibilityLabel={label}
        disabled={!quoted || readOnly}
        onPress={onPress}
        className="flex-row items-center gap-3 px-4 py-3 active:opacity-80"
      >
        <Animated.View style={markStyle}>
          <Mark entity={row.mark} size={MARK_SIZE} />
        </Animated.View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className={cn("text-foreground shrink text-base font-semibold", TEXT_START)}>
              {row.label}
            </Text>
            {isBest && quoted ? <BestBadge /> : null}
          </View>
          {quoted ? (
            <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
              {[eta ? t(`routes.${eta.key}`, { count: eta.count }) : null, yieldRow ? t("routes.perYear", { rate: `${(row.apyBps! / BPS_PER_PERCENT).toFixed(PERCENT_DIGITS)}%` }) : null].filter(Boolean).join(" · ")}
            </Text>
          ) : (
            <Skeleton className="h-3 w-16 rounded-full" />
          )}
        </View>
        <View className="items-end gap-1">
          {quoted && receive ? (
            <Animated.View key={row.receive?.amount} entering={FadeIn.duration(reduced ? REDUCED_MS : MOTION.sheetMs)} className="items-end">
              <Amount className="text-foreground text-base font-semibold">{receive}</Amount>
              <Text className="text-muted-foreground text-xs">{delta ? t("routes.deltaToBest", { amount: formatAmount(delta, locale) }) : yieldRow ? t("routes.earnsYearly") : t("routes.youReceive")}</Text>
            </Animated.View>
          ) : (
            <View className="items-end gap-1.5">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-3 w-14 rounded-full" />
            </View>
          )}
        </View>
        {!readOnly ? <Radio on={selected} /> : null}
      </Pressable>
      {quoted ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} className="border-border flex-row items-center gap-2 border-t px-4 py-2">
          <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>{feeLine(row, locale, t)}</Text>
          <Text className="text-muted-foreground text-xs">{open ? t("routes.hideDetails") : t("routes.showDetails")}</Text>
          <Chevron open={open} />
        </Pressable>
      ) : null}
      {quoted && open ? (
        <Animated.View entering={FadeIn.duration(reduced ? REDUCED_MS : MOTION.pressMs)} className="gap-1.5 px-4 pb-3">
          {factLines(row, locale, t).map((line) => (
            <Text key={line} className={cn("text-foreground text-sm", TEXT_START)}>
              {line}
            </Text>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

type Translate = ReturnType<typeof useT>["t"];

/** The fee, in one line, under the row: dollars when known, else the venue's own rate, else none. */
function feeLine(row: RouteQuote, locale: string, t: Translate): string {
  if (row.feeUsd !== null && row.feeUsd > 0) return t("routes.feeUsd", { amount: formatUsd(row.feeUsd, locale) });
  if (row.feeBps) return t("routes.feeBps", { bps: row.feeBps });
  return t("routes.feeNone");
}

/** The disclosure: the structured facts, worded here (at most four). */
function factLines(row: RouteQuote, locale: string, t: Translate): string[] {
  const units = (amount: string) => (row.receive ? `${formatTokens(toUnits(amount, row.receive.decimals), locale)} ${row.receive.symbol}` : amount);
  const lines = (row.facts ?? []).map((fact) => {
    switch (fact.kind) {
      case "via":
        return t("routes.via", { names: fact.value });
      case "venue_fee_bps":
        return fact.value > 0 ? t("routes.feeBps", { bps: fact.value }) : t("routes.feeNone");
      case "min_receive":
        return t("routes.minReceive", { amount: units(fact.value) });
      case "trust":
        return t(`routes.trust_${fact.value}`);
      case "gas_usd":
        return t("routes.feeUsd", { amount: formatUsd(fact.value, locale) });
      case "arrives_as":
        return t("routes.arrivesAs", { symbol: fact.value });
      case "flat_fee":
        return t("routes.flatFee", { amount: units(fact.value) });
      case "tvl_usd":
        return t("routes.tvl", { amount: formatUsd(fact.value, locale) });
      case "risk":
        return t(`routes.risk_${fact.value}`);
    }
  });
  if (lines.length === 0) return row.detail;
  return [...new Set(lines)];
}

/** 21st 6955 badge tag: an inset pill on the accent. */
function BestBadge() {
  const { t } = useT();
  return (
    <View className="bg-primary rounded-full px-2 py-0.5">
      <Text className="text-primary-foreground text-[10px] font-bold uppercase tracking-wider">{t("routes.best")}</Text>
    </View>
  );
}

/** 21st 28337's radio: ring, filled dot when picked. */
function Radio({ on }: { on: boolean }) {
  return (
    <View className={cn("size-5 items-center justify-center rounded-full border-2", on ? "border-primary" : "border-border")}>
      {on ? <View className="bg-primary size-2.5 rounded-full" /> : null}
    </View>
  );
}

/** Loading: rows shaped like the real ones (never a spinner, never a fake amount). */
export function RouteListSkeleton({ className }: { className?: string | undefined }) {
  return (
    <View className={cn("gap-3", className)} accessibilityRole="progressbar">
      <View className="flex-row items-center justify-between px-1">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-3 w-16 rounded-full" />
      </View>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
          <Skeleton className="rounded-full" style={{ width: MARK_SIZE, height: MARK_SIZE }} />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-3 w-14 rounded-full" />
          </View>
          <View className="items-end gap-1.5">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-3 w-12 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Empty: says why, offers the next action. */
function RouteListEmpty({ onRetry }: { onRetry?: (() => void) | undefined }) {
  const { t } = useT();
  return (
    <View className="bg-card border-border items-center gap-2 rounded-2xl border px-6 py-6">
      <Icon as={SearchX} className="text-muted-foreground size-6" />
      <Text className="text-foreground text-base font-semibold">{t("routes.emptyTitle")}</Text>
      <Text className="text-muted-foreground text-center text-sm">{t("routes.emptyBody")}</Text>
      {onRetry ? <ActionPill label={t("routes.askAgain")} onPress={onRetry} /> : null}
    </View>
  );
}

/** Error: what still holds (nothing moved), plus one action. */
function RouteListError({ onRetry, className }: { onRetry?: (() => void) | undefined; className?: string | undefined }) {
  const { t } = useT();
  return (
    <View className={cn("bg-card border-border items-center gap-2 rounded-2xl border px-6 py-6", className)} accessibilityRole="alert">
      <Icon as={CloudOff} className="text-muted-foreground size-6" />
      <Text className="text-foreground text-base font-semibold">{t("routes.errorTitle")}</Text>
      <Text className="text-muted-foreground text-center text-sm">{t("routes.errorBody")}</Text>
      {onRetry ? <ActionPill label={t("routes.retry")} onPress={onRetry} /> : null}
    </View>
  );
}

function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="bg-secondary mt-1 flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-80">
      <Icon as={RotateCw} className="text-secondary-foreground size-3.5" />
      <Text className="text-secondary-foreground text-sm font-semibold">{label}</Text>
    </Pressable>
  );
}
