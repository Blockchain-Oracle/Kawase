import type { Room } from "@livekit/rtc-node";

import { turnId, type SessionMeta } from "./turn";

/** Metadata only: no transcript, account information, card contents or tokens. */
export const VOICE_TRACE_TOPIC = "kawase.voice.trace.v1";
export type VoiceTraceEvent = "mic_voiced_frame_received" | "input_transcript_started" | "input_transcript_stopped" | "agent_request_started" | "first_agent_text" | "card_ready" | "progress_commentary_sent" | "agent_response_complete";
export type VoiceTraceMarker = {
  sessionId: string;
  turnId: string;
  sequence: number;
  event: VoiceTraceEvent;
  toolName?: string;
  /** Relative to this turn's first marker; compare only with other worker markers. */
  workerElapsedMs: number;
};

export function traceTurn(room: Room, meta: SessionMeta, key: string) {
  const sessionId = meta.turnNamespace ?? room.name ?? meta.threadId;
  const id = turnId(meta, key);
  const startedAt = performance.now();
  let sequence = 0;
  return (event: VoiceTraceEvent, toolName?: string) => {
    const marker: VoiceTraceMarker = {
      sessionId,
      turnId: id,
      sequence: ++sequence,
      event,
      ...(toolName ? { toolName } : {}),
      workerElapsedMs: Math.round(performance.now() - startedAt),
    };
    void room.localParticipant
      ?.publishData(new TextEncoder().encode(JSON.stringify(marker)), {
        reliable: true,
        destination_identities: [meta.identity],
        topic: VOICE_TRACE_TOPIC,
      })
      .catch((error: unknown) => console.warn("voice trace marker not delivered", error));
  };
}
