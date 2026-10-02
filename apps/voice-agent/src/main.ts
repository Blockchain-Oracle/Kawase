// Kawase's voice worker (Stage 10; MASTER-PLAN "Voice"): a LiveKit Agents worker that hears the person (ElevenLabs
// Scribe v2 realtime, in their language), asks Kawase's own agent — the very same turn as chat, through the api's
// `POST /voice/turn`, in the same thread — and speaks the answer (ElevenLabs Flash v2.5; OpenAI's TTS for Bengali and
// Urdu). There is no second brain here: `llmNode` is a relay. The cards the turn produces (a send to confirm, an
// automation to turn on) are put on the person's screen over LiveKit RPC while the answer is spoken; a spoken "yes"
// never approves money — the card does, with Face ID.
//
// The worker is dispatched by name only (the api's session token names it), with the session's voice token in the
// job's metadata. Run: `pnpm --filter @kawase/voice-agent dev` (local) or `start` (production).
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ReadableStream } from "node:stream/web";
import { type JobContext, ServerOptions, cli, defineAgent, llm, voice } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { config } from "dotenv";

import {
  voiceAgentName,
  VOICE_CARD_RPC,
  VOICE_STOP_RPC,
  VOICE_RPC_MAX_BYTES,
  VOICE_SPEECH,
  isSupportedLocale,
  type SupportedLocale,
} from "@kawase/config";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const API_URL = process.env.KAWASE_API_URL ?? "http://localhost:3023";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
const RPC_TIMEOUT_MS = 5000;
const SERVER_VAD = {
  vadSilenceThresholdSecs: 0.45,
  vadThreshold: 0.5,
  minSpeechDurationMs: 120,
  minSilenceDurationMs: 300,
};
/** Names Scribe should hear as written. */
const KEYTERMS = [
  "Arc",
  "Kawase",
  "USDC",
  "EURC",
  "Base",
  "Arbitrum",
  "Optimism",
  "Polygon",
  "Avalanche",
  "Ethereum",
  "Morpho",
  "Auto-save",
];
/** When the agent's first words take longer than this (it is checking something), a short filler is said first. */
const FILLER_AFTER_MS = 1200;
const OPENAI_VOICE = "alloy";

/** The first thing the person hears, in their language: the session is live. */
const GREETING: Record<SupportedLocale, string> = {
  en: "Hi, I'm listening.",
  es: "Hola, te escucho.",
  fr: "Bonjour, je vous écoute.",
  pt: "Oi, estou ouvindo.",
  ru: "Привет, я слушаю.",
  zh: "你好，我在听。",
  hi: "नमस्ते, मैं सुन रहा हूँ।",
  bn: "নমস্কার, আমি শুনছি।",
  ar: "مرحباً، أنا أستمع.",
  ur: "سلام، میں سن رہا ہوں۔",
};

type SessionMeta = {
  voiceToken: string;
  threadId: string;
  identity: string;
  locale: string;
  network: string;
  turnNamespace?: string;
};

/** Said while the agent checks something, so the silence is never empty. */
const FILLER: Record<SupportedLocale, string> = {
  en: "One moment. ",
  es: "Un momento. ",
  fr: "Un instant. ",
  pt: "Só um momento. ",
  ru: "Минутку. ",
  zh: "稍等一下。",
  hi: "एक पल। ",
  bn: "এক মুহূর্ত। ",
  ar: "لحظة واحدة. ",
  ur: "ایک لمحہ۔ ",
};

/** Said when a turn ends without an answer (the api or the model failed): never silence. */
const SORRY: Record<SupportedLocale, string> = {
  en: "Sorry, I couldn't do that just now. Please try again.",
  es: "Lo siento, no pude hacerlo ahora. Inténtalo de nuevo.",
  fr: "Désolé, je n'ai pas pu le faire. Réessayez.",
  pt: "Desculpe, não consegui agora. Tente de novo.",
  ru: "Извините, сейчас не получилось. Попробуйте ещё раз.",
  zh: "抱歉，刚才没能完成，请再试一次。",
  hi: "माफ़ कीजिए, अभी नहीं हो पाया। फिर से कोशिश करें।",
  bn: "দুঃখিত, এখন করতে পারিনি। আবার চেষ্টা করুন।",
  ar: "عذراً، لم أتمكن من ذلك الآن. حاول مرة أخرى.",
  ur: "معذرت، ابھی نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
};

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
type TurnRelay = (text: string, turnId: string) => NonNullable<LlmOutput>;

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

/**
 * One spoken turn: the api streams the agent's UI message stream (server-sent events). Text is spoken as it arrives;
 * each tool's output goes to the phone as a card, so it is on screen while the answer is being said.
 */
