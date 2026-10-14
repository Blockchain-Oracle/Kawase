/**
 * The states kit: every surface draws all four, designed (Mitoshi `states/*` and Senryo `kit/states.tsx`, with 21st.dev
 * #23591 loading-state, #1588 skeleton, #23557 skeleton-swap and #1435 empty-state as the specs).
 *   Loading  a skeleton shaped like the real layout (never a spinner page, never an invented number), pulsing 1200 ms.
 *   Empty    says why and names the next action.
 *   Error    says what still works and offers one action; a read failure never says "nothing was sent".
 *   Offline  cached values stay, marked stale (`StaleTick`, `OfflineStrip`).
 * No borders on content: loading sits bare on its ground, empty is a filled group one step lighter, an error is the
 * destructive wash. All words come from the `shell` catalogue; callers pass their own titles for empty states.
 */
import { type ReactNode, useEffect, useState } from "react";
import { type DimensionValue, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useT } from "@/i18n";

import { Button } from "./Button";
import { type Diagnosis, fixForDiagnosis } from "./diagnosis";
import { ChevronDown, CloudOff, Icon, RotateCw, type SymbolIcon, TriangleAlert } from "./icons";
import { useGroupFill } from "./Surface";
import { NUMERIC_VARIANT, RADIUS, SHEET_SHAPE, SIZE, SKELETON, SPACE, TYPE, useTheme } from "./theme";

export function Skeleton({
  width = "100%",
  height = SIZE.skeletonLine,
  radius = RADIUS.sm,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue<number>(SKELETON.from);
  useEffect(() => {
    if (!reduce) pulse.set(withRepeat(withTiming(SKELETON.to, { duration: SKELETON.periodMs }), -1, true));
  }, [reduce, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: reduce ? 1 : pulse.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: color.skeleton }, style]} />;
}

const CIRCLE = RADIUS.pill;
const GRID = 3;
const LIST_COUNT = 4;
const PIXELS = GRID * GRID;
const DIM_LEVEL = 0.15;
const HALF = 2;
const SECOND = 1000;
const WAVE_THIRDS = 3;
const PIXEL = 4;
const PIXEL_GAP = 1.5;
const WAVE_MS = 650;
const WAVE_STEP_MS = 90;

/** The 3 x 3 pixel loader of 21st.dev #23591 (a chevron wavefront driving right), drawn with Reanimated; still under Reduce Motion. */
export function PixelLoader() {
  const { color } = useTheme();
  return (
    <View style={styles.pixels} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: PIXELS }, (_, i) => (
        <Pixel key={i} delay={((i % GRID) + Math.abs(Math.floor(i / GRID) - 1)) * WAVE_STEP_MS} tint={color.ink} />
      ))}
    </View>
  );
}

function Pixel({ delay, tint }: { delay: number; tint: string }) {
  const reduce = useReducedMotion();
  const level = useSharedValue(DIM_LEVEL);
  useEffect(() => {
    if (reduce) return;
    level.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: WAVE_MS / WAVE_THIRDS }),
            withTiming(DIM_LEVEL, { duration: (WAVE_MS * (WAVE_THIRDS - 1)) / WAVE_THIRDS }),
          ),
          -1,
        ),
      ),
    );
  }, [reduce, delay, level]);
  const style = useAnimatedStyle(() => ({ opacity: level.get() }));
  return <Animated.View style={[{ width: PIXEL, height: PIXEL, borderRadius: 1, backgroundColor: tint }, style]} />;
}

export type LoadingShape = "line" | "row" | "list" | "plate" | "chart" | "hero" | "feed" | "routes" | "detail";
const LIST_ROWS = Array.from({ length: LIST_COUNT }, (_, i) => i);
const FEED_ROWS = Array.from({ length: GRID }, (_, i) => i);
const ROUTE_ROWS = Array.from({ length: GRID }, (_, i) => i);
const MARK = SIZE.markRow;
const HERO_FIGURE_H = 52;

