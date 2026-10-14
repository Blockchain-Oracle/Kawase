// One Kawase agent turn for a spoken request: `POST /voice/turn` runs the very same turn as chat, in the session's
// thread, and streams the UI message stream (server-sent events). Text arrives as deltas; each tool's output is a card.
import { createHash } from "node:crypto";

export type SessionMeta = {
  voiceToken: string;
  threadId: string;
  identity: string;
  locale: string;
  network: string;
  turnNamespace?: string;
  /** Settings → Voice, as stored by the api (read with `voicePrefs`). */
  voice?: unknown;
};

export type Card = { toolName: string; toolCallId: string; output: unknown };

export type TurnEvents = {
  onText?: (delta: string) => void;
  onToolCall?: (toolName: string) => void;
  onCard?: (card: Card) => void;
};

export const API_URL = process.env.KAWASE_API_URL ?? "http://localhost:3023";

/** A durable id per spoken turn: the same request (a retry, a reconnect) maps to the same turn on the api. */
export const turnId = (meta: SessionMeta, key: string) =>
  createHash("sha256")
    .update(`${meta.turnNamespace ?? meta.threadId}:${key}`)
    .digest("hex");

/** `preliminary`: a live tool's snapshot (the route race while venues answer); only its final output is a card. */
type StreamChunk = {
  type: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  output?: unknown;
  preliminary?: boolean;
};

export async function runTurn(
  meta: SessionMeta,
  input: { text: string; key: string; signal: AbortSignal },
  events: TurnEvents = {},
): Promise<{ text: string; cards: Card[] }> {
  const startedAt = Date.now();
  const response = await fetch(`${API_URL}/voice/turn`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${meta.voiceToken}`,
      "content-type": "application/json",
      "x-kawase-voice-protocol": "2",
    },
    body: JSON.stringify({ text: input.text, turnId: turnId(meta, input.key) }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) throw new Error(`voice turn ${response.status}`);
  console.info(`voice turn: api answered in ${Date.now() - startedAt} ms`);

  const tools = new Map<string, string>();
  const cards: Card[] = [];
  let text = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done || input.signal.aborted) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      if (!data || data === "[DONE]") continue;
      const chunk = JSON.parse(data) as StreamChunk;
      if (chunk.type === "text-delta" && chunk.delta) {
        if (!text) console.info(`voice turn: first words after ${Date.now() - startedAt} ms`);
        text += chunk.delta;
        events.onText?.(chunk.delta);
      } else if (chunk.type === "tool-input-available" && chunk.toolCallId && chunk.toolName) {
        console.info(`voice turn: ${chunk.toolName} called after ${Date.now() - startedAt} ms`);
        tools.set(chunk.toolCallId, chunk.toolName);
        events.onToolCall?.(chunk.toolName);
      } else if (chunk.type === "tool-output-available" && chunk.toolCallId && chunk.preliminary !== true) {
        // A race yields a snapshot per venue answer: the phone gets the finished race once, never a card per snapshot.
        const card = {
          toolName: tools.get(chunk.toolCallId) ?? "",
          toolCallId: chunk.toolCallId,
          output: chunk.output,
        };
        cards.push(card);
        events.onCard?.(card);
      }
    }
  }
  return { text: text.trim(), cards };
}
