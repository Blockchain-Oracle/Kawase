// The orb, native: the Skia shader from ui-native, held still whenever it cannot be seen or motion is reduced
// (its screen covered, the app in the background; Codex review R16).
import { VoiceOrb, type VoiceOrbProps } from "@kawase/ui-native/components/voice-orb";

import { useAmbientMotion } from "./use-ambient-motion";

export function Orb({ paused = false, ...props }: VoiceOrbProps) {
  const ambient = useAmbientMotion();
  return <VoiceOrb {...props} paused={paused || !ambient} />;
}
