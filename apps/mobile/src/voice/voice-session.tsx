// A voice conversation on the phone (Stage 10, plan §1.4): the api gives a LiveKit room and token (Kawase's voice
// worker is dispatched into the same room), the phone joins over WebRTC with the microphone on, and the shared
// Conversation shows both sides as live captions, moves the orb and puts Kawase's cards on screen. The conversation is
// saved in a chat thread, so typing can pick it up where talking left off.
import { useVoiceAssistant } from "@livekit/components-react";
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
import { useSession } from "@/session/session-provider";

import { Conversation, TypeInstead } from "./conversation";
import { VoiceEngine } from "./voice-engine";
import { greetNextSession, takeVoiceSession } from "./prefetch";
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
      .then(() => (live ? takeVoiceSession(network) : undefined))
      .then((started) => live && setSession(started))
      .catch(() => {
        if (live) setFailed(true);
        void close().catch(() => undefined);
      });
    return () => {
      live = false;
      void close().catch(() => undefined);
    };
  }, [attempt, network]);

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
        // A refused microphone keeps the room (Kawase still speaks); the conversation offers Settings and typing.
        if (isMicrophoneFailure(error)) return;
        setFailed(true);
        void closeAudio.current().catch(() => undefined);
      }}
    >
      {/* The engine runs for the whole conversation; the full view comes and goes with the overlay. */}
      <VoiceEngine level={level} full={full} threadId={session.threadId} />
      {stage(<Conversation threadId={session.threadId} onTypeInstead={onTypeInstead} onEnd={onEnd} />)}
    </LiveKitRoom>
  );
}

/** How long a preview may run if Kawase never finishes its hello. */
const PREVIEW_MAX_MS = 15_000;
const PREVIEW_TAIL_MS = 500;

/** Ends a preview once Kawase has said its hello (or after PREVIEW_MAX_MS). */
function PreviewWatch({ onDone }: { onDone: (ok: boolean) => void }) {
  const { state } = useVoiceAssistant();
  const spoke = React.useRef(false);
  React.useEffect(() => {
    if (state === "speaking") spoke.current = true;
    else if (spoke.current && (state === "listening" || state === "idle")) {
      const timer = setTimeout(() => onDone(true), PREVIEW_TAIL_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, onDone]);
  React.useEffect(() => {
    const timer = setTimeout(() => onDone(spoke.current), PREVIEW_MAX_MS);
    return () => clearTimeout(timer);
  }, [onDone]);
  return null;
}

/**
 * Settings → Voice's speaker (Abu, 10-16: "when I click on it, it just talks"): a quiet room with no microphone, where
 * Kawase says hello in the chosen voice; no overlay, and it hangs up once the hello is over.
 */
export function VoicePreview({ onDone }: { onDone: (ok: boolean) => void }) {
  const [session, setSession] = React.useState<Session>();
  const network = useSession().user?.activeNetwork ?? "testnet";
  React.useEffect(() => {
    let live = true;
    let release: (() => void) | undefined;
    let started = false;
    greetNextSession();
    void claimVoiceAudio()
      .then(async (releaseOwnership) => {
        release = releaseOwnership;
        await AudioSession.startAudioSession();
        started = true;
        return takeVoiceSession(network);
      })
      .then((next) => live && setSession(next))
      .catch(() => live && onDone(false));
    return () => {
      live = false;
      void (started ? AudioSession.stopAudioSession() : Promise.resolve()).finally(() => release?.());
    };
  }, [network, onDone]);
  if (!session) return null;
  return (
    <LiveKitRoom serverUrl={session.url} token={session.token} connect audio={false} video={false} onError={() => onDone(false)}>
      <PreviewWatch onDone={onDone} />
    </LiveKitRoom>
  );
}
