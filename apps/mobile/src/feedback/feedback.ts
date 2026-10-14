// Interface sound and haptics (plan §1.5, decision X18). Sounds are short original cues (ElevenLabs SFX, normalised
// to -22 LUFS) that follow the silent switch like any iOS app; they play for deliberate moments — a send, money
// arriving, a confirmed outcome, voice starting and stopping, the fan opening, an error — never on every tap. Outcome
// cues carry a stable identity so history or a remount can't replay them. The onboarding narration plays here too.
// All playback goes through the audio ownership lock, so nothing here can fight LiveKit for the microphone, speaker
// or Bluetooth route.
import { AppState, Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from "expo-audio";
import { MOTION, MS_PER_SECOND } from "@kawase/config";
import { AudioOwnership } from "./audio-ownership";
import { CUE_MASTER, CUE_MIX, RENDERED_CUES } from "./cue-sources";
import { type HapticEvent, playHaptic } from "./haptics";
import { feedbackPreferences, loadFeedbackPreferences } from "./preferences";

/** The recorded outcome cues (the older files) plus the synthesised interface cues (`cue-sources.ts`). */
export type Cue =
  | "confirmed"
  | "send"
  | "received"
  | "voiceStart"
  | "voiceEnd"
  | "fanOpen"
  | "error"
  | "tap"
  | "toggle"
  | "sheetOpen"
  | "sheetClose"
  | "agentStep"
  | "agentDone"
  /** A story scene settling (onboarding), soft and short. */
  | "scene";

// Metro resolves bundled native assets through static requires.
/* eslint-disable @typescript-eslint/no-require-imports */
const CUE_ASSETS: Record<Cue, number> = {
  confirmed: require("../../assets/audio/confirmed.wav"),
  send: require("../../assets/audio/send.wav"),
  received: require("../../assets/audio/received.wav"),
  voiceStart: require("../../assets/audio/voice-start.wav"),
  voiceEnd: require("../../assets/audio/voice-end.wav"),
  fanOpen: require("../../assets/audio/fan-open.wav"),
  error: require("../../assets/audio/error.wav"),
  ...RENDERED_CUES,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The haptic word that goes with each cue when the cue is played on its own (see `cue`). */
const CUE_HAPTIC: Partial<Record<Cue, HapticEvent>> = {
  confirmed: "filled",
  received: "filled",
  error: "fail",
  send: "press",
  fanOpen: "confirm",
  voiceStart: "close",
  agentStep: "agentStep",
  agentDone: "agentDone",
};

/** Senryo's `success` cue level (`@senryo/tokens` SOUND_MIX). */
const SENRYO_SUCCESS_MIX = 0.45;
/** Senryo's levels for its files (assets/audio/README.md): its UI palette's volumes, and its cue mix under the master. */
const RECORDED_VOLUME: Partial<Record<Cue, number>> = {
  send: 0.28,
  received: 0.3,
  error: 0.4,
  voiceStart: 0.35,
  confirmed: CUE_MASTER * SENRYO_SUCCESS_MIX,
  fanOpen: CUE_MASTER * CUE_MIX.sheetOpen,
  voiceEnd: CUE_MASTER * CUE_MIX.sheetClose,
};

/** The level of each cue, so the palette sits together. */
const cueVolume = (name: Cue): number => RECORDED_VOLUME[name] ?? (name in CUE_MIX ? CUE_MASTER * CUE_MIX[name as keyof typeof CUE_MIX] : 1);

const ownership = new AudioOwnership();
const completed = new Set<string>();
/** Each cue's players. A hot cue (an agent step, a toggle, a tap) has two, played in turn, so a second cue a moment
 * after the first does not wait for the first to rewind (Senryo's pool); the rest have one. */
const players = new Map<Cue, AudioPlayer[]>();
const turn = new Map<Cue, number>();
const HOT_CUES: ReadonlySet<Cue> = new Set<Cue>(["agentStep", "tap", "toggle", "sheetOpen", "sheetClose", "scene"]);
const POOL = 2;
/** The onboarding narrator: one player, one clip at a time (see `narrate`). */
let narrator: AudioPlayer | undefined;
/** Ends the clip in progress as if it had finished, so whatever waits on it moves on. */
let endNarration: (() => void) | undefined;
const foreground = () => AppState.currentState === "active";
const pauseAll = () => {
  players.forEach((pool) => pool.forEach((player) => player.pause()));
  narrator?.pause();
};
const anyPlaying = () =>
  [...players.values()].some((pool) => pool.some((p) => p.playing)) || Boolean(narrator?.playing);

AppState.addEventListener("change", (state) => {
  if (state === "active") return;
  ownership.cancelEffects();
  pauseAll(); // keepAudioSessionActive prevents this from deactivating LiveKit's session.
});

/** Stop local playback/configuration before LiveKit takes microphone, speaker and Bluetooth ownership. */
export function claimVoiceAudio() {
  return ownership.claimCommunication(async () => {
    pauseAll();
    endNarration?.();
    await setIsAudioActiveAsync(false);
  });
}

/** Lets the session go once nothing of ours is playing (other apps' audio comes back up). Native only: on the web
 * an inactive session refuses every later play. */
function releaseSession() {
  if (Platform.OS === "web") return;
  void ownership
    .effect(async (allowed) => {
      if (allowed() && !anyPlaying()) await setIsAudioActiveAsync(false);
    })
    .catch(() => undefined);
}

function poolFor(cue: Cue): AudioPlayer[] {
  const existing = players.get(cue);
  if (existing) return existing;
  const pool = Array.from({ length: HOT_CUES.has(cue) ? POOL : 1 }, () => {
    const player = createAudioPlayer(CUE_ASSETS[cue], { keepAudioSessionActive: true });
    player.volume = cueVolume(cue);
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) releaseSession();
    });
    return player;
  });
  players.set(cue, pool);
  return pool;
}

