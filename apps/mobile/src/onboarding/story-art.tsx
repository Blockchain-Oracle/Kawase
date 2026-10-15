// The story's five scenes, drawn from the product's own materials (Senryo's grammar: light plates, black ink, one
// magenta for the moment that matters, real marks from @kawase/identity). Each is one event the person will see in
// the app, labelled as an example:
//   ask     a request in plain words, and the run it became (routes checked, the pick, arrived on Arc)
//   race    venues racing with their real logos; the best one lights up
//   budget  the weekly budget ring: inside it nothing asks, someone new still does
//   arc     the venues and services Kawase reaches on Arc
//   test    the testnet capsule and Circle's free test USDC
// The scene on screen plays its event once as it lands (one shared clock per scene, rows reading off it); with
// reduced motion every scene shows its finished state.
import { CircleCheck, Lock } from "lucide-react-native";
import * as React from "react";
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { arcIdentity, getEntity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import { Icon } from "@/components/kit/icons";
import {
  CONTROL_FONT_SCALE,
  ELEVATION,
  RADIUS,
  SHEET_SHAPE,
  SIZE,
  SPACE,
  TYPE,
  useTheme,
} from "@/components/kit/theme";
import { ModeCapsule } from "@/components/shell/ModeCapsule";

export const ART_MAX_WIDTH = 320;
const HALF = 2;
/** Each row of a scene's event takes this long, one after another. */
const STEP_MS = 260;
const RING = 148;
const RING_STROKE = 14;
/** This week's share on the example ring ($34 of $200). */
const RING_FILL = 0.17;
const QUARTER_TURN = -90;
const DIM = 0.32;
const RISE = 10;
const TILE = 60;
const TILE_MARK = 34;
const ARC_COLUMNS = 4;
const OVERLAP = -8;
const CHIP_FROM = 0.6;
const POP_FROM = 0.92;
const ROW_MARK = SIZE.markRow - SPACE.xs;
const CHECK = SIZE.iconSm + SPACE.xxs;
/** The ask scene: the request, then its three run rows. */
const ASK_STEPS = 4;
/** The test scene: the capsule, then the faucet. */
const TEST_STEPS = 2;
const BUDGET_EXTRA_STEPS = 2;

export type StoryArtCopy = {
  example: string;
  ask: { prompt: string; routed: string; picked: string; arrived: string; arrivedAmount: string };
  race: { best: string; rows: readonly { venue: string; amount: string }[] };
  budget: { spent: string; of: string; lines: readonly string[]; confirm: string };
  test: { capsule: string; capsuleSwitch: string; faucet: string; faucetAmount: string };
};

type SceneProps = { copy: StoryArtCopy; playing: boolean; still: boolean };

/**
 * The scene's clock: 0 → `steps` while its event plays (row n arrives between n and n + 1). Parked at the end when the
 * scene must not move, and back at 0 when it leaves, so it plays again on the next visit.
 */
function useClock(playing: boolean, still: boolean, steps: number): SharedValue<number> {
  const clock = useSharedValue(still ? steps : 0);
  React.useEffect(() => {
    if (still) clock.set(steps);
    else if (playing) clock.set(withTiming(steps, { duration: steps * STEP_MS, easing: Easing.linear }));
    else clock.set(0);
  }, [playing, still, steps, clock]);
  return clock;
}

/** Row `step`'s own 0 → 1, eased, read off the scene's clock. */
function local(clock: number, step: number): number {
  "worklet";
  const t = Math.min(1, Math.max(0, clock - step));
  return 1 - (1 - t) * (1 - t);
}

function Arrive({
  clock,
  step,
  dim = false,
  children,
  style,
}: {
  clock: SharedValue<number>;
  step: number;
  /** Already on the plate, lighting up (a row), rather than rising into place. */
  dim?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const animated = useAnimatedStyle(() => {
    const p = local(clock.get(), step);
    return dim ? { opacity: DIM + (1 - DIM) * p } : { opacity: p, transform: [{ translateY: (1 - p) * RISE }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

function Plate({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { color } = useTheme();
  return <View style={[styles.plate, { backgroundColor: color.card }, style]}>{children}</View>;
}

function ExampleTag({ label }: { label: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: color.raised2 }]}>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.meta, { color: color.text3 }]}>
        {label}
      </Text>
    </View>
  );
}

export function AskArt({ copy, playing, still }: SceneProps) {
  const { color } = useTheme();
  const clock = useClock(playing, still, ASK_STEPS);
  const testnet = arcIdentity("testnet");
  const rows = [
    { label: copy.ask.routed, trailing: <VenueStack /> },
    { label: copy.ask.picked, trailing: <Mark entity="venue:relay" size={SIZE.markInline} /> },
    {
      label: copy.ask.arrived,
      trailing: (
        <View style={styles.inline}>
          <Text style={[TYPE.rowAmount, { color: color.up }]}>{copy.ask.arrivedAmount}</Text>
          <Mark entity={testnet.usdc} size={SIZE.markInline} chainBadge={testnet.chain} />
        </View>
      ),
    },
  ];
  return (
    <View style={styles.art}>
      <Arrive clock={clock} step={0} style={styles.bubbleRow}>
        <View style={[styles.bubble, { backgroundColor: color.primary }]}>
          <Text style={[TYPE.row, { color: color.primaryForeground }]}>{copy.ask.prompt}</Text>
        </View>
      </Arrive>
      <Plate>
        {rows.map((row, at) => (
          <Arrive key={row.label} clock={clock} step={at + 1} dim style={styles.row}>
            <Icon icon={CircleCheck} size={CHECK} tint={color.ink} />
            <Text numberOfLines={1} style={[TYPE.row, styles.grow, { color: color.ink }]}>
              {row.label}
            </Text>
            {row.trailing}
          </Arrive>
        ))}
      </Plate>
      <ExampleTag label={copy.example} />
    </View>
  );
}

const ROUTE_MARKS = ["venue:cctp", "venue:across", "venue:relay", "venue:lifi", "venue:debridge"] as const;

function VenueStack() {
  return (
    <View style={styles.inline}>
      {ROUTE_MARKS.map((id, at) => (
        <View key={id} style={at === 0 ? undefined : styles.overlap}>
          <Mark entity={id} size={SIZE.markInline} />
        </View>
      ))}
    </View>
  );
}

export function RaceArt({ copy, playing, still }: SceneProps) {
  const { color } = useTheme();
  const count = copy.race.rows.length;
  const clock = useClock(playing, still, count + 1);
  const chip = useAnimatedStyle(() => {
    const p = local(clock.get(), count);
    return { opacity: p, transform: [{ scale: CHIP_FROM + (1 - CHIP_FROM) * p }] };
  });
  const pick = useAnimatedStyle(() => ({ opacity: local(clock.get(), count) }));
  return (
    <View style={styles.art}>
      <Plate style={styles.tight}>
        {copy.race.rows.map((row, at) => (
          <Arrive key={row.venue} clock={clock} step={at} dim style={styles.raceRow}>
            {at === 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.pick, { backgroundColor: color.selectedRow }, pick]}
              />
            ) : null}
            <Mark entity={row.venue} size={ROW_MARK} />
            <Text numberOfLines={1} style={[TYPE.rowStrong, styles.grow, { color: color.ink }]}>
              {getEntity(row.venue)?.name ?? row.venue}
            </Text>
            {at === 0 ? (
              <Animated.View style={[styles.best, { backgroundColor: color.accent }, chip]}>
                <Text style={[TYPE.chipLabel, { color: color.accentForeground }]}>{copy.race.best}</Text>
              </Animated.View>
            ) : null}
            <Text style={[TYPE.rowAmount, { color: color.ink }]}>{row.amount}</Text>
          </Arrive>
        ))}
      </Plate>
      <ExampleTag label={copy.example} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function BudgetArt({ copy, playing, still }: SceneProps) {
  const { color } = useTheme();
  const lines = copy.budget.lines.length;
  // The ring, each line, then the confirm line.
  const steps = lines + BUDGET_EXTRA_STEPS;
  const clock = useClock(playing, still, steps);
  const radius = (RING - RING_STROKE) / HALF;
  const circumference = HALF * Math.PI * radius;
  const stroke = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - RING_FILL * interpolate(local(clock.get(), 0), [0, 1], [0, 1])),
  }));
  return (
    <View style={styles.art}>
      <View style={styles.ringRow}>
        <View style={styles.ring}>
          <Svg width={RING} height={RING} style={styles.turn}>
            <Circle
              cx={RING / HALF}
              cy={RING / HALF}
              r={radius}
              stroke={color.rowPressed}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={RING / HALF}
              cy={RING / HALF}
              r={radius}
              stroke={color.accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={stroke}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
            <Text numberOfLines={1} style={[TYPE.numMd, { color: color.ink }]}>{copy.budget.spent}</Text>
            <Text style={[TYPE.meta, styles.centre, { color: color.text3 }]}>{copy.budget.of}</Text>
          </View>
        </View>
      </View>
      <Plate>
        {copy.budget.lines.map((line, at) => (
          <Arrive key={line} clock={clock} step={at + 1} dim style={styles.row}>
            <Icon icon={CircleCheck} size={CHECK} tint={color.ink} />
            <Text numberOfLines={1} style={[TYPE.row, styles.grow, { color: color.ink }]}>
              {line}
            </Text>
          </Arrive>
        ))}
        <Arrive clock={clock} step={lines + 1} dim style={styles.row}>
          <Icon icon={Lock} size={CHECK} tint={color.text3} />
          <Text numberOfLines={1} style={[TYPE.row, styles.grow, { color: color.text2 }]}>
            {copy.budget.confirm}
          </Text>
        </Arrive>
      </Plate>
    </View>
  );
}

