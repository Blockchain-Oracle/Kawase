// A voice conversation on the phone (Stage 10, plan §1.4): the api gives a LiveKit room and token (Kawase's voice
// worker is dispatched into the same room), the phone joins over WebRTC with the microphone on, and the shared
// Conversation shows both sides as live captions, moves the orb and puts Kawase's cards on screen. The conversation is
// saved in a chat thread, so typing can pick it up where talking left off.
import { AudioSession, LiveKitRoom } from "@livekit/react-native";
import * as React from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import type { VoiceSession as Session } from "@kawase/api-client";
import { VOICE_START_CUE_MS } from "@kawase/config";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { claimVoiceAudio, cue } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { Conversation, TypeInstead } from "./conversation";
import { isMicrophoneFailure } from "./mic-failure";

export type VoiceSessionProps = {
  /** The orb's level, driven by the conversation. */
  level: SharedValue<number>;
  /** Leave voice for the keyboard, in the same thread. */
  onTypeInstead: (threadId: string | undefined) => void;
  /** End the conversation (the dock's End): the overlay closes. */
  onEnd: () => void;
};

export function VoiceSession({ level, onTypeInstead, onEnd }: VoiceSessionProps) {
  const { t } = useT();
  const [session, setSession] = React.useState<Session>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const closeAudio = React.useRef<() => Promise<void>>(() => Promise.resolve());

  React.useEffect(() => {
    let live = true;
    let release: (() => void) | undefined;
    let startedAudio = false;
    let closing: Promise<void> | undefined;
    setFailed(false);
    setSession(undefined);
    // The start cue plays first and is let finish: claiming the audio for LiveKit stops every interface sound.
    const ready = cue("voiceStart")
      .then(() => new Promise((resolve) => setTimeout(resolve, VOICE_START_CUE_MS)))
      .then(() => claimVoiceAudio())
      .then(async (releaseOwnership) => {
        release = releaseOwnership;
        if (!live) return;
        await AudioSession.startAudioSession();
        startedAudio = true;
      });
    const close = () =>
      (closing ??= (async () => {
        await ready.catch(() => undefined);
        try {
          if (startedAudio) await AudioSession.stopAudioSession();
        } finally {
          release?.();
        }
      })());
    closeAudio.current = close;
    ready
      .then(() => (live ? api.voice.session() : undefined))
      .then((started) => live && setSession(started))
      .catch(() => {
        if (live) setFailed(true);
        void close().catch(() => undefined);
      });
    return () => {
      live = false;
      void close().catch(() => undefined);
    };
  }, [attempt]);

  // The person ended voice (the overlay closed): the end cue plays once LiveKit has given the audio back.
  React.useEffect(
    () => () => {
      void closeAudio
        .current()
        .catch(() => undefined)
        .then(() => cue("voiceEnd"));
    },
    [],
  );

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
        // A refused microphone keeps the room (Kawase still speaks); the conversation offers Settings and typing.
        if (isMicrophoneFailure(error)) return;
        setFailed(true);
        void closeAudio.current().catch(() => undefined);
      }}
    >
      <Conversation level={level} threadId={session.threadId} onTypeInstead={onTypeInstead} onEnd={onEnd} />
    </LiveKitRoom>
  );
}