/** The next player of a cue's pool (they alternate). */
function playerFor(cue: Cue): AudioPlayer {
  const pool = poolFor(cue);
  const next = ((turn.get(cue) ?? -1) + 1) % pool.length;
  turn.set(cue, next);
  return pool[next] as AudioPlayer;
}

let warmed = false;

/**
 * Creates the cue players once, at launch, so the first "sent" or agent step plays on time instead of after a file
 * load. Native only (a browser refuses audio before the first tap, and loading early there buys nothing). Never throws.
 */
export function warmFeedback(): void {
  if (warmed || Platform.OS === "web") return;
  warmed = true;
  void loadFeedbackPreferences().catch(() => undefined);
  try {
    for (const name of Object.keys(CUE_ASSETS) as Cue[]) poolFor(name);
  } catch {
    // A player that cannot load now is created on first use instead.
  }
}

type NarrationEvents = {
  /** The clip is audibly playing. */
  onStart?: () => void;
  /** The clip finished, or could not play at all (voice owns the audio, autoplay refused, a stalled load). */
  onEnd: () => void;
};

/**
 * Speaks one onboarding narration clip (plan §1.5) through the same ownership lock as the cues, so it can never
 * fight LiveKit, and a newer clip replaces the one in progress. Narration is something the person turned on, like a
 * video, so it plays in silent mode and ducks other audio while it speaks. Returns `stop`, which cuts the clip
 * without calling `onEnd` (a swipe, the story losing the screen).
 */
export function narrate(source: number, events: NarrationEvents): () => void {
  endNarration?.();
  let settled = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: { remove: () => void } | undefined;
  const finish = (notify: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    subscription?.remove();
    if (endNarration === end) endNarration = undefined;
    if (notify) events.onEnd();
  };
  const end = () => finish(true);
  endNarration = end;
  const live = () => !settled && foreground();

  void ownership
    .effect(async (stillAllowed) => {
      started = true;
      const allowed = () => stillAllowed() && live();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: "duckOthers",
      });
      if (!allowed()) return end();
      await setIsAudioActiveAsync(true);
      if (!allowed()) return end();
      narrator ??= createAudioPlayer(null, { keepAudioSessionActive: true });
      const player = narrator;
      player.replace(source);
      let announced = false;
      subscription = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          end();
          releaseSession();
          return;
        }
        if (!status.playing || announced) return;
        announced = true;
        events.onStart?.();
        // A clip that stalls part-way still lets the story move on, a little after it should have ended.
        if (status.duration > 0) {
          clearTimeout(timer);
          const remainingMs = (status.duration - status.currentTime) * MS_PER_SECOND;
          timer = setTimeout(end, remainingMs + MOTION.narrationSlackMs);
        }
      });
      player.play();
      timer = setTimeout(() => {
        if (!announced) end();
      }, MOTION.narrationStartTimeoutMs);
    })
    .catch(end)
    .finally(() => {
      // The lock refused the work outright (voice owns the audio): nothing will ever play, so say so.
      if (!started) end();
    });

  return () => {
    if (settled) return;
    finish(false);
    narrator?.pause();
    releaseSession();
  };
}

/**
 * Plays a cue's sound (if sounds are on) and, unless `haptic: false`, the haptic word that goes with it (if haptics are
 * on). Pass `identity` for outcome cues (a confirmed send, money received) so the same result never plays twice; leave
 * it out for momentary cues (send, voice, fan, error). The silent switch applies on iOS (`playsInSilentMode: false`).
 * On the web a browser may refuse a sound before the first tap; that is swallowed like every audio failure.
 */
export async function cue(
  name: Cue,
  identity?: string,
  options: { haptic?: boolean | HapticEvent } = {},
): Promise<void> {
  if (identity) {
    if (completed.has(identity)) return;
    completed.add(identity);
  }
  try {
    await loadFeedbackPreferences();
  } catch {
    return;
  }
  if (!foreground()) return;
  const preferences = feedbackPreferences();
  const haptic = typeof options.haptic === "string" ? options.haptic : CUE_HAPTIC[name];
  if (options.haptic !== false && preferences.haptics && haptic) playHaptic(haptic);
  if (!preferences.sounds) return;
  const web = Platform.OS === "web";
  const allowed = (stillAllowed: () => boolean) => stillAllowed() && foreground() && feedbackPreferences().sounds;
  await ownership
    .effect(async (stillAllowed) => {
      if (!web) {
        await setAudioModeAsync({
          playsInSilentMode: false,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: "mixWithOthers",
        });
        if (!allowed(stillAllowed)) return;
        await setIsAudioActiveAsync(true);
        if (!allowed(stillAllowed)) return;
      }
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
  if (!feedbackPreferences().haptics) return;
  playHaptic(kind === "selection" ? "tick" : "press");
}

/** A haptic word on its own (no sound); what `fire` calls. Respects the person's haptics setting. */
export function hapticFeedback(event: HapticEvent): void {
  if (!feedbackPreferences().haptics) return;
  playHaptic(event);
}

export function stopInterfaceSounds() {
  ownership.cancelEffects();
  pauseAll();
  endNarration?.();
}
