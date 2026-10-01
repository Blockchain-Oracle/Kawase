// A blur over the live page (Phantom M06's grammar): the page behind blurs and darkens in ~180 ms, the overlay's
// content comes forward, × or a tap outside restores the page. Rendered by the app as a layer above the tab pages
// so the blur sees the page on iOS, Android and web. Instant with reduced motion (read live).
//
// To assistive tech it is one modal surface (Codex review R13): VoiceOver treats it as modal and its escape gesture
// closes it, the web reads it as a dialog, focus moves to `initialFocusRef` once it is open, and the tap-outside
// layer is not an element (× is). The app hides the page underneath and handles the hardware Back. With
// `modal={false}` it is only the backdrop of controls drawn outside it (the fan), so assistive tech skips it.
// `exitMs` stretches the close to the caller's own exit so the blur, the content and the unmount end together, and
// `onExited` fires once it has left the screen (R16). With `contentFades={false}` the children keep their opacity
// through the exit and fade themselves (the voice overlay's orb travels home sharp); × still fades.
import { BLUR, MOTION } from "@kawase/config";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { focusElement, useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn } from "@kawase/ui-native/lib/utils";
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

type BlurOverlayProps = {
  open: boolean;
  onClose: () => void;
  scheme: "light" | "dark";
  /** The `scrim` token as hex (painted over the blur). */
  scrim: string;
  /** Label for the close button ("Close"). */
  closeLabel: string;
  /** Where the × sits; the fan keeps it at the plus button's place instead. */
  close?: "top-end" | "none";
  /** The status bar / notch height, so the × clears it. */
  topInset?: number;
  /** A modal surface with its own content (default), or only the backdrop of controls drawn outside it. */
  modal?: boolean;
  /** What the screen reader lands on once the overlay is open (its heading). */
  initialFocusRef?: React.RefObject<View | null>;
  /** How long the close takes; the fan passes its whole staggered exit. */
  exitMs?: number;
  /** Called once the overlay has left the screen after closing. */
  onExited?: () => void;
  /** Whether the children fade with the blur (default), or keep their opacity and handle it themselves. */
  contentFades?: boolean;
  children?: React.ReactNode;
  className?: string;
};

const CLOSE_SIZE = 44;
const CLOSE_INSET = 16;
/** The scrim token is sized for sheets; an overlay keeps more of the page visible through the blur. */
const SCRIM_STRENGTH = 0.55;

function BlurOverlay({
  open,
  onClose,
  scheme,
  scrim,
  closeLabel,
  close = "top-end",
  topInset = 0,
  modal = true,
  initialFocusRef,
  exitMs = MOTION.blurOutMs,
  onExited,
  contentFades = true,
  children,
  className,
}: BlurOverlayProps) {
  const reduced = useReducedMotionLive();
  const progress = useSharedValue(open ? 1 : 0);
  const [mounted, setMounted] = React.useState(open);
  const shown = React.useRef(open);
  const exited = React.useEffectEvent(() => onExited?.());

  // One lifetime: in over `blurInMs`, out over `exitMs`, unmounted (and reported) exactly when the out ends. A reopen
  // during the out cancels the unmount and reverses from wherever the blur is.
  React.useEffect(() => {
    if (open) {
      shown.current = true;
      setMounted(true);
    } else if (!shown.current) return undefined;
    const duration = reduced ? 0 : open ? MOTION.blurInMs : exitMs;
    progress.value = withTiming(open ? 1 : 0, { duration });
    if (open) return undefined;
    const timer = setTimeout(() => {
      shown.current = false;
      setMounted(false);
      exited();
    }, duration);
    return () => clearTimeout(timer);
  }, [open, reduced, exitMs, progress]);

  // Focus moves in once the content is there and visible.
  React.useEffect(() => {
    if (!open || !mounted || !modal) return undefined;
    const timer = setTimeout(() => focusElement(initialFocusRef?.current), reduced ? 0 : MOTION.blurInMs);
    return () => clearTimeout(timer);
  }, [open, mounted, modal, reduced, initialFocusRef]);

  const blurProps = useAnimatedProps(() => ({ intensity: progress.value * BLUR.overlay }));
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const scrimFade = useAnimatedStyle(() => ({ opacity: progress.value * SCRIM_STRENGTH }));

  if (!mounted) return null;
  const active = modal && open;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
      // A closing overlay, or a backdrop, is never something to land on.
      aria-hidden={!active}
      aria-modal={active}
      role={active ? "dialog" : undefined}
      accessibilityViewIsModal={active}
      onAccessibilityEscape={active ? onClose : undefined}
    >
      <AnimatedBlur
        animatedProps={blurProps}
        tint={scheme === "dark" ? "dark" : "light"}
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View aria-hidden style={[StyleSheet.absoluteFill, scrimFade, { backgroundColor: scrim }]}>
        <Pressable accessible={false} focusable={false} onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, contentFades ? fade : null]} className={cn(className)}>
        {children}
      </Animated.View>
      {close === "top-end" ? (
        <Animated.View style={[fade, { position: "absolute", top: topInset + CLOSE_INSET, end: CLOSE_INSET }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            className="bg-secondary items-center justify-center rounded-full"
            style={{ width: CLOSE_SIZE, height: CLOSE_SIZE }}
          >
            <Icon as={X} className="text-foreground size-5" />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

export { BlurOverlay };
export type { BlurOverlayProps };