/** A row of an asset list or a settings list: a mark, two lines, a figure. */
function ListShape({ index }: { index: number }) {
  return (
    <View key={index} style={styles.listRow}>
      <Skeleton width={MARK} height={MARK} radius={CIRCLE} />
      <View style={styles.grow}>
        <Skeleton width="46%" height={SIZE.skeletonLine} />
        <Skeleton width="28%" height={SIZE.skeletonSmall} />
      </View>
      <View style={styles.end}>
        <Skeleton width={64} height={SIZE.skeletonLine} />
        <Skeleton width={36} height={SIZE.skeletonSmall} />
      </View>
    </View>
  );
}

function ShapeBody({ shape }: { shape: LoadingShape }) {
  switch (shape) {
    case "line":
      return <Skeleton width="66%" />;
    case "row":
      return <ListShape index={0} />;
    case "list":
      return (
        <View style={styles.stack}>
          {LIST_ROWS.map((i) => (
            <ListShape key={i} index={i} />
          ))}
        </View>
      );
    case "plate":
      return <Skeleton height={SIZE.skeletonPlate} radius={SHEET_SHAPE.rowRadius} />;
    case "chart":
      return <Skeleton height={SIZE.skeletonPlate * HALF} radius={SHEET_SHAPE.rowRadius} />;
    case "hero":
      // The balance hero: a big figure, its change chip and a sparkline's outline.
      return (
        <View style={styles.hero}>
          <Skeleton width="54%" height={HERO_FIGURE_H} radius={RADIUS.md} />
          <Skeleton width={84} height={22} radius={RADIUS.xs} />
          <Skeleton height={SIZE.skeletonPlate} radius={SHEET_SHAPE.rowRadius} />
        </View>
      );
    case "feed":
      // The agent's feed: a group label, then cards with a mark, a sentence and a result.
      return (
        <View style={styles.stack}>
          <Skeleton width={72} height={SIZE.skeletonSmall} />
          {FEED_ROWS.map((i) => (
            <View key={i} style={styles.feedRow}>
              <Skeleton width={MARK} height={MARK} radius={CIRCLE} />
              <View style={styles.grow}>
                <Skeleton width="78%" height={SIZE.skeletonLine} />
                <Skeleton width="42%" height={SIZE.skeletonSmall} />
              </View>
            </View>
          ))}
        </View>
      );
    case "routes":
      // The route list: logo, "you receive", delta to best, ETA.
      return (
        <View style={styles.stack}>
          {ROUTE_ROWS.map((i) => (
            <View key={i} style={styles.listRow}>
              <Skeleton width={MARK} height={MARK} radius={CIRCLE} />
              <View style={styles.grow}>
                <Skeleton width="40%" height={SIZE.skeletonLine} />
                <Skeleton width="24%" height={SIZE.skeletonSmall} />
              </View>
              <Skeleton width={72} height={SIZE.skeletonLine} />
            </View>
          ))}
        </View>
      );
    case "detail":
      return (
        <View style={styles.stack}>
          <Skeleton width="38%" height={HERO_FIGURE_H / HALF} radius={RADIUS.md} />
          <Skeleton height={SIZE.skeletonPlate} radius={SHEET_SHAPE.rowRadius} />
          <Skeleton width="62%" />
          <Skeleton width="48%" />
        </View>
      );
  }
}

/**
 * The loader: skeletons of what will arrive. `named` adds the pixel loader, a shimmering label and the elapsed seconds
 * for a longer, named wait (an agent step, a quote race). Announced as busy; the label is what assistive tech reads.
 */
export function LoadingState({
  shape = "row",
  label,
  named = false,
}: {
  shape?: LoadingShape;
  label?: string;
  named?: boolean;
}) {
  const { color } = useTheme();
  const { t } = useT();
  const words = label ?? t("shell.states.loading");
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={words}
      accessibilityState={{ busy: true }}
      style={styles.loading}
    >
      {named ? (
        <View style={styles.loadingHead}>
          <PixelLoader />
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{words}</Text>
          <Elapsed />
        </View>
      ) : null}
      <ShapeBody shape={shape} />
    </View>
  );
}

function Elapsed() {
  const { color } = useTheme();
  const { t } = useT();
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(id);
  }, []);
  return (
    <Text style={[TYPE.rowChange, { color: color.text3, fontVariant: NUMERIC_VARIANT }]}>
      {t("shell.wait.elapsed", { seconds: Math.floor((now - start) / SECOND) })}
    </Text>
  );
}

export type StateAction = { label: string; onPress: () => void };

