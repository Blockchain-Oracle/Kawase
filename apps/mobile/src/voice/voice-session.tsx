// A voice conversation on the phone (Stage 10): the api gives a LiveKit room and token (Kawase's voice worker is
// dispatched into the same room), the phone joins over WebRTC with the microphone on, and the orb follows the
// conversation — the person's voice while it listens, Kawase's while it speaks. What Kawase says is shown as words;
// the cards its tools produce arrive over RPC and appear here, live, the same cards as in chat — a send to confirm is
// confirmed on its card with Face ID, never by a spoken "yes". The conversation is saved in a chat thread, so typing
// can pick it up where talking left off.
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
  useTrackVolume,
  useVoiceAssistant,
} from "@livekit/react-native";
import { Keyboard, Mic, MicOff, Square } from "lucide-react-native";
import * as React from "react";
import { Linking, ScrollView, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import type { VoiceSession as Session } from "@kawase/api-client";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { VOICE_CARD_RPC, VOICE_STOP_RPC } from "@kawase/config";

import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const IDLE_LEVEL = 0.2;
const SPEAKING_FLOOR = 0.35;
const LISTENING_GAIN = 1.4;

type Card = { toolName: string; toolCallId: string; output?: unknown };

export type VoiceSessionProps = {
  /** The orb's level, driven by the conversation. */
  level: SharedValue<number>;
  /** Leave voice for the keyboard, in the same thread. */
  onTypeInstead: (threadId: string | undefined) => void;
};

export function VoiceSession({ level, onTypeInstead }: VoiceSessionProps) {
  const { t } = useT();
  const [session, setSession] = React.useState<Session>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setFailed(false);
    void AudioSession.startAudioSession();
    api.voice
      .session()
      .then((started) => live && setSession(started))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      void AudioSession.stopAudioSession();
    };
  }, [attempt]);

  if (failed) {
    return (
      <View className="items-center gap-3">
        <Text className="text-foreground text-center text-base">{t("voice.failed")}</Text>
        <Button variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
          <Text>{t("common.retry")}</Text>
        </Button>
        <TypeInstead onPress={() => onTypeInstead(undefined)} />
      </View>
    );
  }
  if (!session) return <StateLabel>{t("voice.connecting")}</StateLabel>;
  return (
    <LiveKitRoom
      serverUrl={session.url}
      token={session.token}
      connect
      audio
      video={false}
      onError={() => setFailed(true)}
    >
      <Conversation level={level} threadId={session.threadId} onTypeInstead={onTypeInstead} />
    </LiveKitRoom>
  );
}

function Conversation({
  level,
  threadId,
  onTypeInstead,
}: {
  level: SharedValue<number>;
  threadId: string;
  onTypeInstead: (threadId: string) => void;
}) {
  const { t } = useT();
  const room = useRoomContext();
  const { state, audioTrack, agentTranscriptions, agent } = useVoiceAssistant();
  const [stopped, setStopped] = React.useState(false);
  const [stopFailed, setStopFailed] = React.useState(false);
  const stop = async () => {
    if (!agent) return;
    setStopFailed(false);
    try {
      await room.localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: VOICE_STOP_RPC,
        payload: "",
        responseTimeout: 5000,
      });
      setStopped(true);
    } catch {
      setStopFailed(true);
    }
  };
  React.useEffect(() => {
    if (state === "thinking" || state === "speaking") setStopped(false);
  }, [state]);
  const { localParticipant, microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  // The person decides when Kawase listens: one tap mutes the microphone (nothing is heard or sent while muted).
  const [muted, setMuted] = React.useState(false);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void localParticipant.setMicrophoneEnabled(!next);
  };
  const speaking = useTrackVolume(audioTrack);
  const hearing = useTrackVolume(microphoneTrack?.track as never);
  const [cards, setCards] = React.useState<Card[]>([]);

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

  // The orb follows whoever is talking.
  React.useEffect(() => {
    level.value =
      state === "speaking"
        ? Math.max(SPEAKING_FLOOR, speaking)
        : state === "listening"
          ? Math.max(IDLE_LEVEL, Math.min(1, hearing * LISTENING_GAIN))
          : IDLE_LEVEL;
  }, [state, speaking, hearing, level]);

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
  const said = agentTranscriptions.at(-1)?.text ?? "";
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
      {said ? (
        <Text className="text-foreground text-center text-lg leading-7" numberOfLines={4}>
          {said}
        </Text>
      ) : null}
      {micBlocked ? (
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-2">
            <Icon as={MicOff} className="text-foreground size-4" />
            <Text className="text-foreground text-sm">{t("voice.micDenied")}</Text>
          </View>
          <Button variant="secondary" size="sm" onPress={() => void Linking.openSettings()}>
            <Text>{t("voice.openSettings")}</Text>
          </Button>
        </View>
      ) : null}
      {cards.length > 0 ? (
        <ScrollView className="w-full" contentContainerClassName="gap-3 pb-2" style={{ maxHeight: 360 }}>
          {cards.map((card) => {
            const part: ToolPart = {
              type: `tool-${card.toolName}`,
              toolCallId: card.toolCallId,
              state: "output-available",
              output: card.output,
            };
            return <ToolCard key={card.toolCallId} part={part} onToolOutput={() => undefined} />;
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

function TypeInstead({ onPress }: { onPress: () => void }) {
  const { t } = useT();
  return (
    <Button variant="secondary" onPress={onPress}>
      <Icon as={Keyboard} className="size-5" />
      <Text className={cn(TEXT_START)}>{t("home.typeInstead")}</Text>
    </Button>
  );
}
