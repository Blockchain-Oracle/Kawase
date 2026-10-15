// The ONE RouteList (plan decision 6): every "which venue?" choice — swap, bridge/move, yield, buy — as Wise-style
// ranked rows: the venue's real logo, its name, what you receive, how much less than the best, and when it arrives;
// fee and details behind one chevron; tap a row to pick it; "Best" is the preselected top row. During a race the rows
// shimmer while a venue is pricing, light up as its quote lands and re-rank with a spring (Reanimated
// LinearTransition, the native twin of 21st 29368 "streaming data rows"); the selectable rows are 21st 28337 radio
// cards and the "Best" mark is 21st 6955's badge tag. Routes Kawase cannot run are never offered: they are listed once,
// below, with why. Native and web (react-native-web) from this one file; token names only, so the Look lane's values
// apply as they land.
import type { RouteFact, RouteQuote, RouteRace } from "@kawase/api-client";
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
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

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
/** The landing wash (21st 29368 `highlightDuration`): starts at this opacity and fades out over WASH_MS. */
const WASH_FROM = 0.85;
const WASH_MS = 1_400;
/** The wash never takes a tap (style, not the deprecated prop, so react-native-web stays quiet). */
const NO_TOUCH = { pointerEvents: "none" } as const;

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

/**
 * Below this list width the venue's name would lose to the figure ("Re…" for Relay in the quote plate on a 375 pt
 * phone): name about 100 pt ("Circle CCTP"), figure about 130 ("0.05295 USDC less"), plus mark, radio, gaps, padding.
 */
const COMPACT_BELOW_PX = 356;

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
  const [width, setWidth] = React.useState(0);
  const compact = width > 0 && width < COMPACT_BELOW_PX;

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
    <View className={cn("gap-3", className)} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
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
                showYearly={Boolean(race.ask)}
                compact={compact}
                onPress={() => pick(row.venue)}
                onToggle={() => setOpenVenue((current) => (current === row.venue ? null : row.venue))}
              />
            </Animated.View>
          ))}
        </View>
      )}
      {others.length > 0 ? (
        <Animated.View layout={layout} className="bg-card rounded-2xl px-4 py-3">
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: othersOpen }} onPress={() => setOthersOpen((open) => !open)} className="flex-row items-center gap-2">
            <View className="flex-row">
              {others.slice(0, OTHER_MARKS).map((row, index) => (
                <View key={row.venue} className={cn("rounded-full", index > 0 && "-ms-1.5")} style={{ opacity: OTHER_OPACITY }}>
                  <Mark entity={row.mark} size={SMALL_MARK} />
                </View>
              ))}
            </View>
            <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{others.some((row) => row.status === "quoted") ? t("routes.alsoCheckedTitle") : t("routes.notQuoted")}</Text>
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
  /** Yield: the race was asked for an amount, so each row's year of earnings is worth saying. */
  showYearly: boolean;
  /** A narrow list (the quote plate on a small phone, a card in chat): the figure moves under the name. */
  compact: boolean;
  onPress: () => void;
  onToggle: () => void;
};

