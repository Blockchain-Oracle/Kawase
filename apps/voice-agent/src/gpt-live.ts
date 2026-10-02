// GPT-Live (plan §1.4): OpenAI's full-duplex voice model talks with the person — turn-taking, barge-in and prosody are
// its own — and every request about money or the account is delegated to Kawase ("client" delegation). Kawase runs the
// very same agent turn and thread as chat (`POST /voice/turn`), puts each card on the phone as it arrives, gives
// GPT-Live the turn's canonical facts as silent context (`appendThinking`) and Kawase's own short line to say
// (`appendCommentary`). A readback guard checks what GPT-Live actually said against those facts and corrects it.
import { type JobContext, llm, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";

import {
  GPT_LIVE_APPEND_MAX_CHARS,
  GPT_LIVE_READY_TIMEOUT_MS,
  GPT_LIVE_TRANSCRIPT_SETTLE_MAX_MS,
  GPT_LIVE_TRANSCRIPT_TAIL_MS,
  READBACK_SETTLE_MS,
  type SupportedLocale,
  type VoicePrefs,
} from "@kawase/config";

import type { VoiceEngine } from "./cascade";
import { canonicalFacts, factsOf, readbackProblems, type Facts } from "./readback";
import { runTurn, type Card, type SessionMeta } from "./turn";
import { LANGUAGE_IN_ENGLISH, SORRY } from "./words";

const READY_POLL_MS = 100;
const CONNECT = { maxRetry: 2, retryIntervalMs: 1000, timeoutMs: 10_000 };
const PACE: Record<VoicePrefs["speed"], string> = {
  relaxed: "Speak a little slower than usual, calmly.",
  normal: "Speak at a natural, relaxed pace.",
  brisk: "Speak a little faster than usual, still clearly.",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const clip = (text: string) =>
  text.length > GPT_LIVE_APPEND_MAX_CHARS ? `${text.slice(0, GPT_LIVE_APPEND_MAX_CHARS)}…` : text;

export function persona(locale: SupportedLocale, prefs: VoicePrefs): string {
  const language = LANGUAGE_IN_ENGLISH[locale];
  return [
    "You are the voice of Kawase, a money app on Arc (Circle's stablecoin network). You are warm, calm and brief: one or two short sentences.",
    `Speak ${language} (the person's app language). If the person speaks another language, answer in theirs.`,
    PACE[prefs.speed],
    "You know nothing about Kawase's features, the person's money, contacts, account, limits or anything on Arc. Delegate every request and every question to the client — including what Kawase can do — and wait for its commentary. Only greetings, thanks and goodbyes you may answer yourself.",
    "When commentary arrives, say it in your own words, but keep every amount, asset (USDC, EURC…), recipient, network and status exactly as given. Never state an amount, asset, recipient or network that was not given to you in commentary. Never guess.",
    "Money never moves because of something said aloud: a payment happens only when the person taps its card on screen. Never say something was sent, paid or done unless the commentary says so. If the commentary says a card is ready, tell the person to check and tap the card.",
    "Small talk is fine, briefly. Don't read out addresses or long numbers character by character; the card shows them.",
  ].join("\n");
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  return check();
}

/** Compares what GPT-Live says after each commentary with the turn's facts, once its speech settles. */
class ReadbackGuard {
  private facts: Facts | undefined;
  private line = "";
  private spoken = "";
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly correct: (line: string, problems: string[]) => void) {}

  expect(line: string, facts: string) {
    clearTimeout(this.timer);
    this.facts = factsOf(`${line}\n${facts}`);
    this.line = line;
    this.spoken = "";
  }

  heard(delta: string) {
    if (!this.facts) return;
    this.spoken += delta;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), READBACK_SETTLE_MS);
  }

  private check() {
    const facts = this.facts;
    this.facts = undefined;
    if (!facts || !this.spoken.trim()) return;
    const problems = readbackProblems(this.spoken, facts);
    if (problems.length) this.correct(this.line, problems);
  }

  close() {
    clearTimeout(this.timer);
    this.facts = undefined;
  }
}

