// The voice overlay (Phantom M06's blur grammar, Koe's rules): the live page blurs and darkens, the orb rises
// from its slot in the dock to the centre and grows, the state and the words come forward, × restores the page.
// Voice itself arrives in Stage 10; until then the overlay opens in its honest idle state — the orb, "Voice is
// on its way", and the way to type instead — so the signature moment exists and the keyboard path is never
// hidden (K4 / U1). Instant with reduced motion.
import { DOCK, MOTION } from "@kawase/config";
import { useRouter } from "expo-router";
import { Keyboard } from "lucide-react-native";
import * as React from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

export const ORB_DOCK_SIZE = 40;
const ORB_OVERLAY_SIZE = 220;
const IDLE_LEVEL = 0.2;
const HALF = 0.5;

type VoiceOverlayProps = {
  open: boolean;
};

function RisingOrb({ open, network }: { open: boolean; network: "mainnet" | "testnet" }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);

  // From the orb's slot in the dock (bottom centre) to the middle of the screen.
  const dockCentreFromBottom = insets.bottom + DOCK.bottomInsetPt + DOCK.heightPt * HALF;
  const travel = height * HALF - dockCentreFromBottom;
  const startScale = ORB_DOCK_SIZE / ORB_OVERLAY_SIZE;

  React.useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: reduced ? 0 : open ? MOTION.orbRiseMs : MOTION.blurOutMs, easing: Easing.out(Easing.cubic) });
  }, [open, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel }, { scale: startScale + (1 - startScale) * progress.value }],
  }));

  return (
    <Animated.View style={[{ width: ORB_OVERLAY_SIZE, height: ORB_OVERLAY_SIZE }, style]}>
      <Orb colors={tokens.orb[network]} level={IDLE_LEVEL} className="size-full" />
    </Animated.View>
  );
}

export function VoiceOverlay({ open }: VoiceOverlayProps) {
  const { t } = useT();
  const router = useRouter();
  const overlay = useOverlay();
  const { mode, network } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const typeInstead = () => {
    overlay.close();
    router.navigate("/chat");
  };

  return (
    <BlurOverlay open={open} onClose={overlay.close} scheme={mode} scrim={colors.scrim} closeLabel={t("common.close")} topInset={insets.top}>
      <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingTop: insets.top }}>
        <RisingOrb open={open} network={network} />
        <StateLabel>{t("common.appName")}</StateLabel>
        <Text className="font-display text-foreground text-center text-2xl font-bold">{t("voice.soon")}</Text>
        <Text className="text-muted-foreground text-center text-base">{t("voice.soonBody")}</Text>
        <Button variant="secondary" onPress={typeInstead}>
          <Icon as={Keyboard} className="size-5" />
          <Text>{t("home.typeInstead")}</Text>
        </Button>
      </View>
    </BlurOverlay>
  );
}
