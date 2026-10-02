// Voice in the browser (plan §1.4): the same api session as the phone — a LiveKit room and token, with Kawase's voice
// worker dispatched into it — joined with LiveKit's web client. The browser asks for the microphone, Kawase's voice
// plays through an audio element, and the shared Conversation shows both sides as captions, moves the orb and puts
// Kawase's cards on screen over RPC, exactly as on the phone. Typing is always one tap away.
//
// A microphone the browser refuses (or doesn't have) is not a failed session: LiveKitRoom reports it through
// `onError`, but the room stays connected and the conversation says how to allow the microphone, with typing beside
// it. Only a real connection error ends the session with "try again".
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { MediaDeviceFailure } from "livekit-client";
import * as React from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import type { VoiceSession as Session } from "@kawase/api-client";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { api } from "@/session/api";

import { Conversation, TypeInstead } from "./conversation";

export type VoiceSessionProps = { level: SharedValue<number>; onTypeInstead: (threadId: string | undefined) => void };

/** getUserMedia's refusals; `getFailure` calls every other named error "Other", so those stay session failures. */
const MIC_FAILURES: ReadonlySet<MediaDeviceFailure> = new Set([
  MediaDeviceFailure.PermissionDenied,
  MediaDeviceFailure.NotFound,
  MediaDeviceFailure.DeviceInUse,
]);
const isMicFailure = (error: Error) => {
  const failure = MediaDeviceFailure.getFailure(error);
  return failure !== undefined && MIC_FAILURES.has(failure);
};

export function VoiceSession({ level, onTypeInstead }: VoiceSessionProps) {
  const { t } = useT();
  const [session, setSession] = React.useState<Session>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setFailed(false);
    setSession(undefined);
    api.voice
      .session()
      .then((started) => live && setSession(started))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
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
      onError={(error) => {
        if (!isMicFailure(error)) setFailed(true);
      }}
      style={{ display: "contents" }}
    >
      {/* Kawase's voice: one audio element per remote audio track. */}
      <RoomAudioRenderer />
      <Conversation level={level} threadId={session.threadId} onTypeInstead={onTypeInstead} />
    </LiveKitRoom>
  );
}
