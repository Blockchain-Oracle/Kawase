// The orb, web: the WebGL component from ui-web, inside a plain view so the screen file is shared.
import { VoicePoweredOrb } from "@kawase/ui-web/components/ui/voice-powered-orb";
import { View } from "react-native";

import type { VoiceOrbProps } from "@kawase/ui-native/components/voice-orb";

export function Orb({ colors, level, className, accessibilityLabel }: VoiceOrbProps) {
  return (
    <View className={className} accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <div style={{ width: "100%", aspectRatio: "1 / 1" }}>
        <VoicePoweredOrb colors={colors} level={typeof level === "number" ? level : 0} />
      </div>
    </View>
  );
}
