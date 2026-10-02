// The fallback pipeline (used when GPT-Live is unavailable): ElevenLabs Scribe v2 hears the person in their language,
// Kawase's own agent answers through `llmNode` — a relay to `POST /voice/turn`, the same turn as chat — and the answer
// is spoken with an explicit, chosen voice: ElevenLabs Flash v2.5 with a fixed premade voice and settings, or OpenAI's
// marin for Bengali and Urdu (which Flash v2.5 does not speak).
import { ReadableStream } from "node:stream/web";
import { type JobContext, llm, voice } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";

import {
  FALLBACK_ELEVENLABS_VOICE,
  FALLBACK_OPENAI_VOICE,
  VOICE_SPEECH,
  VOICE_SPEEDS,
  type SupportedLocale,
  type VoicePrefs,
} from "@kawase/config";

import { runTurn, type Card, type SessionMeta } from "./turn";
import { FILLER, GREETING, SORRY } from "./words";

const SERVER_VAD = {
  vadSilenceThresholdSecs: 0.45,
  vadThreshold: 0.5,
  minSpeechDurationMs: 120,
  minSilenceDurationMs: 300,
};
/** Names Scribe should hear as written. */
const KEYTERMS = ["Arc", "Kawase", "USDC", "EURC", "Base", "Arbitrum", "Optimism", "Polygon", "Avalanche", "Ethereum", "Morpho", "Auto-save"];
/** When the agent's first words take longer than this (it is checking something), a short filler is said first. */
const FILLER_AFTER_MS = 1200;

export type VoiceEngine = { stop: () => Promise<void>; close: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Kawase's own agent answers through `llmNode`; the session only needs an LLM to exist. */
class RelayLLM extends llm.LLM {
  label() {
    return "kawase.agent";
  }
  override get model() {
    return "kawase-agent";
  }
  chat(): llm.LLMStream {
    throw new Error("Kawase's agent answers through llmNode");
  }
}

type LlmOutput = Awaited<ReturnType<voice.Agent["llmNode"]>>;
type TurnRelay = (text: string, chatItemId: string) => NonNullable<LlmOutput>;

class KawaseAgent extends voice.Agent {
  constructor(private readonly relay: TurnRelay) {
    super({ instructions: "Kawase", llm: new RelayLLM() });
  }

  override async llmNode(chatCtx: llm.ChatContext): Promise<LlmOutput> {
    const last = [...chatCtx.items]
      .reverse()
      .find((item): item is llm.ChatMessage => item instanceof llm.ChatMessage && item.role === "user");
    const text = last?.textContent?.trim();
    return text ? this.relay(text, last!.id) : null;
  }
}

/** Text is spoken as it arrives; each tool's card goes to the phone while the answer is said. */
function turnRelay(meta: SessionMeta, locale: SupportedLocale, sendCard: (card: Card) => void): TurnRelay {
  return (text, chatItemId) => {
    const abort = new AbortController();
    return new ReadableStream<string | llm.ChatChunk>({
      // The person interrupted: stop the turn on the api too.
      cancel() {
        abort.abort();
      },
      async start(controller) {
        let spoken = false;
        const fillerTimer = setTimeout(() => {
          if (!spoken && !abort.signal.aborted) controller.enqueue(FILLER[locale]);
        }, FILLER_AFTER_MS);
        try {
          await runTurn(
            meta,
            { text, key: chatItemId, signal: abort.signal },
            {
              onText: (delta) => {
                spoken = true;
                controller.enqueue(delta);
              },
              onCard: sendCard,
            },
          );
        } catch (error) {
          if (!abort.signal.aborted) console.error("voice turn failed", error);
        } finally {
          clearTimeout(fillerTimer);
          if (!abort.signal.aborted) {
            if (!spoken) controller.enqueue(SORRY[locale]);
            controller.close();
          }
        }
      },
    });
  };
}

export async function startCascade(input: {
  ctx: JobContext;
  meta: SessionMeta;
  locale: SupportedLocale;
  prefs: VoicePrefs;
  sendCard: (card: Card) => void;
}): Promise<VoiceEngine> {
  const { ctx, meta, locale, prefs, sendCard } = input;
  const speech = VOICE_SPEECH[locale];
  const speed = VOICE_SPEEDS[prefs.speed];
  const elevenKey = required("ELEVENLABS_API_KEY");
  const stt = new elevenlabs.STT({
    apiKey: elevenKey,
    model: speech.stt.model,
    languageCode: speech.stt.language,
    serverVad: SERVER_VAD,
    keyterms: KEYTERMS,
  });
  const tts =
    speech.tts.provider === "elevenlabs"
      ? new elevenlabs.TTS({
          apiKey: elevenKey,
          model: speech.tts.model,
          languageCode: speech.tts.language,
          voiceId: FALLBACK_ELEVENLABS_VOICE.id,
          voiceSettings: { ...FALLBACK_ELEVENLABS_VOICE.settings, speed },
        })
      : new openai.TTS({
          apiKey: required("OPENAI_API_KEY"),
          model: speech.tts.model,
          // gpt-4o-mini-tts speaks marin; the plugin's type list predates it.
          voice: FALLBACK_OPENAI_VOICE as openai.TTSVoices,
          speed,
        });
  const session = new voice.AgentSession({
    stt,
    tts,
    turnHandling: {
      // Scribe's own end-of-speech (server VAD) closes the turn.
      turnDetection: "stt",
      // LiveKit starts the LLM on a final transcript before the turn is confirmed, and throws the work away if the
      // person keeps talking (on by default; docs: agents/logic/turns/tuning). Kawase's turn can call money tools —
      // a send inside the allowance goes at once — so nothing may run speculatively: off.
      preemptiveGeneration: { enabled: false },
      interruption: { enabled: true },
    },
  });
  // Disable LiveKit SDK recording uploads. Speech-provider retention is a separate, still-open dependency.
  await session.start({ agent: new KawaseAgent(turnRelay(meta, locale, sendCard)), room: ctx.room, record: false });
  if (prefs.autoSpeak) session.say(GREETING[locale]);
  console.info(`voice: fallback pipeline started (${locale}, ${speech.tts.provider})`);
  return {
    stop: async () => {
      await session.interrupt({ force: true }).await;
    },
    close: () => session.close(),
  };
}
