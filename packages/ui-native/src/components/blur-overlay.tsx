// A blur over the live page (Phantom M06's grammar): the page behind blurs and darkens in ~180 ms, the overlay's
// content comes forward, × or a tap outside restores the page. Rendered by the app through a portal inside the
// (app) layout so the blur sees the page on iOS, Android and web. Instant with reduced motion.
import { BLUR, MOTION } from "@kawase/config";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { cn } from "@kawase/ui-native/lib/utils";
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

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
  children?: React.ReactNode;
  className?: string;
};

const CLOSE_SIZE = 44;
const CLOSE_INSET = 16;
/** The scrim token is sized for sheets; an overlay keeps more of the page visible through the blur. */
const SCRIM_STRENGTH = 0.55;

function BlurOverlay({ open, onClose, scheme, scrim, closeLabel, close = "top-end", topInset = 0, children, className }: BlurOverlayProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    if (open) setMounted(true);
    const duration = reduced ? 0 : open ? MOTION.blurInMs : MOTION.blurOutMs;
    progress.value = withTiming(open ? 1 : 0, { duration });
    if (!open) {
      const timer = setTimeout(() => setMounted(false), duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, reduced, progress]);

  const blurProps = useAnimatedProps(() => ({ intensity: progress.value * BLUR.overlay }));
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const scrimFade = useAnimatedStyle(() => ({ opacity: progress.value * SCRIM_STRENGTH }));

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <AnimatedBlur
        animatedProps={blurProps}
        tint={scheme === "dark" ? "dark" : "light"}
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, scrimFade, { backgroundColor: scrim }]}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, fade]} className={cn(className)}>
        {children}
        {close === "top-end" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            className="bg-secondary absolute items-center justify-center rounded-full"
            style={{ width: CLOSE_SIZE, height: CLOSE_SIZE, top: topInset + CLOSE_INSET, end: CLOSE_INSET }}
          >
            <Icon as={X} className="text-foreground size-5" />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

export { BlurOverlay };
export type { BlurOverlayProps };
