// The conversation's engine: mounted under the room for as long as the conversation lives, whether the full view is
// up or minimised to the island (Abu, 10-16: the agent keeps running in the background). It drives the orb from the two
// voices, takes Kawase's cards as its tools produce them (unseen while the full view is down, so the card sheet can show
// them wherever the person is), and publishes the state, Kawase's latest words, mute and Stop to the voice store.
import { useLocalParticipant, useRoomContext, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import * as React from "react";
import { cancelAnimation, Easing, type SharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { VOICE_CARD_RPC, VOICE_STOP_RPC } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { hasToolCard } from "@/chat/tool-cards";

import { useVolume } from "./volume";
import { voiceStore, type VoiceCard, type VoicePhase } from "./voice-store";

const IDLE_LEVEL = 0.2;
const SPEAKING_FLOOR = 0.35;
const LISTENING_GAIN = 1.4;
/** Thinking: the orb swirls between these levels, one breath every ~1.6 s. */
const THINK_LOW = 0.24;
const THINK_HIGH = 0.5;
const THINK_HALF_MS = 800;
const STOP_TIMEOUT_MS = 5000;

type AgentState = ReturnType<typeof useVoiceAssistant>["state"];

/** The orb's level for the conversation's state and the two voices' loudness (thinking runs its own swirl). */
function orbLevel(state: AgentState, speaking: number, hearing: number) {
  if (state === "speaking") return Math.max(SPEAKING_FLOOR, speaking);
  if (state === "listening") return Math.max(IDLE_LEVEL, Math.min(1, hearing * LISTENING_GAIN));
  return IDLE_LEVEL;
}

function phaseOf(state: AgentState, muted: boolean): VoicePhase {
  if (state === "speaking") return "speaking";
  if (state === "thinking") return "thinking";
  if (muted) return "muted";
  return state === "listening" || state === "idle" ? "listening" : "connecting";
}

export function VoiceEngine({ level, full, threadId }: { level: SharedValue<number>; full: boolean; threadId: string }) {
  const reduced = useReducedMotionLive();
  const room = useRoomContext();
  const { state, audioTrack, agent } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const [muted, setMuted] = React.useState(false);
  const mutedRef = React.useRef(false);
  const fullRef = React.useRef(full);
  fullRef.current = full;

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

  // Kawase's cards, live: each tool's output arrives over RPC while the answer is spoken.
  React.useEffect(() => {
    const participant = room.localParticipant;
    participant.registerRpcMethod(VOICE_CARD_RPC, async (data) => {
      const card = JSON.parse(data.payload) as VoiceCard & { fetch?: boolean };
      // A tool that only answered in words draws no card: it joins the conversation without asking for the person.
      if (!card.fetch) voiceStore.addCard({ toolName: card.toolName, toolCallId: card.toolCallId, output: card.output }, fullRef.current || !hasToolCard(card.toolName));
      return "ok";
    });
    return () => participant.unregisterRpcMethod(VOICE_CARD_RPC);
  }, [room]);

  // The full view shows every card, so bringing it up sees them all.
  React.useEffect(() => {
    if (full) voiceStore.markSeen();
  }, [full]);

  React.useEffect(() => {
    voiceStore.set({ phase: phaseOf(state, muted), muted, threadId });
  }, [state, muted, threadId]);

  // The island's line: Kawase's latest words.
  React.useEffect(() => {
    const own = agent?.identity;
    const latest = own ? [...transcriptions].reverse().find((entry) => entry.participantInfo.identity === own) : undefined;
    voiceStore.set({ caption: latest?.text.trim() ?? "" });
  }, [transcriptions, agent]);

  React.useEffect(() => {
    voiceStore.setActions({
      // The person decides when Kawase listens: one tap mutes the microphone (nothing is heard or sent while muted).
      toggleMute: () => {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        void localParticipant.setMicrophoneEnabled(!next);
      },
      stop: async () => {
        if (!agent) return;
        await localParticipant.performRpc({ destinationIdentity: agent.identity, method: VOICE_STOP_RPC, payload: "", responseTimeout: STOP_TIMEOUT_MS });
      },
    });
    return () => voiceStore.setActions(null);
  }, [localParticipant, agent]);

  // The conversation ended (the room left): the store starts clean for the next one.
  React.useEffect(() => () => voiceStore.reset(), []);

  return null;
}