/** Swap, bridge, earn and pay venues Kawase reaches, by their real marks. */
const ARC_MARKS = [
  "venue:uniswap",
  "venue:kyberswap",
  "venue:zerox",
  "venue:socket",
  "venue:cctp",
  "venue:across",
  "venue:relay",
  "venue:debridge",
  "provider:aave",
  "provider:morpho",
  "provider:merkl",
  "pay:applepay",
] as const;

export function ArcArt({ playing, still }: Pick<SceneProps, "playing" | "still">) {
  const { color } = useTheme();
  const rows = Math.ceil(ARC_MARKS.length / ARC_COLUMNS);
  const clock = useClock(playing, still, rows);
  return (
    <View style={[styles.art, styles.grid]}>
      {Array.from({ length: rows }, (_, row) => (
        <Arrive key={row} clock={clock} step={row} style={styles.gridRow}>
          {ARC_MARKS.slice(row * ARC_COLUMNS, row * ARC_COLUMNS + ARC_COLUMNS).map((id) => (
            <View
              key={id}
              accessible
              accessibilityLabel={getEntity(id)?.name ?? id}
              style={[styles.tile, { backgroundColor: color.card }]}
            >
              <Mark entity={id} size={TILE_MARK} />
            </View>
          ))}
        </Arrive>
      ))}
    </View>
  );
}

