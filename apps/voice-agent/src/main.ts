// Kawase's voice worker (Stage 10, plan §1.4): a LiveKit Agents worker dispatched into the person's room. It talks with
// GPT-Live, OpenAI's full-duplex voice model, and hands every request about money or the account to Kawase's own agent
// — the very same turn as chat, through the api's `POST /voice/turn`, in the same thread. If GPT-Live can't start or
// fails for good, it switches to the fallback pipeline (Scribe → the same agent turn → a chosen TTS voice). Either
// way the cards the turn produces (a send to confirm, an automation to turn on) go to the person's screen over
// LiveKit RPC while the answer is spoken, and a spoken "yes" never approves money — the card does, with Face ID.
//
// The worker is dispatched by name only (the api's session token names it), with the session's voice token and the
// person's Settings → Voice choices in the job's metadata. Run: `pnpm --filter @kawase/voice-agent dev` (local) or
// `start` (production). `KAWASE_VOICE_ENGINE=cascade` forces the fallback pipeline.
import { fileURLToPath } from "node:url";
import { type JobContext, ServerOptions, cli, defineAgent } from "@livekit/agents";
import { config } from "dotenv";

import {
  isSupportedLocale,
  voiceAgentName,
  voicePrefs,
  VOICE_CARD_RPC,
  VOICE_RPC_MAX_BYTES,
  VOICE_STOP_RPC,
  type SupportedLocale,
} from "@kawase/config";

import { startCascade, type VoiceEngine } from "./cascade";
import { startGptLive } from "./gpt-live";
import type { Card, SessionMeta } from "./turn";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const RPC_TIMEOUT_MS = 5000;
const ENGINE = process.env.KAWASE_VOICE_ENGINE === "cascade" ? "cascade" : "gpt-live";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || "{}") as SessionMeta;
    if (!meta.voiceToken) throw new Error("dispatched without a voice token");
    await ctx.connect();
    const locale: SupportedLocale = isSupportedLocale(meta.locale) ? meta.locale : "en";
    const prefs = voicePrefs(meta.voice);

    const sendCard = (card: Card) => {
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

    let active: VoiceEngine | undefined;
    let fellBack = false;
    const fallBack = async (reason: unknown) => {
      if (fellBack) return;
      fellBack = true;
      console.warn("voice: switching to the fallback pipeline", reason);
      await active?.close().catch(() => undefined);
      active = await startCascade({ ctx, meta, locale, prefs, sendCard });
    };

    ctx.room.localParticipant?.registerRpcMethod(VOICE_STOP_RPC, async (data) => {
      if (data.callerIdentity !== meta.identity) throw new Error("unauthorized voice control");
      await active?.stop();
      return "ok";
    });

    if (ENGINE === "cascade") {
      active = await startCascade({ ctx, meta, locale, prefs, sendCard });
      return;
    }
    try {
      active = await startGptLive({ ctx, meta, locale, prefs, sendCard, onFatal: (reason) => void fallBack(reason) });
    } catch (error) {
      await fallBack(error);
    }
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: voiceAgentName(process.env) }));
