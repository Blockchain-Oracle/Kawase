import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from "expo-audio";
import { AudioOwnership } from "./audio-ownership";
import { feedbackPreferences, loadFeedbackPreferences } from "./preferences";

const ownership = new AudioOwnership();
const completed = new Set<string>();
let player: AudioPlayer | undefined;
const foreground = () => AppState.currentState === "active";

AppState.addEventListener("change", (state) => {
  if (state === "active") return;
  ownership.cancelEffects();
  player?.pause(); // keepAudioSessionActive prevents this from deactivating LiveKit's session.
});

/** Stop local playback/configuration before LiveKit takes microphone, speaker and Bluetooth ownership. */
export function claimVoiceAudio() {
  return ownership.claimCommunication(async () => {
    player?.pause();
    await setIsAudioActiveAsync(false);
  });
}

/** Call only after a confirmed result, with its stable identity; history/remounts must not replay feedback. */
export async function confirmedFeedback(identity: string): Promise<void> {
  if (completed.has(identity)) return;
  completed.add(identity);
  try {
    await loadFeedbackPreferences();
  } catch {
    return;
  }
  if (!foreground()) return;
  const preferences = feedbackPreferences();
  if (preferences.haptics && Platform.OS !== "web")
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  if (!preferences.sounds) return;
  await ownership
    .effect(async (stillAllowed) => {
      await setAudioModeAsync({
        playsInSilentMode: false,
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: "mixWithOthers",
      });
      if (!stillAllowed() || !foreground() || !feedbackPreferences().sounds) return;
      await setIsAudioActiveAsync(true);
      if (!stillAllowed() || !foreground() || !feedbackPreferences().sounds) return;
      if (!player) {
        // Metro resolves bundled native assets through a static require.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        player = createAudioPlayer(require("../../assets/audio/confirmed.wav"), { keepAudioSessionActive: true });
        player.addListener("playbackStatusUpdate", (status) => {
          if (!status.didJustFinish) return;
          void ownership
            .effect(async (allowed) => {
              if (allowed() && !player?.playing) await setIsAudioActiveAsync(false);
            })
            .catch(() => undefined);
        });
      }
      await player.seekTo(0);
      if (stillAllowed() && foreground() && feedbackPreferences().sounds) player.play();
    })
    .catch(() => undefined);
}

export function stopInterfaceSounds() {
  ownership.cancelEffects();
  player?.pause();
}
