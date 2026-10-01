// A dotted QR code (Solflare S21/M04, Phantom P21): the modules are dots, the three finders are rounded rings, and
// an entity mark sits in the centre. On first show the dots assemble from a scatter (each dot lands with its own
// delay inside ~700 ms); with reduced motion the code is drawn complete. The matrix always comes from the live
// value passed in — never a fixture — and the code stays left-to-right in every language.
import { MOTION } from "@kawase/config";
import { cn } from "@kawase/ui-native/lib/utils";
import * as QRCode from "qrcode";
import * as React from "react";
import { View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";

type DottedQrProps = {
  /** What the code encodes (an address, a payment link). */
  value: string;
  size?: number;
  /** Dot colour and background, as hex from the tokens. */
  dotColor: string;
  background: string;
  /** Something to draw in the centre (an entity mark); the modules under it are hidden. */
  center?: React.ReactNode;
  /** Fraction of the code the centre occupies (error correction H tolerates up to ~30%). */
  centerRatio?: number;
  className?: string;
};

const DEFAULT_SIZE = 240;
const DEFAULT_CENTER_RATIO = 0.22;
const FINDER = 7;
/**
 * Dot radius as a fraction of a module: 0.5 means neighbouring dots just touch. Measured by decoding a simulator
 * screenshot of the receive page with jsQR (a strict decoder): 0.38, 0.45 and 0.48 did not decode, 0.5 did, to the
 * exact wallet address. Any gap between dots is what breaks it, so do not go below this without re-running that check.
 */
const DOT_RATIO = 0.5;
const FINDER_RADIUS_RATIO = 0.3;
const FINDER_RING = 1;
const HALF = 0.5;
const DOT_STAGGER_MS = 40;
const DOT_FADE_MS = 160;
/** The finder's inner square starts two modules in and is three modules wide. */
const FINDER_INNER_INSET = 2;
const FINDER_INNER_SHRINK = 4;
/** A cheap, spread-out delay per dot: a hash over the coordinates modulo a prime. */
const HASH_X = 7;
const HASH_Y = 13;
const HASH_MOD = 17;

/** Module (x, y) belongs to one of the three finder patterns. */
const inFinder = (x: number, y: number, count: number) =>
  (x < FINDER && y < FINDER) || (x >= count - FINDER && y < FINDER) || (x < FINDER && y >= count - FINDER);

function DottedQr({ value, size = DEFAULT_SIZE, dotColor, background, center, centerRatio = DEFAULT_CENTER_RATIO, className }: DottedQrProps) {
  const reduced = useReducedMotion();
  const matrix = React.useMemo(() => {
    const code = QRCode.create(value, { errorCorrectionLevel: "H" });
    const count = code.modules.size;
    const cells: boolean[][] = [];
    for (let y = 0; y < count; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < count; x += 1) row.push(Boolean(code.modules.get(y, x)));
      cells.push(row);
    }
    return { count, cells };
  }, [value]);

  const { count, cells } = matrix;
  const cell = size / count;
  const centerSpan = Math.ceil(count * centerRatio);
  const centerStart = Math.floor((count - centerSpan) * HALF);
  const inCenter = (x: number, y: number) =>
    Boolean(center) && x >= centerStart && x < centerStart + centerSpan && y >= centerStart && y < centerStart + centerSpan;

  const dots: React.ReactNode[] = [];
  cells.forEach((row, y) => {
    row.forEach((on, x) => {
      if (!on || inFinder(x, y, count) || inCenter(x, y)) return;
      const delay = reduced ? 0 : Math.round((((x * HASH_X + y * HASH_Y) % HASH_MOD) / HASH_MOD) * (MOTION.qrAssembleMs - DOT_STAGGER_MS));
      dots.push(
        <AnimatedDot
          key={`${x}-${y}`}
          cx={x * cell + cell * HALF}
          cy={y * cell + cell * HALF}
          r={cell * DOT_RATIO}
          color={dotColor}
          delay={delay}
          animate={!reduced}
        />,
      );
    });
  });

  const finderSize = FINDER * cell;
  const finderRadius = finderSize * FINDER_RADIUS_RATIO;
  const finders = [
    { x: 0, y: 0 },
    { x: (count - FINDER) * cell, y: 0 },
    { x: 0, y: (count - FINDER) * cell },
  ];

  return (
    <View
      accessibilityRole="image"
      className={cn("overflow-hidden", className)}
      style={{ width: size, height: size, direction: "ltr", backgroundColor: background }}
    >
      <Svg width={size} height={size}>
        {dots}
        {finders.map((f, index) => (
          <React.Fragment key={index}>
            <Rect x={f.x + cell * HALF} y={f.y + cell * HALF} width={finderSize - cell} height={finderSize - cell} rx={finderRadius} fill="none" stroke={dotColor} strokeWidth={cell * FINDER_RING} />
            <Rect
              x={f.x + cell * FINDER_INNER_INSET}
              y={f.y + cell * FINDER_INNER_INSET}
              width={finderSize - cell * FINDER_INNER_SHRINK}
              height={finderSize - cell * FINDER_INNER_SHRINK}
              rx={finderRadius * HALF}
              fill={dotColor}
            />
          </React.Fragment>
        ))}
      </Svg>
      {center ? (
        <View pointerEvents="none" className="absolute items-center justify-center" style={{ top: centerStart * cell, start: centerStart * cell, width: centerSpan * cell, height: centerSpan * cell }}>
          {center}
        </View>
      ) : null}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function AnimatedDot({ cx, cy, r, color, delay, animate }: { cx: number; cy: number; r: number; color: string; delay: number; animate: boolean }) {
  if (!animate) return <Circle cx={cx} cy={cy} r={r} fill={color} />;
  return (
    <AnimatedCircle
      entering={FadeIn.delay(delay).duration(DOT_FADE_MS).easing(Easing.out(Easing.quad))}
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
    />
  );
}

export { DottedQr };
export type { DottedQrProps };