export function TestArt({ copy, playing, still }: SceneProps) {
  const { color } = useTheme();
  const clock = useClock(playing, still, TEST_STEPS);
  const testnet = arcIdentity("testnet");
  const pop = useAnimatedStyle(() => ({
    transform: [{ scale: POP_FROM + (1 - POP_FROM) * local(clock.get(), 1) }],
  }));
  return (
    <View style={styles.art}>
      <Arrive clock={clock} step={0} style={styles.capsuleRow}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ModeCapsule
            network="testnet"
            label={copy.test.capsule}
            switchLabel={copy.test.capsuleSwitch}
            onToggle={noop}
          />
        </View>
      </Arrive>
      <Arrive clock={clock} step={1}>
        <Animated.View style={pop}>
          <Plate style={styles.faucet}>
            <Mark entity="provider:circle" size={SIZE.markDetail} />
            <View style={styles.grow}>
              <Text style={[TYPE.rowStrong, { color: color.ink }]}>{copy.test.faucet}</Text>
              <View style={styles.inline}>
                <Text style={[TYPE.numMd, { color: color.up }]}>{copy.test.faucetAmount}</Text>
                <Mark entity={testnet.usdc} size={SIZE.markInline} chainBadge={testnet.chain} />
              </View>
            </View>
          </Plate>
        </Animated.View>
      </Arrive>
      <ExampleTag label={copy.example} />
    </View>
  );
}

const noop = () => undefined;

const styles = StyleSheet.create({
  art: { width: "100%", maxWidth: ART_MAX_WIDTH, alignSelf: "center", gap: SPACE.md },
  plate: { borderRadius: SHEET_SHAPE.rowRadius, paddingVertical: SPACE.xs, ...ELEVATION.receipt },
  tight: { overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + SPACE.xxs,
  },
  raceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    marginHorizontal: SPACE.xs,
  },
  pick: { borderRadius: RADIUS.md },
  grow: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  overlap: { marginStart: OVERLAP },
  bubbleRow: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "88%",
    borderRadius: RADIUS.lg,
    borderBottomEndRadius: RADIUS.xs,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  best: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs },
  tag: { alignSelf: "center", borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs },
  ringRow: { alignItems: "center" },
  ring: { width: RING, height: RING },
  turn: { transform: [{ rotate: `${QUARTER_TURN}deg` }] },
  ringLabel: { alignItems: "center", justifyContent: "center", paddingHorizontal: SPACE.lg },
  centre: { textAlign: "center" },
  grid: { gap: SPACE.md },
  gridRow: { flexDirection: "row", justifyContent: "center", gap: SPACE.md },
  tile: { width: TILE, height: TILE, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  capsuleRow: { alignItems: "center" },
  faucet: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg },
});
