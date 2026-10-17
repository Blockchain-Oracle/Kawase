// Voice in the browser (plan §1.4): the same api session as the phone — a LiveKit room and token, with Kawase's voice
// worker dispatched into it — joined with LiveKit's web client. The browser asks for the microphone, Kawase's voice
// plays through an audio element, and the shared Conversation shows both sides as captions, moves the orb and puts
// Kawase's cards on screen over RPC, exactly as on the phone. Typing is always one tap away.
//
// A microphone the browser refuses (or doesn't have) is not a failed session (see ./mic-failure): the room stays and
// the conversation says how to allow it, with typing beside it. Only a real connection error ends it with "try again".
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import * as React from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import type { VoiceSession as Session } from "@kawase/api-client";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

import { Conversation, TypeInstead } from "./conversation";
import { VoiceEngine } from "./voice-engine";
import { takeVoiceSession } from "./prefetch";
import { isMicrophoneFailure } from "./mic-failure";

export type VoiceSessionProps = {
  /** The orb's level, driven by the conversation's engine. */
  level: SharedValue<number>;
  /** The full view is up (else the conversation runs on in the island). */
  full: boolean;
  /** Draws what the full view shows (connecting, a failure, the conversation) inside the overlay. */
  stage: (content: React.ReactNode) => React.ReactNode;
  /** Leave voice for the keyboard, in the same thread. */
  onTypeInstead: (threadId: string | undefined) => void;
  /** End the conversation (the dock's End). */
  onEnd: () => void;
};

export function VoiceSession({ level, full, stage, onTypeInstead, onEnd }: VoiceSessionProps) {
  const { t } = useT();
  const [session, setSession] = React.useState<Session>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const network = useSession().user?.activeNetwork ?? "testnet";

  React.useEffect(() => {
    let live = true;
    setFailed(false);
    setSession(undefined);
    takeVoiceSession(network)
      .then((started) => live && setSession(started))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt, network]);

  if (failed)
    return stage(
      <View className="items-center gap-3">
        <Text className="text-foreground text-center text-base">{t("voice.failed")}</Text>
        <Button variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
          <Text>{t("common.retry")}</Text>
        </Button>
        <TypeInstead onPress={() => onTypeInstead(undefined)} />
      </View>,
    );
  if (!session) return stage(<StateLabel>{t("voice.connecting")}</StateLabel>);
  return (
    <LiveKitRoom
      serverUrl={session.url}
      token={session.token}
      connect
      audio
      video={false}
      onError={(error) => {
        if (!isMicrophoneFailure(error)) setFailed(true);
      }}
      style={{ display: "contents" }}
    >
      {/* Kawase's voice: one audio element per remote audio track. */}
      <RoomAudioRenderer />
      {/* The engine runs for the whole conversation; the full view comes and goes with the overlay. */}
      <VoiceEngine level={level} full={full} threadId={session.threadId} />
      {stage(<Conversation threadId={session.threadId} onTypeInstead={onTypeInstead} onEnd={onEnd} />)}
    </LiveKitRoom>
  );
}
