// The + fan (decision 1; the one the owner liked in Senryo, ActionFan before ad694498, with 21st.dev
// chetanverma16/floating-action-menu #782 as the web spec): tapping the dock's centre blurs and dims the live page,
// and five labelled plates rise and grow out of the centre disc into one column above it — Send nearest the thumb,
// then Receive, Add money, Swap and Bridge. Each plate takes 200 ms, 25 ms after the one below it; only the lead
// (Send) overshoots. Closing runs the same motion in reverse, and the blur leaves with the last plate. With Reduce
// Motion nothing travels: the plates crossfade in 100 ms.
//
// The disc is drawn again above the scrim, where the dock's is, turned to ×: tapping it, the scrim, Escape or Android
// Back closes the fan and leaves the page untouched. Choosing an action closes the fan and opens the action over the
// same page; a guest's choice goes through the account gate (the sign-in sheet opens in place, and the action follows
// it). To assistive technology the fan is a dialog whose first element is Send.
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
  Plus,
  Waypoints,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";

import { Icon } from "@/components/kit/icons";
import { CONTROL_FONT_SCALE, EASE, ELEVATION, SPACE, SPRING, TIMING, TYPE, useTheme } from "@/components/kit/theme";
import { usePressScale } from "@/components/kit/usePressScale";
import { CentreGlyph, CENTRE_SIZE } from "@/dock/centre-button";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import type { DeferredVerb } from "@/onboarding/deferred-action";
import { useTheme as useAppTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

/** The owner's spec: 200 ms per plate, 25 ms apart. */
export const FAN_ITEM_MS = 200;
export const FAN_STAGGER_MS = 25;
const FAN_EXIT_ITEM_MS = 160;
const PLATE_H = 52;
const PLATE_GAP = SPACE.md;
const PITCH = PLATE_H + PLATE_GAP;
const DISC = 40;
const HALF = 2;
const CLOSED_SCALE = 0.4;
/** Space between the disc's top and the lowest plate. */
const COLUMN_GAP = SPACE.lg;

export type FanAction = { verb: DeferredVerb; label: string; icon: LucideIcon };

/** The five actions in rising order: the first sits nearest the disc and leads. */
export function useFanActions(): FanAction[] {
  const { t } = useT();
  return [
    { verb: "send", label: t("shell.fan.send"), icon: ArrowUpRight },
    { verb: "receive", label: t("shell.fan.receive"), icon: ArrowDownLeft },
    { verb: "fund", label: t("shell.fan.addMoney"), icon: Plus },
    { verb: "swap", label: t("shell.fan.swap"), icon: ArrowLeftRight },
    { verb: "bridge", label: t("shell.fan.bridge"), icon: Waypoints },
  ];
}

/** How long the whole close takes (the last plate included); the blur's exit matches it. */
export const fanExitMs = (count: number) => (count - 1) * FAN_STAGGER_MS + FAN_EXIT_ITEM_MS;

type Anchor = { centreX: number; top: number; height: number };
const GLYPH = 20;
const GLYPH_STROKE = 2.4;

type ViewNode = View | null;
/** The node's box in window coordinates (undefined when not laid out). */
function measure(node: ViewNode): Promise<{ x: number; y: number; w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    if (!node) return resolve(undefined);
    node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { x, y, w, h } : undefined));
  });
}