function turnRelay(
  meta: SessionMeta,
  words: { filler: string; sorry: string },
  sendCard: (card: { toolName: string; toolCallId: string; output: unknown }) => void,
): TurnRelay {
  return (text, turnId) => {
    const abort = new AbortController();
    return new ReadableStream<string | llm.ChatChunk>({
      // The person interrupted: stop the turn on the api too.
      cancel() {
        abort.abort();
      },
      async start(controller) {
        const startedAt = Date.now();
        const tools = new Map<string, string>();
        let spoken = false;
        const fillerTimer = setTimeout(() => {
          if (!spoken && !abort.signal.aborted) controller.enqueue(words.filler);
        }, FILLER_AFTER_MS);
        try {
          const response = await fetch(`${API_URL}/voice/turn`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${meta.voiceToken}`,
              "content-type": "application/json",
              "x-kawase-voice-protocol": "2",
            },
            body: JSON.stringify({
              text,
              turnId: createHash("sha256")
                .update(`${meta.turnNamespace ?? meta.threadId}:${turnId}`)
                .digest("hex"),
            }),
            signal: abort.signal,
          });
          if (!response.ok || !response.body) throw new Error(`voice turn ${response.status}`);
          console.info(`voice turn: api answered in ${Date.now() - startedAt} ms`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done || abort.signal.aborted) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const event of events) {
              const data = event
                .split("\n")
                .find((line) => line.startsWith("data: "))
                ?.slice("data: ".length);
              if (!data || data === "[DONE]") continue;
              const chunk = JSON.parse(data) as {
                type: string;
                delta?: string;
                toolCallId?: string;
                toolName?: string;
                output?: unknown;
              };
              if (chunk.type === "text-delta" && chunk.delta) {
                if (!spoken) console.info(`voice turn: first words after ${Date.now() - startedAt} ms`);
                spoken = true;
                controller.enqueue(chunk.delta);
              } else if (chunk.type === "tool-input-available" && chunk.toolCallId && chunk.toolName) {
                console.info(`voice turn: ${chunk.toolName} called after ${Date.now() - startedAt} ms`);
                tools.set(chunk.toolCallId, chunk.toolName);
              } else if (chunk.type === "tool-output-available" && chunk.toolCallId)
                sendCard({
                  toolName: tools.get(chunk.toolCallId) ?? "",
                  toolCallId: chunk.toolCallId,
                  output: chunk.output,
                });
            }
          }
        } catch (error) {
          if (!abort.signal.aborted) console.error("voice turn failed", error);
        } finally {
          clearTimeout(fillerTimer);
          if (!abort.signal.aborted) {
            if (!spoken) controller.enqueue(words.sorry);
            controller.close();
          }
        }
      },
    });
  };
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || "{}") as SessionMeta;
    if (!meta.voiceToken) throw new Error("dispatched without a voice token");
    await ctx.connect();
    const locale: SupportedLocale = isSupportedLocale(meta.locale) ? meta.locale : "en";
    const speech = VOICE_SPEECH[locale];

    const sendCard = (card: { toolName: string; toolCallId: string; output: unknown }) => {
      let payload = JSON.stringify(card);
      // LiveKit RPC payloads are small; a big card is read from the thread by the phone instead.
      if (Buffer.byteLength(payload) > VOICE_RPC_MAX_BYTES)
        payload = JSON.stringify({
          toolName: card.toolName,
          toolCallId: card.toolCallId,
          threadId: meta.threadId,
          fetch: true,
        });
      void ctx.room.localParticipant
        ?.performRpc({
          destinationIdentity: meta.identity,
          method: VOICE_CARD_RPC,
          payload,
          responseTimeout: RPC_TIMEOUT_MS,
        })
        .catch((error: unknown) => console.warn("card not delivered", error));
    };

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
        ? new elevenlabs.TTS({ apiKey: elevenKey, model: speech.tts.model, languageCode: speech.tts.language })
        : new openai.TTS({ apiKey: required("OPENAI_API_KEY"), model: speech.tts.model, voice: OPENAI_VOICE });
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
    ctx.room.localParticipant?.registerRpcMethod(VOICE_STOP_RPC, async (data) => {
      if (data.callerIdentity !== meta.identity) throw new Error("unauthorized voice control");
      await session.interrupt({ force: true }).await;
      return "ok";
    });
    // Disable LiveKit SDK recording uploads. Speech-provider retention is a separate, still-open dependency.
    await session.start({
      agent: new KawaseAgent(turnRelay(meta, { filler: FILLER[locale], sorry: SORRY[locale] }, sendCard)),
      room: ctx.room,
      record: false,
    });
    session.say(GREETING[locale]);
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: voiceAgentName(process.env) }));
