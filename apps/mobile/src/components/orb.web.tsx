// The orb, web: the WebGL component from ui-web, filling its parent exactly (a dock slot, a story disc, the voice
// overlay). The inner box is absolutely placed, so the canvas can never change the size it is drawn into.
import { VoicePoweredOrb } from "@kawase/ui-web/components/ui/voice-powered-orb";
import { View } from "react-native";

import type { VoiceOrbProps } from "@kawase/ui-native/components/voice-orb";

const FILL = { width: "100%", height: "100%" } as const;

export function Orb({ colors, level, className, accessibilityLabel }: VoiceOrbProps) {
  return (
    <View className={className} style={FILL} accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <VoicePoweredOrb colors={colors} level={typeof level === "number" ? level : 0} />
        </div>
      </div>
    </View>
  );
}
