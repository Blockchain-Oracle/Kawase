// Settings → Voice's picker (ChatGPT's "Choose a voice", Abu 10-17: "the speaker you click on is mediocre"): one voice
// per page, each its own orb, and the row follows the finger like the onboarding story (`position` is the page as a
// float, so a drag never re-renders React; a flick moves one voice). Landing on a voice plays its sample at once — a
// recording of that very voice from GPT-Live (voice-samples.ts), at the chosen pace — and the orb moves with the
// clip's loudness. The voice you stop on becomes Kawase's voice a moment later. Tap the orb to hear it again or stop
// it; the arrows, the dots and assistive technology move one voice. Reduce Motion: the voices crossfade in place.
import { ChevronLeft, ChevronRight, Check, Play } from "lucide-react-native";
import * as React from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { toast } from "sonner-native";

import { GPT_LIVE_VOICES, VOICE_SPEEDS, type GptLiveVoice, type VoiceSpeed } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { EASE, TIMING } from "@/components/kit/theme";
import { narrate, tapFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { VOICE_SAMPLE_ENVELOPE_MS, VOICE_SAMPLES } from "./voice-samples";

const VOICES = GPT_LIVE_VOICES;
const LAST = VOICES.length - 1;
/** Horizontal travel before a touch becomes a swipe, so a tap on the orb stays a tap. */
const PAN_ACTIVATE = 12;
/** A swipe faster than this (pt/s) moves one voice whatever the distance. */
const FLICK_VELOCITY = 500;
const SETTLE = { damping: 30, stiffness: 250, mass: 0.8, overshootClamping: true } as const;
/** The name and description travel this share of the orb's distance, and are gone this far from the centre. */
const COPY_DEPTH = 0.35;
const COPY_FADE = 0.6;
/** A neighbour's orb shrinks as it leaves the centre, so the one on stage reads as chosen. */
const SIDE_SCALE = 0.72;
const SIDE_FADE = 0.4;
/** The other voices' dots, in their own colours, under the one on stage. */
const DOT_DIM = 0.35;
/** The voice you rest on is saved this long after you stop, so a quick run through the voices saves only the last. */
const SAVE_AFTER_MS = 450;
/** The sample's loudness drives the orb a little under full, so a loud syllable never pins it. */
const LEVEL_GAIN = 0.85;
const ORB_SIZE = 224;
const LONGEST_NAME = VOICES.reduce((a, b) => (b.length > a.length ? b : a));
const PLAY_ICON = 26;

export const voiceName = (voice: string) => voice.charAt(0).toUpperCase() + voice.slice(1);
const DESCRIPTION: Record<GptLiveVoice, string> = {
  marin: "voiceSettings.voiceMarin",
  beacon: "voiceSettings.voiceBeacon",
  cinder: "voiceSettings.voiceCinder",
  stone: "voiceSettings.voiceStone",
  vesper: "voiceSettings.voiceVesper",
};

export function VoicePicker({
  value,
  speed,
  onChange,
}: {
  /** Kawase's voice now (Settings → Voice). */
  value: GptLiveVoice;
  speed: VoiceSpeed;
  /** The person settled on another voice. */
  onChange: (voice: GptLiveVoice) => void;
}) {
  const { t } = useT();
  const { rtl } = useLocale();
  const reduce = useReducedMotionLive();
  const sign = rtl ? -1 : 1;
  const [index, setIndex] = React.useState(() => Math.max(0, VOICES.indexOf(value)));
  const position = useSharedValue(index);
  const width = useSharedValue(1);
  const start = useSharedValue(0);
  const [measured, setMeasured] = React.useState(0);
  const settledAt = React.useRef(index);
  const voice = VOICES[index]!;

  // The sample on now: its voice, when it became audible and at what rate (the orb reads its loudness from these).
  const [playing, setPlaying] = React.useState<{ voice: GptLiveVoice; startedAt: number; rate: number } | null>(null);
  const stopSample = React.useRef<(() => void) | undefined>(undefined);
  const stop = React.useCallback(() => {
    stopSample.current?.();
    stopSample.current = undefined;
    setPlaying(null);
  }, []);
  const play = React.useCallback(
    (next: GptLiveVoice) => {
      stop();
      const sample = VOICE_SAMPLES[next];
      if (!sample) return;
      const rate = VOICE_SPEEDS[speed];
      let heard = false;
      const cut = narrate(sample.source, {
        rate,
        onStart: () => {
          heard = true;
          setPlaying({ voice: next, startedAt: performance.now(), rate });
        },
        onEnd: () => {
          if (stopSample.current === cut) stopSample.current = undefined;
          setPlaying((now) => (now?.voice === next ? null : now));
          // Nothing played: voice owns the audio, or the browser refused it.
          if (!heard) toast.error(t("voice.previewFailed"));
        },
      });
      stopSample.current = cut;
    },
    [speed, stop, t],
  );
  React.useEffect(() => stop, [stop]);

  // A new pace is heard at once on the voice in front of you, if a sample is playing.
  const lastSpeed = React.useRef(speed);
  React.useEffect(() => {
    if (lastSpeed.current === speed) return;
    lastSpeed.current = speed;
    if (playing) play(playing.voice);
  }, [speed, playing, play]);

  // Landing on a voice: play it, and after a beat make it Kawase's voice.
  const landed = React.useCallback(
    (to: number) => {
      if (settledAt.current === to) return;
      settledAt.current = to;
      setIndex(to);
      tapFeedback("selection");
      play(VOICES[to]!);
    },
    [play],
  );
  // The screen hands a new `onChange` each render; a ref keeps the save timer from restarting on those.
  const change = React.useRef(onChange);
  change.current = onChange;
  React.useEffect(() => {
    if (voice === value) return undefined;
    const timer = setTimeout(() => change.current(voice), SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [voice, value]);
  // The saved voice changed from outside (a save that failed and was undone, the account loading): show it.
  React.useEffect(() => {
    const at = VOICES.indexOf(value);
    if (at < 0 || at === settledAt.current) return;
    settledAt.current = at;
    setIndex(at);
    position.set(withTiming(at, { duration: reduce ? TIMING.reducedMotion : TIMING.onboardingScene, easing: EASE }));
  }, [value, position, reduce]);

  const go = React.useCallback(
    (to: number) => {
      const target = Math.max(0, Math.min(LAST, to));
      if (target === settledAt.current) return;
      position.set(
        withTiming(target, { duration: reduce ? TIMING.reducedMotion : TIMING.onboardingScene, easing: EASE }),
      );
      landed(target);
    },
    [landed, position, reduce],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-PAN_ACTIVATE, PAN_ACTIVATE])
    .failOffsetY([-PAN_ACTIVATE, PAN_ACTIVATE])
    .onStart(() => {
      cancelAnimation(position);
      start.set(position.get());
    })
    .onUpdate((e) => {
      if (reduce) return;
      position.set(Math.max(0, Math.min(LAST, start.get() - (sign * e.translationX) / width.get())));
    })
    .onEnd((e) => {
      const velocity = sign * e.velocityX;
      const flick = Math.abs(velocity) > FLICK_VELOCITY ? -Math.sign(velocity) : 0;
      const dragged = Math.round(start.get() - (sign * e.translationX) / width.get());
      const to = Math.max(0, Math.min(LAST, flick === 0 ? dragged : Math.round(start.get()) + flick));
      position.set(reduce ? to : withSpring(to, { ...SETTLE, velocity: -velocity / width.get() }));
      scheduleOnRN(landed, to);
    });

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(1, e.nativeEvent.layout.width);
    width.set(w);
    setMeasured(w);
  };

  const longest = VOICES.map((item) => t(DESCRIPTION[item])).reduce((a, b) => (b.length > a.length ? b : a));
  const name = voiceName(voice);
  const isPlaying = playing?.voice === voice;
  return (
    <View className="items-center gap-4">
      <GestureDetector gesture={pan}>
        <View
          style={styles.stage}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${name}. ${t(DESCRIPTION[voice])}`}
          accessibilityValue={{ text: t("voiceSettings.position", { name, index: index + 1, count: VOICES.length }) }}
          accessibilityHint={t("voiceSettings.pickerHint")}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
          onAccessibilityAction={(e) => {
            const action = e.nativeEvent.actionName;
            if (action === "activate") return isPlaying ? stop() : play(voice);
            go(settledAt.current + (action === "increment" ? 1 : -1));
          }}
        >
          {measured > 0
            ? VOICES.map((item, at) =>
                Math.abs(at - index) <= 1 ? (
                  <VoicePage
                    key={item}
                    voice={item}
                    at={at}
                    position={position}
                    width={measured}
                    sign={sign}
                    reduce={reduce}
                    current={at === index}
                    playing={playing?.voice === item ? playing : null}
                    playLabel={t("voiceSettings.play", { name: voiceName(item) })}
                    stopLabel={t("voiceSettings.stop")}
                    onToggle={() => (playing?.voice === item ? stop() : play(item))}
                  />
                ) : null,
              )
            : null}
        </View>
      </GestureDetector>

      <View style={styles.copyArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Copy name={voiceName(LONGEST_NAME)} description={longest} hidden />
        {measured > 0
          ? VOICES.map((item, at) => (
              <VoiceCopy
                key={item}
                at={at}
                position={position}
                width={measured}
                sign={sign}
                reduce={reduce}
                name={voiceName(item)}
                description={t(DESCRIPTION[item])}
              />
            ))
          : null}
      </View>

      <View className="h-7 items-center justify-center">
        {voice === value ? (
          <View className="bg-secondary flex-row items-center gap-1.5 rounded-full px-3 py-1">
            <Icon as={Check} className="text-foreground size-3.5" />
            <Text className="text-foreground text-xs font-semibold">{t("voiceSettings.selected")}</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          className="size-11 rounded-full"
          accessibilityLabel={t("voiceSettings.previous")}
          disabled={index === 0}
          onPress={() => go(settledAt.current - 1)}
        >
          <Icon as={ChevronLeft} className="text-foreground size-5 rtl:-scale-x-100" />
        </Button>
        <View className="flex-row items-center gap-2">
          {VOICES.map((item, at) => (
            <Pressable
              key={item}
              hitSlop={10}
              onPress={() => go(at)}
              accessibilityRole="button"
              accessibilityLabel={voiceName(item)}
              accessibilityState={{ selected: at === index }}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: tokens.orb.voices[item][0], opacity: at === index ? 1 : DOT_DIM },
                  at === index && styles.dotOn,
                ]}
              />
            </Pressable>
          ))}
        </View>
        <Button
          variant="secondary"
          size="icon"
          className="size-11 rounded-full"
          accessibilityLabel={t("voiceSettings.next")}
          disabled={index === LAST}
          onPress={() => go(settledAt.current + 1)}
        >
          <Icon as={ChevronRight} className="text-foreground size-5 rtl:-scale-x-100" />
        </Button>
      </View>
      <Text className="text-muted-foreground px-6 text-center text-sm">{t("voiceSettings.pickerHint")}</Text>
    </View>
  );
}

/** One voice: its orb, which travels with the page, shrinks as it leaves the centre and moves with its sample. */
function VoicePage({
  voice,
  at,
  position,
  width,
  sign,
  reduce,
  current,
  playing,
  playLabel,
  stopLabel,
  onToggle,
}: {
  voice: GptLiveVoice;
  at: number;
  position: SharedValue<number>;
  width: number;
  sign: number;
  reduce: boolean;
  current: boolean;
  playing: { startedAt: number; rate: number } | null;
  playLabel: string;
  stopLabel: string;
  onToggle: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const offset = at - position.get();
    const away = Math.min(1, Math.abs(offset));
    if (reduce) return { opacity: 1 - away, transform: [{ translateX: 0 }, { scale: 1 }] };
    return { opacity: 1 - away * SIDE_FADE, transform: [{ translateX: offset * width * sign }, { scale: 1 - away * (1 - SIDE_SCALE) }] };
  });
  return (
    <Animated.View pointerEvents={current ? "box-none" : "none"} style={[StyleSheet.absoluteFill, styles.page, style]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? stopLabel : playLabel}
        style={styles.orb}
      >
        <SampleOrb voice={voice} playing={playing} paused={!current} />
        {!playing && current ? (
          <View pointerEvents="none" style={styles.playBadge}>
            <Play size={PLAY_ICON} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The orb, moved by the sample's loudness under the playhead (its own state, so only it re-renders per window). */
function SampleOrb({
  voice,
  playing,
  paused,
}: {
  voice: GptLiveVoice;
  playing: { startedAt: number; rate: number } | null;
  paused: boolean;
}) {
  const [level, setLevel] = React.useState(0);
  React.useEffect(() => {
    const sample = VOICE_SAMPLES[voice];
    if (!playing || !sample) {
      setLevel(0);
      return undefined;
    }
    const timer = setInterval(() => {
      const at = Math.floor(((performance.now() - playing.startedAt) * playing.rate) / VOICE_SAMPLE_ENVELOPE_MS);
      setLevel((sample.envelope[at] ?? 0) * LEVEL_GAIN);
    }, VOICE_SAMPLE_ENVELOPE_MS);
    return () => clearInterval(timer);
  }, [voice, playing]);
  return <Orb colors={tokens.orb.voices[voice]} level={level} paused={paused} />;
}

function VoiceCopy({
  at,
  position,
  width,
  sign,
  reduce,
  name,
  description,
}: {
  at: number;
  position: SharedValue<number>;
  width: number;
  sign: number;
  reduce: boolean;
  name: string;
  description: string;
}) {
  const style = useAnimatedStyle(() => {
    const offset = at - position.get();
    const opacity = Math.max(0, 1 - Math.abs(offset) / COPY_FADE);
    return { opacity, transform: [{ translateX: reduce ? 0 : offset * width * COPY_DEPTH * sign }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Copy name={name} description={description} />
    </Animated.View>
  );
}

/** A voice's name and what it sounds like; `hidden` holds the copy area's height so nothing below jumps. */
function Copy({ name, description, hidden = false }: { name: string; description: string; hidden?: boolean }) {
  return (
    <View className="items-center gap-1 px-6" style={hidden ? styles.sizer : undefined}>
      <Text className="font-display text-foreground text-3xl font-bold">{name}</Text>
      <Text className="text-muted-foreground text-center text-base">{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: "100%", height: ORB_SIZE, overflow: "hidden" },
  page: { alignItems: "center", justifyContent: "center" },
  orb: { width: ORB_SIZE, height: ORB_SIZE, alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingLeft: 3,
  },
  copyArea: { width: "100%", position: "relative", overflow: "hidden" },
  sizer: { opacity: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 22 },
});
