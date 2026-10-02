// Synthetic TTS component measurements only. Never labels first bytes as end-user useful-response latency.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { initializeLogger } from "@livekit/agents";
import * as eleven from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { VOICE_SPEECH, type SupportedLocale } from "@kawase/config";
import { dialogueAudio } from "../src/evaluation/eleven-dialogue";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
initializeLogger({ pretty: false, level: "silent" });
const out = resolve(process.argv[2] ?? "/tmp/kawase-voice-samples-20261002");
await mkdir(out, { recursive: true });
const samples: Record<SupportedLocale, string> = {
  en: "Hi, how can I help? I've prepared a payment of ten USDC to Amina on Arc Testnet. Tap the card to review it. Nothing has been sent.",
  fr: "Bonjour, comment puis-je vous aider ? J’ai préparé un paiement de dix USDC à Amina sur Arc Testnet. Touchez la carte pour le vérifier. Rien n’a été envoyé.",
  es: "Hola, ¿en qué puedo ayudarte? He preparado un pago de diez USDC a Amina en Arc Testnet. Toca la tarjeta para revisarlo. No se ha enviado nada.",
  pt: "Preparei um pagamento de dez USDC para Amina na Arc Testnet. Toque no cartão para revisar. Nada foi enviado.",
  ru: "Подготовлен платёж: десять USDC для Амины в Arc Testnet. Проверьте карточку. Ничего не отправлено.",
  zh: "已准备在 Arc Testnet 向 Amina 支付十个 USDC。请点击卡片查看。尚未发送。",
  hi: "Arc Testnet पर Amina को दस USDC का भुगतान तैयार है। समीक्षा के लिए कार्ड पर टैप करें। कुछ भेजा नहीं गया है।",
  bn: "Arc Testnet-এ Amina-কে দশ USDC-এর পেমেন্ট প্রস্তুত। যাচাই করতে কার্ডে ট্যাপ করুন। কিছু পাঠানো হয়নি।",
  ar: "جهزت دفعة قدرها عشرة USDC إلى أمينة على Arc Testnet. اضغط على البطاقة للمراجعة. لم يُرسل شيء.",
  ur: "Arc Testnet پر Amina کے لیے دس USDC کی ادائیگی تیار ہے۔ جائزے کے لیے کارڈ پر ٹیپ کریں۔ کچھ نہیں بھیجا گیا۔",
};

function wav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const results: unknown[] = [];
let dialogueUnavailable = false;
const candidates = ["baseline", "openai-tts", "eleven-v4-turbo"] as const;
const requested = process.argv[3]?.split(",");
for (const [locale, text] of Object.entries(samples) as [SupportedLocale, string][]) {
  for (const candidate of candidates.filter((entry) => !requested || requested.includes(entry))) {
    if (candidate === "eleven-v4-turbo" && dialogueUnavailable) {
      results.push({
        locale,
        candidate,
        state: "unverified",
        reason: "first dialogue request failed; inspect provider access before retrying",
      });
      continue;
    }
    const began = performance.now();
    let firstAudioMs: number | undefined;
    let rate = 24000;
    const chunks: Buffer[] = [];
    let provider: eleven.TTS | openai.TTS | undefined;
    try {
      if (candidate === "eleven-v4-turbo") {
        for await (const bytes of dialogueAudio({
          text,
          voiceId: "bIHbv24MWmeRgasZH58o",
          apiKey: process.env.ELEVENLABS_API_KEY!,
          signal: AbortSignal.timeout(30_000),
        })) {
          if (bytes.length && firstAudioMs === undefined) firstAudioMs = performance.now() - began;
          chunks.push(Buffer.from(bytes));
        }
      } else {
        const baseline = VOICE_SPEECH[locale].tts;
        provider =
          candidate === "baseline" && baseline.provider === "elevenlabs"
            ? new eleven.TTS({
                apiKey: process.env.ELEVENLABS_API_KEY,
                model: baseline.model,
                languageCode: baseline.language,
                encoding: "pcm_24000",
                enableLogging: false,
              })
            : new openai.TTS({
                apiKey: process.env.OPENAI_API_KEY,
                model: "gpt-4o-mini-tts",
                voice: candidate === "baseline" ? "alloy" : "marin",
              });
        rate = provider.sampleRate;
        const stream = provider.synthesize(text, undefined, AbortSignal.timeout(30_000));
        for await (const audio of stream) {
          if (firstAudioMs === undefined) firstAudioMs = performance.now() - began;
          chunks.push(Buffer.from(audio.frame.data.buffer, audio.frame.data.byteOffset, audio.frame.data.byteLength));
        }
        if (stream.error) throw stream.error;
      }
      if (!chunks.length) throw new Error("No synthesis audio returned");
      const pcm = Buffer.concat(chunks);
      const filename = `${locale}-${candidate}.wav`;
      await writeFile(resolve(out, filename), wav(pcm, rate));
      results.push({
        locale,
        candidate,
        filename,
        input: text,
        characters: text.length,
        firstAudioMs,
        totalMs: performance.now() - began,
        durationMs: (pcm.length / 2 / rate) * 1000,
        state: "synthesis-checked",
        listeningAccepted: false,
      });
      console.info(locale, candidate, "sample saved");
    } catch (error) {
      if (candidate === "eleven-v4-turbo") dialogueUnavailable = true;
      results.push({
        locale,
        candidate,
        state: "failed",
        reason: "synthesis unavailable; no sample accepted",
        errorType: error instanceof Error ? error.name : "unknown",
      });
      console.info(locale, candidate, "synthesis unavailable");
    } finally {
      await provider?.close();
      await writeFile(
        resolve(out, "results.json"),
        JSON.stringify(
          {
            measurement:
              "component request to first decoded audio; includes handshake; not phone useful-response latency",
            rawUserAudio: false,
            totalSessionCost: "unmeasured",
            results,
          },
          null,
          2,
        ),
      );
    }
  }
}
