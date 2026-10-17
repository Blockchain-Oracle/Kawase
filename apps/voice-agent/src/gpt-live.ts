// GPT-Live (plan §1.4): OpenAI's full-duplex voice model talks with the person — turn-taking, barge-in and prosody are
// its own — and every request about money or the account is delegated to Kawase ("client" delegation). Kawase runs the
// very same agent turn and thread as chat (`POST /voice/turn`), puts each card on the phone as it arrives, gives
// GPT-Live the turn's canonical facts as silent context (`appendThinking`) and Kawase's own short line to say
// (`appendCommentary`). A readback guard checks what GPT-Live actually said against those facts and corrects it.
import { type JobContext, llm, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { AudioStream, RoomEvent, TrackKind, TrackSource, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "@livekit/rtc-node";

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
import { routeProgress } from "./progress";
import { canonicalFacts, factsOf, readbackProblems, type Facts } from "./readback";
import { traceTurn } from "./trace";
import { runTurn, type Card, type SessionMeta } from "./turn";
import { LANGUAGE_IN_ENGLISH, SORRY } from "./words";

const READY_POLL_MS = 100;
/** What the app sends when the person taps a suggestion or types inside voice mode (LiveKit's chat topic). */
const CHAT_TOPIC = "lk.chat";
const CONNECT = { maxRetry: 2, retryIntervalMs: 1000, timeoutMs: 10_000 };
/** Controlled delivery experiment; the underlying agent, model, voice and prompts stay the same. */
const PROGRESSIVE = process.env.KAWASE_VOICE_PROGRESSIVE === "1";
/** Isolated voice-layer prompt and spoken-estimate experiment (the api reads the same flag for the agent's voice lines). */
const CONVERSATIONAL = process.env.KAWASE_VOICE_CONVERSATIONAL === "1";
/** Timing markers for test/voice-e2e.ts: it decodes the microphone a second time, so it stays off outside tests. */
const TRACE = process.env.KAWASE_VOICE_TRACE === "1";
const TRACE_AUDIO_SAMPLE_RATE = 16_000;
const TRACE_VOICE_THRESHOLD = 600;
const TRACE_SILENCE_SAMPLES = 8_000;
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
    CONVERSATIONAL
      ? "You are the voice of Kawase, a money app on Arc (Circle's stablecoin network). Sound like a responsive conversation: vary your phrasing, pace, pauses, and response length with the person's situation. Be warm and clear. When the person is new to a topic, use everyday words and briefly explain any necessary technical term. Speak while work is pending only when you can add useful context; a short pause is fine."
      : "You are the voice of Kawase, a money app on Arc (Circle's stablecoin network). You are warm, calm and brief: one or two short sentences.",
    `Speak ${language} (the person's app language). If the person speaks another language, answer in theirs.`,
    PACE[prefs.speed],
    ...(CONVERSATIONAL
      ? ["When the voice session opens, a brief natural greeting is welcome if the person's settings allow it. After the person asks a question, a delegated request is silent until client commentary arrives. Do not fill that wait with another greeting, 'sure', 'okay', 'good question', a promise to answer, or a progress claim. When commentary arrives, lead with the specific new fact or answer; continue naturally from anything already said. Stay available for interruptions."]
      : []),
    "You know nothing about Kawase's features, the person's money, contacts, account, limits or anything on Arc. Delegate every request and every question to the client — including what Kawase can do — and wait for its commentary. Only greetings, thanks and goodbyes you may answer yourself.",
    CONVERSATIONAL
      ? "When commentary arrives, continue naturally from what you already said. Keep assets (USDC, EURC…), recipients, networks and status faithful. For a provisional route estimate only, you may use the approximate amount given in commentary with 'about'; the card shows the exact quote. Keep payment, approval and minimum amounts exact. Never add an amount or fact you were not given."
      : "When commentary arrives, say it in your own words, but keep every amount, asset (USDC, EURC…), recipient, network and status exactly as given. Never state an amount, asset, recipient or network that was not given to you in commentary. Never guess.",
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
    // Typed text is taken by our own handler below (the same Kawase turn as speech), not injected as a raw user
    // message: GPT-Live with client delegation closed the session on that ("context_injection_incomplete").
    await session.start({ agent, room: ctx.room, record: false, inputOptions: { textEnabled: false } });
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
    const speechTrace = TRACE ? traceTurn(ctx.room, meta, "input-speech") : undefined;
    // Test-only marker from actual microphone frames. The SDK's input_speech_started event is emitted
    // on the first transcript delta, so it cannot measure when microphone audio first arrived.
    if (speechTrace) {
      const observedTracks = new WeakSet<RemoteTrack>();
      const observeMic = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (participant.identity !== meta.identity || publication.source !== TrackSource.SOURCE_MICROPHONE || track.kind !== TrackKind.KIND_AUDIO || observedTracks.has(track)) return;
        observedTracks.add(track);
        void (async () => {
          let inVoicedSegment = false;
          let quietSamples = 0;
          for await (const frame of new AudioStream(track, TRACE_AUDIO_SAMPLE_RATE, 1)) {
            const voiced = frame.data.some((sample) => Math.abs(sample) > TRACE_VOICE_THRESHOLD);
            if (voiced) {
              if (!inVoicedSegment) speechTrace("mic_voiced_frame_received");
              inVoicedSegment = true;
              quietSamples = 0;
            } else if (inVoicedSegment && (quietSamples += frame.data.length) >= TRACE_SILENCE_SAMPLES) {
              inVoicedSegment = false;
            }
          }
        })().catch((error: unknown) => console.warn("voice mic trace stopped", error));
      };
      ctx.room.on(RoomEvent.TrackSubscribed, observeMic);
      for (const publication of ctx.room.remoteParticipants.get(meta.identity)?.trackPublications.values() ?? [])
        if (publication.track) observeMic(publication.track, publication, ctx.room.remoteParticipants.get(meta.identity)!);
    }
    live.on("input_speech_started", () => {
      speaking = true;
      speechTrace?.("input_transcript_started");
    });
    live.on("input_speech_stopped", () => {
      speaking = false;
      speechTrace?.("input_transcript_stopped");
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

    // One request to Kawase: the turn runs (cards go to the screen as they come), then GPT-Live gets the facts as silent
    // context and Kawase's line to say. A newer request replaces an older one still in flight.
    const answer = async (request: () => Promise<string>, key: string, delegationId?: string) => {
      current?.abort();
      const abort = new AbortController();
      current = abort;
      const options = delegationId ? { delegationId } : undefined;
      const text = await request();
      if (abort.signal.aborted) return;
      if (!text) {
        live.appendCommentary(SORRY[locale], options);
        return;
      }
      try {
        const trace = TRACE ? traceTurn(ctx.room, meta, key) : undefined;
        let firstText = false;
        let progressSent = false;
        let progressLine: string | undefined;
        trace?.("agent_request_started");
        const turn = await runTurn(meta, { text, key, signal: abort.signal }, {
          onCard: (card) => {
            trace?.("card_ready", card.toolName);
            sendCard(card);
            if (!PROGRESSIVE || abort.signal.aborted || firstText || progressSent) return;
            const progress = routeProgress(card, CONVERSATIONAL);
            if (!progress) return;
            progressSent = true;
            progressLine = progress;
            if (!CONVERSATIONAL)
              live.appendThinking(clip(`Provisional route result from the card: ${progress} The final trade quote is still pending.`), options);
            live.appendCommentary(clip(progress), options);
            // The early estimate is checked like the final answer: a misheard amount gets the same spoken correction.
            guard.expect(progress, "");
            trace?.("progress_commentary_sent");
          },
          onText: () => {
            if (firstText) return;
            firstText = true;
            trace?.("first_agent_text");
          },
        });
        trace?.("agent_response_complete");
        if (abort.signal.aborted) return;
        const facts = canonicalFacts(turn.cards);
        const line = turn.text || SORRY[locale];
        if (facts)
          live.appendThinking(
            clip(`Kawase's canonical facts for this answer (exact; never contradict them):\n${facts}`),
            options,
          );
        if (progressSent)
          live.appendThinking(
            "You already spoke the provisional route estimate. Give the final status and next step without repeating the same amount if it is unchanged. If the final amount differs, state the change clearly. Never imply a trade occurred unless the final facts say it did.",
            options,
          );
        live.appendCommentary(clip(line), options);
        guard.expect(line, [facts, progressLine].filter(Boolean).join("\n"));
      } catch (error) {
        if (abort.signal.aborted) return;
        console.error("voice turn failed", error);
        live.appendCommentary(SORRY[locale], options);
      }
    };

    live.on("delegation_created", ({ id, pendingTranscript }) => {
      void answer(() => settledRequest(pendingTranscript), `gpt-live:${id}`, id);
    });

    // GPT-Live keeps time by the person's audio: with no live microphone (denied, none, or muted in the app) nothing
    // arrives, and a typed request's answer never lands ("context_injection_incomplete"). While there is no live
    // microphone, GPT-Live hears silence on its side (`muteInput`); when one is published and unmuted, it listens again.
    let inputMuted = false;
    const micLive = () =>
      [...(ctx.room.remoteParticipants.get(meta.identity)?.trackPublications.values() ?? [])].some(
        (publication) => publication.source === TrackSource.SOURCE_MICROPHONE && publication.muted === false,
      );
    const syncMicrophone = () => {
      const live_ = micLive();
      if (!live_ && !inputMuted) live.muteInput();
      else if (live_ && inputMuted) live.unmuteInput();
      inputMuted = !live_;
    };
    syncMicrophone();
    for (const event of [
      RoomEvent.ParticipantConnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
    ])
      ctx.room.on(event, syncMicrophone);

    // Typed inside voice mode (a tapped suggestion): only the person this session belongs to.
    let typed = 0;
    ctx.room.registerTextStreamHandler(CHAT_TOPIC, (reader, from) => {
      if (from.identity !== meta.identity) return;
      typed += 1;
      void answer(async () => (await reader.readAll()).trim(), `gpt-live:text:${typed}:${Date.now()}`);
    });

    // Settings → Voice "Kawase speaks first" (on by default): a silent room gives the person no cue to start talking.
    if (prefs.autoSpeak)
      session.generateReply({
        // The plugin adds "After that, pause and listen" to this; on the production persona GPT-Live then said "I'm here
        // and listening" twice in a row (10-17), so the ask is concrete: one question, with examples, and the ban apart.
        instructions: `Open the conversation in ${LANGUAGE_IN_ENGLISH[locale]} with one short, friendly sentence that ends in a question inviting the person to talk, like "Hey! How's it going today?" or "Hi! What would you like to do today?" (vary the wording). End on the question. Never say that you are listening or that you are here. Don't use their name.`,
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