export function ActionFan({
  open,
  onClose,
  onChoose,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (verb: DeferredVerb) => void;
  /** The dock's centre slot: the fan rises from it and draws its × there. */
  origin: React.RefObject<View | null>;
}) {
  const { t } = useT();
  const { mode } = useAppTheme();
  const colors = useThemeColors();
  const actions = useFanActions();
  const frame = React.useRef<View>(null);
  const first = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<Anchor>();

  // Where the dock's centre is, measured against this layer once it has laid out (the blur mounts its content a frame
  // after opening), never assumed from the screen's middle. Measured again on every opening (a rotation, a resize).
  const place = React.useCallback(() => {
    void Promise.all([measure(frame.current), measure(origin.current)]).then(([layer, slot]) => {
      if (!layer || !slot) return;
      setAnchor({ centreX: slot.x - layer.x + slot.w / HALF, top: slot.y - layer.y, height: slot.h });
    });
  }, [origin]);
  React.useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, place]);

  return (
    <BlurOverlay
      open={open}
      onClose={onClose}
      scheme={mode}
      scrim={colors.scrim}
      closeLabel={t("shell.fan.close")}
      close="none"
      initialFocusRef={first}
      exitMs={fanExitMs(actions.length)}
      contentFades={false}
    >
      <View ref={frame} pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={place}>
        {anchor ? (
          <>
            <View
              pointerEvents="box-none"
              style={[styles.column, { top: anchor.top - COLUMN_GAP - (actions.length * PITCH - PLATE_GAP) }]}
            >
              {/* Top to bottom on screen; the stagger counts from the disc up. */}
              {[...actions].reverse().map((action, at) => {
                const rank = actions.length - 1 - at;
                return (
                  <FanPlate
                    key={action.verb}
                    action={action}
                    rank={rank}
                    count={actions.length}
                    open={open}
                    plateRef={rank === 0 ? first : undefined}
                    onPress={() => {
                      fire("press");
                      onChoose(action.verb);
                    }}
                  />
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("shell.fan.close")}
              onPress={onClose}
              style={[
                styles.close,
                {
                  left: anchor.centreX - CENTRE_SIZE / HALF,
                  top: anchor.top + (anchor.height - CENTRE_SIZE) / HALF,
                },
              ]}
            >
              <CentreGlyph open={open} />
            </Pressable>
          </>
        ) : null}
      </View>
    </BlurOverlay>
  );
}

function FanPlate({
  action,
  rank,
  count,
  open,
  onPress,
  plateRef,
}: {
  action: FanAction;
  /** 0 for the plate nearest the disc. */
  rank: number;
  count: number;
  open: boolean;
  onPress: () => void;
  plateRef?: React.Ref<View> | undefined;
}) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const press = usePressScale();
  const progress = useSharedValue(0);
  const lead = rank === 0;

  React.useEffect(() => {
    if (reduce) {
      progress.set(withTiming(open ? 1 : 0, { duration: TIMING.reducedMotion }));
      return;
    }
    if (open) {
      const rise = lead ? withSpring(1, SPRING.fanLead) : withTiming(1, { duration: FAN_ITEM_MS, easing: EASE });
      progress.set(withDelay(rank * FAN_STAGGER_MS, rise));
      return;
    }
    // The top plate leaves first, the lead last, so the column folds back into the disc.
    progress.set(
      withDelay(
        (count - 1 - rank) * FAN_STAGGER_MS,
        withTiming(0, { duration: FAN_EXIT_ITEM_MS, easing: Easing.in(Easing.quad) }),
      ),
    );
  }, [open, reduce, lead, rank, count, progress]);

  // From the disc: each plate travels the distance between its resting row and the disc, growing as it goes.
  const travel = (rank + 1) * PITCH;
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    if (reduce) return { opacity: p };
    return {
      opacity: Math.min(1, p * HALF),
      transform: [{ translateY: (1 - p) * travel }, { scale: CLOSED_SCALE + (1 - CLOSED_SCALE) * p }],
    };
  });

  return (
    <Animated.View style={[styles.plateWrap, style]} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={press.style}>
        <Pressable
          ref={plateRef}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.plate,
            ELEVATION.button,
            { backgroundColor: pressed ? color.rowPressed : color.card },
          ]}
        >
          <View style={[styles.disc, { backgroundColor: color.primary }]}>
            <Icon icon={action.icon} size={GLYPH} tint={color.primaryForeground} strokeWidth={GLYPH_STROKE} />
          </View>
          <Text
            maxFontSizeMultiplier={CONTROL_FONT_SCALE}
            numberOfLines={1}
            style={[TYPE.rowStrong, { color: color.ink }]}
          >
            {action.label}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: "absolute",
    start: 0,
    end: 0,
    alignItems: "center",
    gap: PLATE_GAP,
  },
  plateWrap: { height: PLATE_H },
  plate: {
    height: PLATE_H,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingStart: (PLATE_H - DISC) / HALF,
    paddingEnd: SPACE.xl,
    borderRadius: PLATE_H / HALF,
  },
  disc: { width: DISC, height: DISC, borderRadius: DISC / HALF, alignItems: "center", justifyContent: "center" },
  close: { position: "absolute", width: CENTRE_SIZE, height: CENTRE_SIZE },
});