/** One venue: a radio card (21st 28337) that shimmers while pricing and lights up when its quote lands. */
function RouteRow({ row, best, isBest, selected, open, readOnly, locale, showYearly, compact, onPress, onToggle }: RowProps) {
  const { t } = useT();
  const reduced = useReducedMotionLive();
  const quoted = row.status === "quoted";
  const lit = useSharedValue(quoted ? 1 : DIM);
  // 21st 29368's change pulse: when a quote lands, one accent wash that only fades out (it never blinks).
  const wash = useSharedValue(0);
  const wasQuoted = React.useRef(quoted);
  React.useEffect(() => {
    lit.value = withTiming(quoted ? 1 : DIM, { duration: reduced ? REDUCED_MS : MOTION.sheetMs });
    if (quoted && !wasQuoted.current && !reduced) {
      wash.value = withSequence(withTiming(WASH_FROM, { duration: 0 }), withTiming(0, { duration: WASH_MS, easing: Easing.out(Easing.quad) }));
    }
    wasQuoted.current = quoted;
  }, [quoted, reduced, lit, wash]);
  const markStyle = useAnimatedStyle(() => ({ opacity: lit.value }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

  const delta = deltaToBest(row, best);
  const eta = etaWords(row.etaSeconds);
  const receive = row.receive ? formatAmount(row.receive, locale) : null;
  const yieldRow = row.apyBps !== undefined && row.apyBps !== null;
  const risk = row.facts?.find((fact): fact is RiskFact => fact.kind === "risk")?.value ?? null;
  const label = quoted && receive ? t("routes.pickA11y", { name: row.label, amount: receive }) : t("routes.checkingA11y", { name: row.label });

  const name = (
    <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
      {row.label}
    </Text>
  );
  const meta = quoted ? (
    // The name keeps the whole first line; "Best" leads the second, then the risk (yield), the ETA.
    <View className={cn("flex-row items-center gap-1.5", compact && "min-w-0 shrink")}>
      {isBest ? <BestBadge /> : null}
      {risk ? <RiskChip risk={risk} /> : null}
      <Text numberOfLines={1} className={cn("text-muted-foreground shrink text-xs", TEXT_START)}>
        {yieldRow ? (receive && showYearly ? t("routes.perYear", { rate: receive }) : null) : eta ? t(`routes.${eta.key}`, { count: eta.count }) : null}
      </Text>
    </View>
  ) : (
    <Skeleton className="h-3 w-16 rounded-full" />
  );
  const figure = (
    <View className="items-end gap-1">
      {quoted && yieldRow ? (
        // Yield: the rate is the figure; what a year brings on the amount sits on the second line.
        <Animated.View key={row.apyBps} entering={FadeIn.duration(reduced ? REDUCED_MS : MOTION.sheetMs)} className="items-end">
          <Amount className="font-display text-foreground text-lg font-bold">{`${(row.apyBps! / BPS_PER_PERCENT).toFixed(PERCENT_DIGITS)}%`}</Amount>
          <Text className="text-muted-foreground text-xs">{t("routes.apy")}</Text>
        </Animated.View>
      ) : quoted && receive ? (
        <Animated.View key={row.receive?.amount} entering={FadeIn.duration(reduced ? REDUCED_MS : MOTION.sheetMs)} className="items-end">
          <Amount className="text-foreground text-base font-semibold">{receive}</Amount>
          <Text className="text-muted-foreground text-xs">{delta ? t("routes.deltaToBest", { amount: formatAmount(delta, locale) }) : t("routes.youReceive")}</Text>
        </Animated.View>
      ) : (
        <View className="items-end gap-1.5">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-3 w-14 rounded-full" />
        </View>
      )}
    </View>
  );

  return (
    <View className={cn("overflow-hidden rounded-2xl", selected ? "bg-selected-row" : "bg-card")}>
      <Animated.View className="bg-accent/15 absolute inset-0" style={[washStyle, NO_TOUCH]} />
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
        {compact ? (
          // Narrow: the name has the whole first line; the figure ends the second, after "Best" and the ETA.
          <View className="min-w-0 flex-1 gap-1">
            {name}
            <View className="flex-row items-end justify-between gap-2">
              {meta}
              {figure}
            </View>
          </View>
        ) : (
          <>
            <View className="min-w-0 flex-1 gap-1">
              {name}
              {meta}
            </View>
            {figure}
          </>
        )}
        {!readOnly ? <Radio on={selected} /> : null}
      </Pressable>
      {quoted ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} className="flex-row items-center gap-2 px-4 pt-0 pb-2.5">
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
  const label = t("routes.best");
  return (
    <View className="bg-accent rounded-full px-2 py-0.5">
      {/* Joined and uncased scripts are never letter-spaced (packages/i18n/src/scripts.ts). */}
      <Text className="text-accent-foreground text-xs font-bold">{label}</Text>
    </View>
  );
}

export type RiskFact = Extract<RouteFact, { kind: "risk" }>;

/** The yield source's risk, a word on a quiet plate (never colour alone): blue chip on the up wash, advanced on warn. */
const RISK_TONE: Record<RiskFact["value"], { plate: string; ink: string }> = {
  blue_chip: { plate: "bg-up-surface", ink: "text-up" },
  curated: { plate: "bg-secondary", ink: "text-foreground" },
  rwa_credit: { plate: "bg-secondary", ink: "text-foreground" },
  advanced: { plate: "bg-warn-surface", ink: "text-warn" },
};

export function RiskChip({ risk }: { risk: RiskFact["value"] }) {
  const { t } = useT();
  return (
    <View className={cn("rounded-full px-2 py-0.5", RISK_TONE[risk].plate)}>
      <Text className={cn("text-xs font-semibold", RISK_TONE[risk].ink)}>{t(`routes.risk_${risk}`)}</Text>
    </View>
  );
}

/** 21st 28337's radio: ring, filled dot when picked (the accent: a selected control). */
function Radio({ on }: { on: boolean }) {
  return (
    <View className={cn("size-5 items-center justify-center rounded-full border-2", on ? "border-accent bg-accent" : "border-text-3")}>
      {on ? <View className="bg-accent-foreground size-2 rounded-full" /> : null}
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
        <View key={index} className="bg-card flex-row items-center gap-3 rounded-2xl px-4 py-3">
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
    <View className="bg-card items-center gap-2 rounded-2xl px-6 py-6">
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
    <View className={cn("bg-card items-center gap-2 rounded-2xl px-6 py-6", className)} accessibilityRole="alert">
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
