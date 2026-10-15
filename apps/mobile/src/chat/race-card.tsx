// The route race, live (D7/D37 "watch it work"): race_routes asks every venue at once and yields a snapshot each time
// one answers; this card draws every snapshot as it arrives. Each venue is a row with its real mark (packages/identity):
// dim and shimmering while it is being asked, lit with a brief wash when its quote lands (the amount counts up), muted
// with the reason when it cannot. "Best" moves to the leader as quotes land. The winner is only a suggestion: the
// propose step quotes it again before anything moves, and the card never offers a confirm of its own.
//
// Built from 21st parts, since research found no single 21st race component (plan, premium bar §1):
//   - 29368 Streaming Data Rows (rmahammad): rows that update in place, the changed cell's one-shot wash, numbers
//     morphing to their new value, status shown by a word and a shape, never by colour alone;
//   - 6955 Badge Tag (prebuiltui): the "Best" pill;
//   - 12336 Text Shimmer (serafimcloud): the "Asking every venue" status (text-shimmer.tsx).
// The rows are their own component (`RaceRows`, taking a RouteRace) so the Routes lane's RouteList can replace them.
import { Route as RouteIcon, RotateCcw } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import type { RaceRoutesOutput, RouteQuote, RouteRace, AgentRaceRequest } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { NumberTicker } from "@kawase/ui-native/components/number-ticker";
import { Badge } from "@kawase/ui-native/components/ui/badge";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { tapFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { AgentCard } from "./card";
import { useChatResume } from "./resume";
import { TextShimmer } from "./text-shimmer";

const MARK_SIZE = 32;
/** How dim a venue's mark is while it is asked, and once it could not quote. */
const ASKING_OPACITY = 0.4;
const FAILED_OPACITY = 0.3;
/** The changed row's wash (21st 29368's default highlight, 1.4 s), monotonic so it never blinks. */
const WASH_MS = 1_400;
const SHEEN_MS = 1_200;
const SKELETON_ROWS = 3;
const AMOUNT_DIGITS = 6;
const SECONDS_PER_MINUTE = 60;
const BPS_PER_UNIT = 10_000;
const DECIMAL_BASE = 10n;
const HALF = 2;

/** Base units → a plain decimal string ("1712500", 6 → "1.7125"). */
function toDecimal(amount: string, decimals: number): string {
  if (!/^\d+$/.test(amount)) return amount;
  const value = BigInt(amount);
  const unit = DECIMAL_BASE ** BigInt(decimals);
  const fraction = (value % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / unit}.${fraction}` : (value / unit).toString();
}

function useRaceFormat() {
  const { t } = useT();
  const { locale } = useLocale();
  return {
    amount: (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: AMOUNT_DIGITS }).format(value),
    fee: (usd: number) =>
      t("feed.raceFee", {
        fee: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
          usd,
        ),
      }),
    eta: (seconds: number) =>
      seconds < SECONDS_PER_MINUTE
        ? t("feed.raceSeconds", { value: Math.round(seconds) })
        : t("feed.raceMinutes", { value: Math.round(seconds / SECONDS_PER_MINUTE) }),
    rate: (bps: number) =>
      t("feed.raceRate", {
        rate: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / BPS_PER_UNIT),
      }),
    reason: (reason: string | null) => {
      switch (reason) {
        case "timeout":
          return t("feed.reasonTimeout");
        case "no_route":
          return t("feed.reasonNoRoute");
        case "not_on_network":
          return t("feed.reasonNotOnNetwork");
        case "amount_too_low":
          return t("feed.reasonAmountTooLow");
        case "rate_limited":
          return t("routes.reason_rate_limited");
        default:
          return t("feed.reasonUnavailable");
      }
    },
  };
}

/** The greyed breadcrumbs of venues that did not quote. */
const NOT_QUOTED_MARK = 18;
const NOT_QUOTED_OPACITY = 0.75;
const EYEBROW: Record<AgentRaceRequest["kind"], string> = {
  swap: "feed.raceSwap",
  bridge: "feed.raceBridge",
  yield: "feed.raceYield",
};

/** A soft bar sweeping across where the amount will land (the row is still being asked). */
function CheckingBar() {
  const reduced = useReducedMotionLive();
  const sweep = useSharedValue(0);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (reduced) return undefined;
    sweep.value = withRepeat(withTiming(1, { duration: SHEEN_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: (sweep.value * HALF - 1) * width }] }));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className="bg-secondary h-4 w-20 overflow-hidden rounded-full"
    >
      {reduced ? null : <Animated.View style={sheen} className="bg-foreground/10 h-full w-1/2 rounded-full" />}
    </View>
  );
}

/** The venue's mark: dim while asked (breathing), lit once quoted, faded when it could not quote. */
function VenueMark({ quote }: { quote: RouteQuote }) {
  const reduced = useReducedMotionLive();
  const opacity = useSharedValue(
    quote.status === "quoted" ? 1 : quote.status === "checking" ? ASKING_OPACITY : FAILED_OPACITY,
  );
  React.useEffect(() => {
    cancelAnimation(opacity);
    if (quote.status === "checking" && !reduced) {
      opacity.value = withRepeat(
        withTiming(ASKING_OPACITY + (1 - ASKING_OPACITY) / HALF, { duration: MOTION.sendingCycleMs / HALF }),
        -1,
        true,
      );
      return () => cancelAnimation(opacity);
    }
    const target = quote.status === "quoted" ? 1 : quote.status === "checking" ? ASKING_OPACITY : FAILED_OPACITY;
    opacity.value = reduced ? target : withTiming(target, { duration: MOTION.sheetMs });
    return undefined;
  }, [quote.status, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={style}>
      <Mark entity={quote.mark} size={MARK_SIZE} />
    </Animated.View>
  );
}

/** The one-shot wash when a row's quote lands. */
function Wash({ on }: { on: boolean }) {
  const reduced = useReducedMotionLive();
  const opacity = useSharedValue(0);
  React.useEffect(() => {
    if (!on || reduced) return;
    opacity.value = 1;
    opacity.value = withTiming(0, { duration: WASH_MS, easing: Easing.out(Easing.quad) });
  }, [on, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={style} className="bg-primary/10 absolute inset-0 rounded-2xl" />;
}

/** What lands in the row: the amount counting up from zero, the rate for a yield. */
function Arrival({ quote, kind, live }: { quote: RouteQuote; kind: RouteRace["kind"]; live: boolean }) {
  const format = useRaceFormat();
  const target = quote.receive ? Number(toDecimal(quote.receive.amount, quote.receive.decimals)) : 0;
  // Counts up only when it lands while the person watches; a reopened thread shows the figure.
  const [value, setValue] = React.useState(live ? 0 : target);
  React.useEffect(() => setValue(target), [target]);
  if (kind === "yield" && typeof quote.apyBps === "number")
    return <Text className="text-foreground text-base font-semibold">{format.rate(quote.apyBps)}</Text>;
  if (!quote.receive) return null;
  return (
    <View className="shrink-0 flex-row items-baseline gap-1">
      <NumberTicker value={value} format={format.amount} className="text-foreground text-base font-semibold" />
      <Text className="text-muted-foreground text-sm">{quote.receive.symbol}</Text>
    </View>
  );
}

function RaceRow({
  quote,
  kind,
  best,
  live,
}: {
  quote: RouteQuote;
  kind: RouteRace["kind"];
  best: boolean;
  live: boolean;
}) {
  const { t } = useT();
  const format = useRaceFormat();
  const reduced = useReducedMotionLive();
  // The wash only for a quote that lands while the person watches, not for a thread reopened later.
  const [landed, setLanded] = React.useState(false);
  const was = React.useRef(quote.status);
  React.useEffect(() => {
    if (was.current === "checking" && quote.status === "quoted" && live) setLanded(true);
    was.current = quote.status;
  }, [quote.status, live]);
  const facts = [
    quote.feeUsd !== null ? format.fee(quote.feeUsd) : null,
    quote.etaSeconds !== null ? format.eta(quote.etaSeconds) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)}
      className={cn("relative flex-row items-center gap-3 rounded-2xl px-2 py-2", best && "bg-secondary")}
    >
      <Wash on={landed} />
      <VenueMark quote={quote} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className={cn(
            "text-base font-semibold",
            quote.status === "quoted" ? "text-foreground" : "text-muted-foreground",
            TEXT_START,
          )}
        >
          {quote.label}
        </Text>
        {/* "Best" leads the second line (the name keeps the first whole on a phone, never under the amount). */}
        {best || (quote.status === "quoted" && facts) ? (
          <View className="flex-row items-center gap-2">
            {best ? (
              <Animated.View
                key={`best-${quote.venue}`}
                entering={reduced ? undefined : ZoomIn.duration(MOTION.sheetMs)}
                exiting={reduced ? undefined : FadeOut.duration(MOTION.pressMs)}
              >
                <Badge>
                  <Text>{t("feed.raceBest")}</Text>
                </Badge>
              </Animated.View>
            ) : null}
            {quote.status === "quoted" && facts ? (
              <Text numberOfLines={1} className={cn("text-muted-foreground shrink text-xs", TEXT_START)}>
                {facts}
              </Text>
            ) : null}
          </View>
        ) : null}
        {quote.status === "failed" || quote.status === "unavailable" ? (
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{format.reason(quote.reason)}</Text>
        ) : null}
      </View>
      {quote.status === "checking" ? (
        <CheckingBar />
      ) : quote.status === "quoted" ? (
        <Arrival quote={quote} kind={kind} live={live} />
      ) : null}
    </Animated.View>
  );
}

/** One row per venue, in the order they were asked (rows never jump); "Best" moves to the leader. */
export function RaceRows({ race, live }: { race: RouteRace; live: boolean }) {
  const quoted = race.rows.filter((row) => row.status === "quoted").length;
  // A tick per quote that lands while the person watches (haptics only for ticks).
  const seen = React.useRef(quoted);
  React.useEffect(() => {
    if (live && quoted > seen.current) tapFeedback("selection");
    seen.current = quoted;
  }, [quoted, live]);
  // Venues that answered (or are still being asked) keep their rows; the ones that could not quote fold into one line
  // of greyed breadcrumbs under a single reason, so five "Not on this network" rows never bury the answer.
  const shown = race.rows.filter((row) => row.status === "quoted" || row.status === "checking");
  const out = race.rows.filter((row) => row.status === "failed" || row.status === "unavailable");
  const reasons = [...new Set(out.map((row) => row.reason))];
  return (
    <View className="gap-1" accessibilityRole="list">
      {shown.map((quote) => (
        <RaceRow key={quote.venue} quote={quote} kind={race.kind} best={race.best === quote.venue} live={live} />
      ))}
      {out.length > 0 ? <NotQuoted rows={out} reason={reasons.length === 1 ? (reasons[0] ?? null) : null} /> : null}
    </View>
  );
}

/** The venues that did not quote, as breadcrumbs: each one's mark and name, greyed, with one shared reason. */
function NotQuoted({ rows, reason }: { rows: readonly RouteQuote[]; reason: string | null }) {
  const { t } = useT();
  const format = useRaceFormat();
  return (
    <View className="gap-2 px-2 pt-2" accessible accessibilityLabel={`${reason ? format.reason(reason) : t("routes.notQuoted")}: ${rows.map((row) => row.label).join(", ")}`}>
      <Text className={cn("text-muted-foreground text-xs font-medium", TEXT_START)}>{reason ? format.reason(reason) : t("routes.notQuoted")}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {rows.map((row) => (
          <View key={row.venue} className="bg-secondary flex-row items-center gap-1.5 rounded-full py-1 ps-1 pe-2.5" style={{ opacity: NOT_QUOTED_OPACITY }}>
            <Mark entity={row.mark} size={NOT_QUOTED_MARK} />
            <Text className="text-muted-foreground text-xs">{row.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Before the first snapshot: the card's own shape, venues not known yet. */
function RaceSkeleton({ kind }: { kind: AgentRaceRequest["kind"] | undefined }) {
  const { t } = useT();
  return (
    <AgentCard eyebrow={t(EYEBROW[kind ?? "swap"])}>
      <TextShimmer className="text-muted-foreground text-sm">{t("feed.raceAsking")}</TextShimmer>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3 px-2 py-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </View>
      ))}
    </AgentCard>
  );
}

/**
 * The race card for one race_routes part: `output` is its latest snapshot (null before the first), `live` while the
 * snapshots are still preliminary. Never a confirm: the propose step that follows carries it.
 */
export function RaceCard({
  output,
  live,
  kind,
}: {
  output: RaceRoutesOutput | null;
  live: boolean;
  kind?: AgentRaceRequest["kind"] | undefined;
}) {
  const { t } = useT();
  const resume = useChatResume();
  if (!output) return <RaceSkeleton kind={kind} />;
  if (output.status === "routes_unavailable") {
    // Not raced (no race here, or not this request): the propose step quotes on its own, so this is only a quiet note
    // on the way. A token that was not found is a quiet note too: the agent asks which one was meant.
    if (output.reason === "not_bound" || output.reason === "direct" || output.reason === "unknown_token")
      return (
        <View className="bg-card border-border flex-row items-center gap-2 self-start rounded-full border py-2 pe-4 ps-3">
          <Icon as={RouteIcon} className="text-muted-foreground size-4" />
          <Text className="text-muted-foreground text-sm">
            {t(output.reason === "unknown_token" ? "feed.raceUnknownToken" : "feed.raceDirect")}
          </Text>
        </View>
      );
    return (
      <AgentCard eyebrow={t(EYEBROW[output.request.kind])}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("feed.raceNoAnswer")}</Text>
        {resume ? (
          <Button variant="secondary" onPress={() => resume(t("feed.raceTryAgainPrompt"))}>
            <Icon as={RotateCcw} className="size-4" />
            <Text>{t("feed.raceTryAgain")}</Text>
          </Button>
        ) : null}
      </AgentCard>
    );
  }
  const { race } = output;
  const total = race.rows.length;
  const answered = race.rows.filter((row) => row.status !== "checking").length;
  const racing = output.status === "racing";
  const best = race.rows.find((row) => row.venue === race.best);
  return (
    <AgentCard eyebrow={t(EYEBROW[output.request.kind])}>
      <View className="flex-row items-center justify-between gap-3">
        {racing ? (
          <TextShimmer active={live} className="text-muted-foreground text-sm">
            {t("feed.raceAsking")}
          </TextShimmer>
        ) : (
          <Text className="text-muted-foreground text-sm">{t("feed.raceCompared", { total })}</Text>
        )}
        {racing ? (
          <Text className="text-muted-foreground text-sm tabular-nums">
            {t("feed.raceAnswered", { answered, total })}
          </Text>
        ) : null}
      </View>
      <RaceRows race={race} live={live} />
      {racing ? null : (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {best ? t("feed.racePick", { venue: best.label }) : t("feed.raceNone")}
        </Text>
      )}
    </AgentCard>
  );
}