export async function startGptLive(input: {
  ctx: JobContext;
  meta: SessionMeta;
  locale: SupportedLocale;
  prefs: VoicePrefs;
  sendCard: (card: Card) => void;
  /** GPT-Live failed for good mid-session: the caller switches to the fallback pipeline. */
  onFatal: (reason: unknown) => void;
}): Promise<VoiceEngine> {
  const { ctx, meta, locale, prefs, sendCard, onFatal } = input;
  const model = new openai.realtime.GPTLiveModel({
    apiKey: required("OPENAI_API_KEY"),
    voice: prefs.voice,
    delegation: "client",
    connOptions: CONNECT,
  });
  // Client delegation requires an agent with no tools: Kawase's tools live behind the delegation.
  const agent = new voice.Agent({ instructions: persona(locale, prefs) });
  const session = new voice.AgentSession({ llm: model, vad: null });
  const close = async () => {
    await session.close().catch(() => undefined);
    await model.close().catch(() => undefined);
  };
  try {
    // Disable LiveKit SDK recording uploads. Provider retention is a separate, still-open dependency.
    await session.start({ agent, room: ctx.room, record: false });
    const live = agent.duplexSession as openai.realtime.GPTLiveSession;
    if (!(await waitUntil(() => live.sessionId !== undefined, GPT_LIVE_READY_TIMEOUT_MS)))
      throw new Error("GPT-Live did not start in time");

    let current: AbortController | undefined;
    const guard = new ReadbackGuard((line, problems) => {
      console.warn("voice readback mismatch", problems);
      live.appendCommentary(clip(`Correct what you just said, briefly. The exact facts are: ${line}`));
    });
    live.on("transcript_delta", ({ text }) => guard.heard(text));
    // KAWASE_VOICE_DEBUG=1 traces the conversation (it includes what was said: never on in production).
    if (process.env.KAWASE_VOICE_DEBUG === "1") {
      live.on("input_speech_started", () => console.info("voice debug: person started speaking"));
      live.on("input_audio_transcription_completed", (event) => {
        if (event.isFinal) console.info(`voice debug: heard "${event.transcript}"`);
      });
      live.on("transcript_delta", ({ text }) => console.info(`voice debug: said "${text}"`));
      live.on("delegation_created", ({ id, pendingTranscript }) =>
        console.info(`voice debug: delegation ${id} "${pendingTranscript}"`),
      );
      session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) =>
        console.info(`voice debug: agent ${event.newState}`),
      );
    }
    live.on("error", (event) => {
      if (event.recoverable) return;
      console.error("GPT-Live failed", event.error);
      onFatal(event.error);
    });

    // What the person has said since the last request Kawase took. GPT-Live can split one question into several speech
    // segments and delegate mid-sentence, so a request waits for the end of the person's speech and joins every
    // segment since the last delegation (the delegation's own transcript can be the last fragment only, or empty).
    // Words GPT-Live answered by itself (a greeting, thanks) are dropped when it starts speaking with nothing delegated.
    const segments = new Map<string, string>();
    let speaking = false;
    let delegationOpen = false;
    live.on("input_speech_started", () => {
      speaking = true;
    });
    live.on("input_speech_stopped", () => {
      speaking = false;
    });
    live.on("input_audio_transcription_completed", (event) => {
      segments.set(event.itemId, event.transcript);
      if (event.isFinal) speaking = false;
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      if (event.newState === "speaking" && !delegationOpen) segments.clear();
    });
    const lastUserText = () =>
      [...agent.chatCtx.items]
        .reverse()
        .find((item): item is llm.ChatMessage => item instanceof llm.ChatMessage && item.role === "user")
        ?.textContent?.trim() ?? "";
    const settledRequest = async (pending: string) => {
      delegationOpen = true;
      await waitUntil(() => !speaking, GPT_LIVE_TRANSCRIPT_SETTLE_MAX_MS);
      await new Promise((resolve) => setTimeout(resolve, GPT_LIVE_TRANSCRIPT_TAIL_MS));
      let text = [...segments.values()]
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" ");
      const fragment = pending.trim();
      if (fragment && !text.includes(fragment)) text = `${text} ${fragment}`.trim();
      segments.clear();
      delegationOpen = false;
      return text || lastUserText();
    };

    live.on("delegation_created", ({ id, pendingTranscript }) => {
      // A newer request replaces an older one still in flight (the person changed their mind or interrupted).
      current?.abort();
      const abort = new AbortController();
      current = abort;
      void (async () => {
        const text = await settledRequest(pendingTranscript);
        if (abort.signal.aborted) return;
        if (!text) {
          live.appendCommentary(SORRY[locale], { delegationId: id });
          return;
        }
        try {
          const turn = await runTurn(meta, { text, key: `gpt-live:${id}`, signal: abort.signal }, { onCard: sendCard });
          if (abort.signal.aborted) return;
          const facts = canonicalFacts(turn.cards);
          const line = turn.text || SORRY[locale];
          if (facts)
            live.appendThinking(
              clip(`Kawase's canonical facts for this answer (exact; never contradict them):\n${facts}`),
              {
                delegationId: id,
              },
            );
          live.appendCommentary(clip(line), { delegationId: id });
          guard.expect(line, facts);
        } catch (error) {
          if (abort.signal.aborted) return;
          console.error("voice turn failed", error);
          live.appendCommentary(SORRY[locale], { delegationId: id });
        }
      })();
    });

    if (prefs.autoSpeak)
      session.generateReply({
        instructions: `Greet the person in one short, warm sentence in ${LANGUAGE_IN_ENGLISH[locale]} and say you're listening.`,
      });
    console.info(`voice: GPT-Live started (${locale}, ${prefs.voice}, session ${live.sessionId})`);
    return {
      stop: async () => {
        current?.abort();
        await session.interrupt({ force: true }).await;
      },
      close: async () => {
        current?.abort();
        guard.close();
        await close();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
