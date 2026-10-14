// The live conversation under the orb, the same on the phone and on the web (ChatGPT's voice mode, Meta AI's call
// dock and ElevenReader's "Try saying" row, Refero flows 7030 / 12673 / 8983): a status line, the person's words small
// and Kawase's answer large as live captions, a few things to try before the first word (tapping one sends it as
// typed text into the same voice session), Kawase's cards rising as its tools produce them — a send to confirm is
// confirmed on its card, never by a spoken "yes" — and one dock of round controls at the foot: type, mute, stop, end.
// The orb follows whoever is talking (written into a shared value from the audio level, never through React state
// per tick) and swirls slowly while Kawase thinks. The room itself (native or browser) is joined by the platform's
// voice-session file.
import { useLocalParticipant, useRoomContext, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import { Keyboard, Mic, MicOff, Square, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  type SharedValue,
  cancelAnimation,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { MOTION, VOICE_CARD_RPC, VOICE_STOP_RPC } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import {
  CONTROL_FONT_SCALE,
  ELEVATION,
  FONT,
  Icon,
  LiveDot,
  RADIUS,
  SPACE,
  TYPE,
  usePressScale,
  useTheme,
} from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { LiveCaption } from "./live-caption";
import { useVolume } from "./volume";

const IDLE_LEVEL = 0.2;
const SPEAKING_FLOOR = 0.35;
const LISTENING_GAIN = 1.4;
/** Thinking: the orb swirls between these levels, one breath every ~1.6 s. */
const THINK_LOW = 0.24;
const THINK_HIGH = 0.5;
const THINK_HALF_MS = 800;
const STOP_TIMEOUT_MS = 5000;
const CARDS_MAX_HEIGHT = 340;
const SEGMENT_ID = "lk.segment_id";
/** LiveKit Agents reads typed input on this text-stream topic (AgentSession's room input, text enabled by default). */
const CHAT_TOPIC = "lk.chat";
/** A tapped line sits just before whatever is transcribed after it. */
const JUST_BEFORE = 0.5;
const HALF = 2;
const DOCK_BUTTON = 56;
const CAPTION_MAX_WIDTH = 560;
/** Kawase's answer: the screen's one large line. */
const ANSWER = { fontFamily: FONT.sans, fontSize: 24, lineHeight: 32, fontWeight: "600" } as const;

type Card = { toolName: string; toolCallId: string; output?: unknown };
type AgentState = ReturnType<typeof useVoiceAssistant>["state"];
type Line = { id: string; text: string; at: number };

/** The orb's level for the conversation's state and the two voices' loudness (thinking runs its own swirl). */
function orbLevel(state: AgentState, speaking: number, hearing: number) {
  if (state === "speaking") return Math.max(SPEAKING_FLOOR, speaking);
  if (state === "listening") return Math.max(IDLE_LEVEL, Math.min(1, hearing * LISTENING_GAIN));
  return IDLE_LEVEL;
}

export function Conversation({
  level,
  threadId,
  onTypeInstead,
  onEnd,
}: {
  level: SharedValue<number>;
  threadId: string;
  onTypeInstead: (threadId: string) => void;
  onEnd: () => void;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const reduced = useReducedMotionLive();
  const room = useRoomContext();
  const { state, audioTrack, agent } = useVoiceAssistant();
  const { localParticipant, microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const [stopped, setStopped] = React.useState(false);
  const [stopFailed, setStopFailed] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [cards, setCards] = React.useState<Card[]>([]);
  // A suggestion the person tapped: their line until they speak again (`after` = the transcript length when tapped).
  const [typed, setTyped] = React.useState<{ line: Line; after: number }>();

  // The orb follows whoever is talking: the levels land in refs and go straight into the shared value. While Kawase
  // thinks the swirl owns the value, so the microphone's frames don't overwrite it.
  const loud = React.useRef({ speaking: 0, hearing: 0, state });
  loud.current.state = state;
  const drive = React.useCallback(() => {
    const { speaking, hearing, state: now } = loud.current;
    if (now === "thinking") return;
    level.value = orbLevel(now, speaking, hearing);
  }, [level]);
  React.useEffect(() => {
    if (state === "thinking" && !reduced) {
      level.value = withRepeat(
        withSequence(
          withTiming(THINK_HIGH, { duration: THINK_HALF_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(THINK_LOW, { duration: THINK_HALF_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      return () => cancelAnimation(level);
    }
    drive();
    return undefined;
  }, [state, reduced, level, drive]);
  useVolume(audioTrack?.publication?.track, (volume) => {
    loud.current.speaking = volume;
    drive();
  });
  useVolume(microphoneTrack?.track, (volume) => {
    loud.current.hearing = volume;
    drive();
  });

  const stop = async () => {
    if (!agent) return;
    setStopFailed(false);
    try {
      await room.localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: VOICE_STOP_RPC,
        payload: "",
        responseTimeout: STOP_TIMEOUT_MS,
      });
      setStopped(true);
    } catch {
      setStopFailed(true);
    }
  };
  React.useEffect(() => {
    if (state === "thinking" || state === "speaking") setStopped(false);
  }, [state]);

  // The person decides when Kawase listens: one tap mutes the microphone (nothing is heard or sent while muted).
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void localParticipant.setMicrophoneEnabled(!next);
  };

  // A suggestion goes in as typed text: the same turn as speaking it, in the same thread.
  const suggest = (text: string) => {
    const after = transcriptions.length;
    setTyped({ line: { id: `typed:${after}:${text}`, text, at: after - JUST_BEFORE }, after });
    void localParticipant.sendText(text, { topic: CHAT_TOPIC }).catch(() => setTyped(undefined));
  };

  // Kawase's cards, live: each tool's output arrives over RPC while the answer is spoken.
  React.useEffect(() => {
    const participant = room.localParticipant;
    participant.registerRpcMethod(VOICE_CARD_RPC, async (data) => {
      const card = JSON.parse(data.payload) as Card & { fetch?: boolean };
      if (!card.fetch)
        setCards((current) => [...current.filter((entry) => entry.toolCallId !== card.toolCallId), card]);
      return "ok";
    });
    return () => participant.unregisterRpcMethod(VOICE_CARD_RPC);
  }, [room]);

  // Captions: the person's latest line, and Kawase's latest line once it answers that one.
  const own = localParticipant.identity;
  let you: Line | undefined;
  let kawase: Line | undefined;
  transcriptions.forEach((entry, at) => {
    const line = { id: entry.streamInfo.attributes?.[SEGMENT_ID] ?? entry.streamInfo.id, text: entry.text, at };
    if (entry.participantInfo.identity === own) you = line;
    else if (agent && entry.participantInfo.identity === agent.identity) kawase = line;
  });
  // A tapped suggestion stands for the person's line until they speak again; Kawase's reply to it comes after it.
  if (typed && (!you || you.at < typed.after)) you = typed.line;
  const answer = kawase && (!you || kawase.at > you.at) ? kawase : undefined;
  const said = Boolean(you?.text.trim() || answer?.text.trim());

  const busy = state === "thinking" || state === "speaking";
  const label =
    state === "speaking"
      ? t("voice.speaking")
      : state === "thinking"
        ? t("voice.thinking")
        : muted
          ? t("voice.muted")
          : state === "listening" || state === "idle"
            ? t("voice.listening")
            : t("voice.connecting");
  const micBlocked = !muted && (state === "listening" || state === "idle") && !isMicrophoneEnabled;
  const ideas = [t("voice.ideaTrending"), t("voice.ideaSwap"), t("voice.ideaBring"), t("voice.ideaEarn")];

  return (
    <View style={styles.root}>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {muted ? null : <LiveDot tint={busy ? color.accent : undefined} />}
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.text2 }]}>
          {label}
        </Text>
      </View>

      <ScrollView
        style={styles.captions}
        contentContainerStyle={styles.captionsBody}
        showsVerticalScrollIndicator={false}
      >
        {you?.text.trim() ? (
          <LiveCaption id={you.id} text={you.text} textStyle={[TYPE.body, { color: color.text2 }]} />
        ) : null}
        {answer?.text.trim() ? (
          <LiveCaption id={answer.id} text={answer.text} textStyle={[ANSWER, { color: color.ink }]} />
        ) : null}
        {stopped || stopFailed ? (
          <Text accessibilityRole="alert" style={[TYPE.caption, styles.center, { color: color.text2 }]}>
            {stopped ? t("chat.stopped") : t("voice.failed")}
          </Text>
        ) : null}
        {micBlocked ? (
          <View style={styles.blocked}>
            <View style={styles.row}>
              <Icon icon={MicOff} size={16} />
              <Text style={[TYPE.caption, { color: color.ink }]}>
                {t(Platform.OS === "web" ? "voice.micDeniedWeb" : "voice.micDenied")}
              </Text>
            </View>
            {Platform.OS !== "web" ? (
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                <Text style={[TYPE.label, { color: color.accent }]}>{t("voice.openSettings")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!said && !busy ? (
          <Animated.View
            entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)}
            exiting={reduced ? undefined : FadeOut}
            style={styles.ideas}
          >
            <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.text2 }]}>
              {t("voice.trySaying")}
            </Text>
            <View style={styles.ideaRow}>
              {ideas.map((idea) => (
                <Pressable
                  key={idea}
                  accessibilityRole="button"
                  onPress={() => {
                    fire("tick");
                    suggest(idea);
                  }}
                  style={({ pressed }) => [
                    styles.idea,
                    { backgroundColor: pressed ? color.rowPressed : color.raised2 },
                  ]}
                >
                  <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.ink }]}>
                    {idea}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {cards.length > 0 ? (
        <ScrollView style={styles.cards} contentContainerStyle={styles.cardsBody}>
          {cards.map((card) => {
            const part: ToolPart = {
              type: `tool-${card.toolName}`,
              toolCallId: card.toolCallId,
              state: "output-available",
              output: card.output,
            };
            return (
              <Animated.View key={card.toolCallId} entering={reduced ? undefined : FadeInDown.duration(MOTION.sheetMs)}>
                <ToolCard part={part} onToolOutput={() => undefined} />
              </Animated.View>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={[styles.dock, ELEVATION.dock, { backgroundColor: color.glassTint, borderColor: color.glassRim }]}>
        <DockButton icon={Keyboard} label={t("home.typeInstead")} onPress={() => onTypeInstead(threadId)} />
        <DockButton
          icon={muted ? MicOff : Mic}
          label={muted ? t("voice.unmute") : t("voice.mute")}
          selected={muted}
          onPress={toggleMute}
        />
        {busy ? <DockButton icon={Square} label={t("common.stop")} onPress={() => void stop()} /> : null}
        <DockButton icon={X} label={t("voice.end")} tone="end" onPress={onEnd} />
      </View>
    </View>
  );
}

/** One round control in the voice dock: a raised disc, ink when selected (muted), the down colour for End. */
function DockButton({
  icon,
  label,
  onPress,
  selected = false,
  tone,
}: {
  icon: typeof Mic;
  label: string;
  onPress: () => void;
  selected?: boolean;
  tone?: "end";
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const fill = tone === "end" ? color.destructive : selected ? color.ink : color.raised2;
  const ink = tone === "end" ? color.destructiveForeground : selected ? color.ground : color.ink;
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPressIn={() => {
          fire("press");
          press.onPressIn();
        }}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={[styles.dockButton, { backgroundColor: fill }]}
      >
        <Icon icon={icon} size={22} tint={ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: CAPTION_MAX_WIDTH + SPACE.xxl,
    alignSelf: "center",
    alignItems: "center",
    gap: SPACE.md,
  },
  status: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: 20 },
  captions: { flex: 1, alignSelf: "stretch" },
  captionsBody: { alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.sm },
  center: { textAlign: "center" },
  blocked: { alignItems: "center", gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  ideas: { alignItems: "center", gap: SPACE.md, marginTop: SPACE.sm },
  ideaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: SPACE.sm },
  idea: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm + SPACE.xxs, borderRadius: RADIUS.pill },
  cards: { alignSelf: "stretch", maxHeight: CARDS_MAX_HEIGHT },
  cardsBody: { gap: SPACE.md, paddingBottom: SPACE.sm },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.sm,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeInstead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.pill,
  },
  dockButton: {
    width: DOCK_BUTTON,
    height: DOCK_BUTTON,
    borderRadius: DOCK_BUTTON / HALF,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** "Type instead": continue the same thread in the chat (the failure state's way out as well). */
export function TypeInstead({ onPress }: { onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.typeInstead, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={Keyboard} size={18} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.label, { color: color.ink }]}>
        {t("home.typeInstead")}
      </Text>
    </Pressable>
  );
}
