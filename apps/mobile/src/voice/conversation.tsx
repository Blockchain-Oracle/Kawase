// The live conversation inside the voice overlay, the same on the phone and on the web: live captions of both sides
// (what the person said, then Kawase's answer, word by word), the orb following whoever is talking (written into a
// shared value from the audio level, never through React state per tick), Kawase's cards rising as its tools produce
// them — a send to confirm is confirmed on its card with Face ID, never by a spoken "yes" — and Stop, Mute and
// "Type instead". The room itself (native or browser) is joined by the platform's voice-session file.
import { useLocalParticipant, useRoomContext, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import { Keyboard, Mic, MicOff, Square } from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, ScrollView, View } from "react-native";
import Animated, { FadeInDown, type SharedValue } from "react-native-reanimated";

import { MOTION, VOICE_CARD_RPC, VOICE_STOP_RPC } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import { useT } from "@/i18n";

import { LiveCaption } from "./live-caption";
import { useVolume } from "./volume";

const IDLE_LEVEL = 0.2;
const SPEAKING_FLOOR = 0.35;
const LISTENING_GAIN = 1.4;
const STOP_TIMEOUT_MS = 5000;
const CARDS_MAX_HEIGHT = 360;
const SEGMENT_ID = "lk.segment_id";

type Card = { toolName: string; toolCallId: string; output?: unknown };
type AgentState = ReturnType<typeof useVoiceAssistant>["state"];

/** The orb's level for the conversation's state and the two voices' loudness. */
function orbLevel(state: AgentState, speaking: number, hearing: number) {
  if (state === "speaking") return Math.max(SPEAKING_FLOOR, speaking);
  if (state === "listening") return Math.max(IDLE_LEVEL, Math.min(1, hearing * LISTENING_GAIN));
  return IDLE_LEVEL;
}

export function Conversation({
  level,
  threadId,
  onTypeInstead,
}: {
  level: SharedValue<number>;
  threadId: string;
  onTypeInstead: (threadId: string) => void;
}) {
  const { t } = useT();
  const reduced = useReducedMotionLive();
  const room = useRoomContext();
  const { state, audioTrack, agent } = useVoiceAssistant();
  const { localParticipant, microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const [stopped, setStopped] = React.useState(false);
  const [stopFailed, setStopFailed] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [cards, setCards] = React.useState<Card[]>([]);

  // The orb follows whoever is talking: the levels land in refs and go straight into the shared value.
  const loud = React.useRef({ speaking: 0, hearing: 0, state });
  loud.current.state = state;
  const drive = React.useCallback(() => {
    const { speaking, hearing, state: now } = loud.current;
    level.value = orbLevel(now, speaking, hearing);
  }, [level]);
  React.useEffect(drive, [state, drive]);
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
  let you: { id: string; text: string; at: number } | undefined;
  let kawase: { id: string; text: string; at: number } | undefined;
  transcriptions.forEach((entry, at) => {
    const line = { id: entry.streamInfo.attributes?.[SEGMENT_ID] ?? entry.streamInfo.id, text: entry.text, at };
    if (entry.participantInfo.identity === own) you = line;
    else if (agent && entry.participantInfo.identity === agent.identity) kawase = line;
  });
  const answer = kawase && (!you || kawase.at > you.at) ? kawase : undefined;

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

  return (
    <View className="w-full flex-1 items-center gap-3">
      <StateLabel>{label}</StateLabel>
      {stopped ? (
        <Text accessibilityRole="alert" className="text-muted-foreground text-center text-sm">
          {t("chat.stopped")}
        </Text>
      ) : null}
      {stopFailed ? (
        <Text accessibilityRole="alert" className="text-muted-foreground text-center text-sm">
          {t("voice.failed")}
        </Text>
      ) : null}
      {you?.text.trim() ? (
        <LiveCaption id={you.id} text={you.text} textClassName="text-muted-foreground text-base" />
      ) : null}
      {answer?.text.trim() ? (
        <LiveCaption id={answer.id} text={answer.text} textClassName="text-foreground text-lg leading-7" />
      ) : null}
      {micBlocked ? (
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-2">
            <Icon as={MicOff} className="text-foreground size-4" />
            <Text className="text-foreground text-sm">
              {t(Platform.OS === "web" ? "voice.micDeniedWeb" : "voice.micDenied")}
            </Text>
          </View>
          {Platform.OS !== "web" ? (
            <Button variant="secondary" size="sm" onPress={() => void Linking.openSettings()}>
              <Text>{t("voice.openSettings")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
      {cards.length > 0 ? (
        <ScrollView className="w-full" contentContainerClassName="gap-3 pb-2" style={{ maxHeight: CARDS_MAX_HEIGHT }}>
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
      <View className="flex-row items-center gap-3">
        {state === "thinking" || state === "speaking" ? (
          <Button
            variant="secondary"
            size="icon"
            className="size-12"
            accessibilityLabel={t("common.stop")}
            onPress={() => void stop()}
          >
            <Icon as={Square} className="size-5" />
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          className="size-12"
          accessibilityLabel={muted ? t("voice.unmute") : t("voice.mute")}
          accessibilityState={{ selected: muted }}
          onPress={toggleMute}
        >
          <Icon as={muted ? MicOff : Mic} className="size-5" />
        </Button>
        <TypeInstead onPress={() => onTypeInstead(threadId)} />
      </View>
    </View>
  );
}

export function TypeInstead({ onPress }: { onPress: () => void }) {
  const { t } = useT();
  return (
    <Button variant="secondary" onPress={onPress}>
      <Icon as={Keyboard} className="size-5" />
      <Text className={cn(TEXT_START)}>{t("home.typeInstead")}</Text>
    </Button>
  );
}