/** Says why it is empty (a title of at most five words, one line of detail) and names the next action: never a blank panel. */
export function EmptyState({
  why,
  detail,
  icon,
  action,
  secondary,
  size = "panel",
}: {
  why: string;
  detail?: string;
  icon?: SymbolIcon;
  action?: StateAction;
  secondary?: StateAction;
  size?: "inline" | "panel" | "page";
}) {
  const { color } = useTheme();
  const fill = useGroupFill();
  const inline = size === "inline";
  return (
    <View
      style={[
        styles.panel,
        inline ? styles.panelInline : null,
        size === "page" ? styles.panelPage : null,
        { backgroundColor: inline ? color.transparent : fill },
      ]}
    >
      {icon && !inline ? (
        <View
          style={[styles.tile, { backgroundColor: color.raised2 }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon icon={icon} size={SIZE.icon} tint={color.text2} />
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[TYPE.sectionTitle, styles.center, { color: color.ink }]}>
        {why}
      </Text>
      {detail ? <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>{detail}</Text> : null}
      {action || secondary ? (
        <View style={styles.actions}>
          {action ? <Button label={action.label} onPress={action.onPress} size="sm" block={false} /> : null}
          {secondary ? (
            <Button label={secondary.label} onPress={secondary.onPress} variant="ghost" size="sm" block={false} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The diagnosis in human words, what still works, one action (retry, or the fix that unblocks it), the technical line
 * behind a disclosure. A read failure keeps the last good values on screen (the caller draws them above) and never says
 * anything about money; a failed write uses `TxFailureCard`, which always says whether money moved.
 */
export function ErrorState({
  diagnosis,
  retry,
  stillWorks,
  onFix,
  variant = "panel",
}: {
  diagnosis: Diagnosis;
  retry?: () => void;
  /** What still works while this is wrong ("Your balance is saved on this phone"). */
  stillWorks?: string;
  /** Runs the named fix (add money, sign in…); retry stays its own button. */
  onFix?: (kind: NonNullable<ReturnType<typeof fixForDiagnosis>>["kind"]) => void;
  variant?: "panel" | "strip";
}) {
  const { color } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const fix = fixForDiagnosis(diagnosis.kind, diagnosis.retryable);
  const offerRetry = retry !== undefined && diagnosis.retryable;
  const detour = fix && fix.kind !== "retry" && onFix ? fix : null;
  const title = t(`shell.diagnosis.${diagnosis.kind}.title`);
  if (variant === "strip") {
    return (
      <View accessibilityRole="alert" style={[styles.strip, { backgroundColor: color.warnSurface }]}>
        <Icon icon={TriangleAlert} size={SIZE.iconSm} tint={color.warn} />
        <Text style={[TYPE.rowDetail, styles.grow, { color: color.ink }]} numberOfLines={2}>
          {title}
        </Text>
        {offerRetry ? (
          <Button label={t("shell.states.retry")} onPress={retry} variant="ghost" size="sm" block={false} />
        ) : null}
      </View>
    );
  }
  return (
    <View accessibilityRole="alert" style={[styles.panel, { backgroundColor: color.destructiveWash }]}>
      <View
        style={[styles.tile, { backgroundColor: color.warnSurface }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon icon={TriangleAlert} size={SIZE.icon} tint={color.warn} />
      </View>
      <Text style={[TYPE.sectionTitle, styles.center, { color: color.ink }]}>{title}</Text>
      <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>
        {t(`shell.diagnosis.${diagnosis.kind}.body`)}
      </Text>
      <Text style={[TYPE.rowDetail, styles.center, { color: color.text3 }]}>
        {stillWorks ?? t("shell.states.stillWorks")}
      </Text>
      {offerRetry || detour ? (
        <View style={styles.actions}>
          {detour ? (
            <Button
              label={t(`shell.fix.${detour.kind}`)}
              onPress={() => onFix?.(detour.kind)}
              size="sm"
              block={false}
            />
          ) : null}
          {offerRetry ? (
            <Button
              label={t("shell.states.retry")}
              onPress={retry}
              variant={detour ? "ghost" : "secondary"}
              size="sm"
              block={false}
              leading={<Icon icon={RotateCw} size={SIZE.iconSm} tint={color.ink} />}
            />
          ) : null}
        </View>
      ) : null}
      {diagnosis.technical ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={SPACE.sm}
          style={styles.technical}
        >
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("shell.states.technical")}</Text>
          <View style={open ? styles.flip : undefined}>
            <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
          </View>
        </Pressable>
      ) : null}
      {open ? (
        <Text selectable style={[TYPE.meta, styles.center, { color: color.text2 }]}>
          {diagnosis.kind}
          {diagnosis.errorName ? ` · ${diagnosis.errorName}` : ""}
          {diagnosis.technical ? `\n${diagnosis.technical}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const clock = (ms: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/** The previous value stays at full ink; this says how old it is, in the reader's own clock. A polite live region. */
export function StaleTick({
  asOf,
  reason = "refresh-failed",
  compact = false,
}: {
  asOf: number;
  reason?: "refresh-failed" | "offline" | "paused";
  compact?: boolean;
}) {
  const { color } = useTheme();
  const { t, i18n } = useT();
  const why = t(`shell.stale.${reason}`);
  return (
    <View style={styles.stale} accessibilityLiveRegion="polite">
      <Icon icon={reason === "offline" ? CloudOff : TriangleAlert} size={SIZE.iconSm} tint={color.warn} />
      <Text style={[TYPE.meta, { color: color.warn }]}>
        {compact ? why : t("shell.stale.line", { time: clock(asOf, i18n.language), reason: why })}
      </Text>
    </View>
  );
}

/** A strip across the top when the phone is offline: what was saved stays, marked stale. */
export function OfflineStrip({ asOf }: { asOf?: number }) {
  const { color } = useTheme();
  const { t, i18n } = useT();
  return (
    <View accessibilityRole="alert" style={[styles.strip, { backgroundColor: color.warnSurface }]}>
      <Icon icon={CloudOff} size={SIZE.iconSm} tint={color.warn} />
      <Text style={[TYPE.rowDetail, styles.grow, { color: color.ink }]} numberOfLines={2}>
        {asOf ? t("shell.states.offlineSaved", { time: clock(asOf, i18n.language) }) : t("shell.states.offline")}
      </Text>
    </View>
  );
}

/**
 * Renders a read honestly: skeleton only where nothing was ever known, then the value (stale-marked with the tick when
 * the last refresh failed), and an error only when there is nothing to show. `children` keeps its place between fresh
 * and stale, so a refresh never remounts what the reader is looking at.
 */
export function ReadView<T>({
  value,
  loading,
  error,
  asOf,
  shape = "row",
  retry,
  children,
}: {
  value: T | undefined;
  loading: boolean;
  error?: Diagnosis | null;
  asOf?: number;
  shape?: LoadingShape;
  retry?: () => void;
  children: (value: T) => ReactNode;
}) {
  if (value === undefined) {
    if (error) return <ErrorState diagnosis={error} {...(retry ? { retry } : {})} />;
    return loading ? <LoadingState shape={shape} /> : null;
  }
  return (
    <>
      {error && asOf ? (
        <StaleTick asOf={asOf} reason={error.kind === "offline" ? "offline" : "refresh-failed"} />
      ) : null}
      {children(value)}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { gap: SPACE.sm, paddingVertical: SPACE.sm },
  loadingHead: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  pixels: { width: PIXEL * GRID + PIXEL_GAP * (GRID - 1), flexDirection: "row", flexWrap: "wrap", gap: PIXEL_GAP },
  stack: { gap: SPACE.md },
  hero: { gap: SPACE.md },
  listRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: SIZE.skeletonRow },
  feedRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, gap: SPACE.xs },
  end: { alignItems: "flex-end", gap: SPACE.xs },
  panel: { borderRadius: SHEET_SHAPE.rowRadius, padding: SPACE.xl, gap: SPACE.md, alignItems: "center" },
  panelInline: { paddingVertical: SPACE.xxl },
  panelPage: { paddingVertical: SPACE.xxxl },
  tile: {
    width: SIZE.avatarLg,
    height: SIZE.avatarLg,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  actions: { flexDirection: "row", gap: SPACE.sm, flexWrap: "wrap", justifyContent: "center" },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: SHEET_SHAPE.rowRadius,
  },
  technical: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  flip: { transform: [{ rotate: "180deg" }] },
  stale: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
});
