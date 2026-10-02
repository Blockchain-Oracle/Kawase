// Interface sound and haptics (plan §1.5, decision X18). Sounds are short original cues (ElevenLabs SFX, normalised
// to -22 LUFS) that follow the silent switch like any iOS app; they play for deliberate moments — a send, money
// arriving, a confirmed outcome, voice starting and stopping, the fan opening, an error — never on every tap. Outcome
// cues carry a stable identity so history or a remount can't replay them. All playback goes through the audio
// ownership lock, so nothing here can fight LiveKit for the microphone, speaker or Bluetooth route.
import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from "expo-audio";
import { AudioOwnership } from "./audio-ownership";
import { feedbackPreferences, loadFeedbackPreferences } from "./preferences";

export type Cue = "confirmed" | "send" | "received" | "voiceStart" | "voiceEnd" | "fanOpen" | "error";

// Metro resolves bundled native assets through static requires.
/* eslint-disable @typescript-eslint/no-require-imports */
const CUE_ASSETS: Record<Cue, number> = {
  confirmed: require("../../assets/audio/confirmed.wav"),
  send: require("../../assets/audio/send.mp3"),
  received: require("../../assets/audio/received.mp3"),
  voiceStart: require("../../assets/audio/voice-start.mp3"),
  voiceEnd: require("../../assets/audio/voice-end.mp3"),
  fanOpen: require("../../assets/audio/fan-open.mp3"),
  error: require("../../assets/audio/error.mp3"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The haptic that goes with each cue (played even when sounds are off, if haptics are on). */
const CUE_HAPTIC: Partial<Record<Cue, () => Promise<void>>> = {
  confirmed: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  received: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  send: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  fanOpen: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  voiceStart: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
};

const ownership = new AudioOwnership();
const completed = new Set<string>();
const players = new Map<Cue, AudioPlayer>();
const foreground = () => AppState.currentState === "active";
const pauseAll = () => players.forEach((player) => player.pause());

AppState.addEventListener("change", (state) => {
  if (state === "active") return;
  ownership.cancelEffects();
  pauseAll(); // keepAudioSessionActive prevents this from deactivating LiveKit's session.
});

/** Stop local playback/configuration before LiveKit takes microphone, speaker and Bluetooth ownership. */
export function claimVoiceAudio() {
  return ownership.claimCommunication(async () => {
    pauseAll();
    await setIsAudioActiveAsync(false);
  });
}

function playerFor(cue: Cue): AudioPlayer {
  const existing = players.get(cue);
  if (existing) return existing;
  const player = createAudioPlayer(CUE_ASSETS[cue], { keepAudioSessionActive: true });
  player.addListener("playbackStatusUpdate", (status) => {
    if (!status.didJustFinish) return;
    void ownership
      .effect(async (allowed) => {
        if (allowed() && ![...players.values()].some((p) => p.playing)) await setIsAudioActiveAsync(false);
      })
      .catch(() => undefined);
  });
  players.set(cue, player);
  return player;
}

/**
 * Plays a cue (sound if enabled, haptic if enabled). Pass `identity` for outcome cues (a confirmed send, money
 * received) so the same result never plays twice; leave it out for momentary cues (send, voice, fan, error).
 */
export async function cue(name: Cue, identity?: string): Promise<void> {
  if (identity) {
    if (completed.has(identity)) return;
    completed.add(identity);
  }
  try {
    await loadFeedbackPreferences();
  } catch {
    return;
  }
  if (!foreground() || Platform.OS === "web") return;
  const preferences = feedbackPreferences();
  const haptic = CUE_HAPTIC[name];
  if (preferences.haptics && haptic) void haptic().catch(() => undefined);
  if (!preferences.sounds) return;
  const allowed = (stillAllowed: () => boolean) => stillAllowed() && foreground() && feedbackPreferences().sounds;
  await ownership
    .effect(async (stillAllowed) => {
      await setAudioModeAsync({
        playsInSilentMode: false,
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: "mixWithOthers",
      });
      if (!allowed(stillAllowed)) return;
      await setIsAudioActiveAsync(true);
      if (!allowed(stillAllowed)) return;
      const player = playerFor(name);
      await player.seekTo(0);
      if (allowed(stillAllowed)) player.play();
    })
    .catch(() => undefined);
}

/** Call only after a confirmed result, with its stable identity; history/remounts must not replay feedback. */
export function confirmedFeedback(identity: string): Promise<void> {
  return cue("confirmed", identity);
}

/** A light tick for a deliberate tap (chip, toggle); respects the person's haptics setting. */
export function tapFeedback(kind: "light" | "selection" = "light"): void {
  if (Platform.OS === "web" || !feedbackPreferences().haptics) return;
  const done = kind === "selection" ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void done.catch(() => undefined);
}

export function stopInterfaceSounds() {
  ownership.cancelEffects();
  pauseAll();
}
