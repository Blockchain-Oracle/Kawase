// The orb, web: the WebGL component from ui-web, filling its parent exactly (a dock slot, a story disc, the voice
// overlay). The inner box is absolutely placed, so the canvas can never change the size it is drawn into. The WebGL
// loop has no paused mode, so the canvas is simply not drawn while its screen is covered (Codex review R16); the
// browser already stops it in a background tab, and it holds a still frame itself under reduced motion. Without a
// label it is decoration, not an element (R13).
import { VoicePoweredOrb } from "@kawase/ui-web/components/ui/voice-powered-orb";
import { useIsFocused } from "expo-router";
import { View } from "react-native";

import type { VoiceOrbProps } from "@kawase/ui-native/components/voice-orb";

const FILL = { width: "100%", height: "100%" } as const;

export function Orb({ colors, level, className, accessibilityLabel }: VoiceOrbProps) {
  const focused = useIsFocused();
  return (
    <View
      className={className}
      style={FILL}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      aria-hidden={!accessibilityLabel}
    >
      {focused ? (
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <VoicePoweredOrb colors={colors} level={typeof level === "number" ? level : 0} />
          </div>
        </div>
      ) : null}
    </View>
  );
}
