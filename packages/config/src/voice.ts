import type { SupportedLocale } from "./locales";

/**
 * Voice (Stage 10; MASTER-PLAN "Voice", context/08-product-research/09-voice-decision): LiveKit carries the audio;
 * speech becomes text (STT), Kawase's own agent answers (the same turn as chat — one brain, one transcript), and the
 * answer is spoken (TTS). Per language: ElevenLabs Scribe v2 realtime hears all ten; ElevenLabs Flash v2.5 speaks
 * eight of them, and OpenAI's TTS speaks Bengali and Urdu, which Flash v2.5 does not (vendor language lists, checked
 * 2026-09-29 in the voice decision).
 */
export const VOICE_AGENT_NAME = "kawase-voice";
/** The agent name to dispatch and register: `KAWASE_VOICE_AGENT` keeps a local worker apart from production's. */
export const voiceAgentName = (env: Record<string, string | undefined>) => env.KAWASE_VOICE_AGENT || VOICE_AGENT_NAME;
/** How long a voice session's LiveKit token and the worker's voice token last. */
export const VOICE_SESSION_TTL_S = 1800;
/** The method the worker calls on the phone to put a card on screen while talking. */
export const VOICE_CARD_RPC = "kawase.card";
export const VOICE_STOP_RPC = "kawase.stop";
/** LiveKit RPC payloads are capped at 15 KiB; a bigger card is fetched from the thread instead. */
export const VOICE_RPC_MAX_BYTES = 14_000;

export type VoiceSpeech = { stt: { model: "scribe_v2_realtime"; language: string }; tts: { provider: "elevenlabs"; model: "eleven_flash_v2_5"; language: string } | { provider: "openai"; model: "gpt-4o-mini-tts"; language: string } };

const eleven = (language: string): VoiceSpeech => ({ stt: { model: "scribe_v2_realtime", language }, tts: { provider: "elevenlabs", model: "eleven_flash_v2_5", language } });
const openai = (language: string): VoiceSpeech => ({ stt: { model: "scribe_v2_realtime", language }, tts: { provider: "openai", model: "gpt-4o-mini-tts", language } });

export const VOICE_SPEECH: Record<SupportedLocale, VoiceSpeech> = {
  en: eleven("en"),
  es: eleven("es"),
  fr: eleven("fr"),
  pt: eleven("pt"),
  ru: eleven("ru"),
  zh: eleven("zh"),
  hi: eleven("hi"),
  ar: eleven("ar"),
  bn: openai("bn"),
  ur: openai("ur"),
};

/**
 * GPT-Live (plan §1.4): OpenAI's full-duplex voice model speaks for Kawase, and every question about money or the
 * account is delegated to Kawase's own agent turn ("client" delegation). The voice names are the ones the installed
 * @livekit/agents-plugin-openai 1.9.1 lists (`GPTLiveVoices`); marin is its default and the narration's voice.
 */
export const GPT_LIVE_VOICES = ["marin", "aster", "beacon", "cinder", "stone", "vesper"] as const;
export type GptLiveVoice = (typeof GPT_LIVE_VOICES)[number];

/** Speaking pace: a TTS speed factor for the fallback pipeline, and a pace hint in GPT-Live's persona. */
export const VOICE_SPEEDS = { relaxed: 0.9, normal: 1, brisk: 1.1 } as const;
export type VoiceSpeed = keyof typeof VOICE_SPEEDS;

/** Settings → Voice. `autoSpeak`: Kawase says hello as soon as voice opens; off, it waits for the person. */
export type VoicePrefs = { voice: GptLiveVoice; speed: VoiceSpeed; autoSpeak: boolean };
export const DEFAULT_VOICE_PREFS: VoicePrefs = { voice: "marin", speed: "normal", autoSpeak: true };

/** Reads stored or received preferences, keeping the default for anything missing or unknown. */
export function voicePrefs(raw: unknown): VoicePrefs {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof VoicePrefs, unknown>>;
  return {
    voice: (GPT_LIVE_VOICES as readonly unknown[]).includes(value.voice) ? (value.voice as GptLiveVoice) : DEFAULT_VOICE_PREFS.voice,
    speed: typeof value.speed === "string" && value.speed in VOICE_SPEEDS ? (value.speed as VoiceSpeed) : DEFAULT_VOICE_PREFS.speed,
    autoSpeak: typeof value.autoSpeak === "boolean" ? value.autoSpeak : DEFAULT_VOICE_PREFS.autoSpeak,
  };
}

/**
 * The fallback pipeline's voices (Scribe → agent → TTS, used when GPT-Live is unavailable): an explicit ElevenLabs
 * premade voice with chosen settings instead of the plugin default (`bIHbv24MWmeRgasZH58o`), and OpenAI's marin
 * (GPT-Live's default voice family) instead of "alloy" for Bengali and Urdu.
 */
export const FALLBACK_ELEVENLABS_VOICE = {
  /** "Sarah", an ElevenLabs premade voice; multilingual with Flash v2.5. */
  id: "EXAVITQu4vr4xnSDxMaL",
  settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
} as const;
export const FALLBACK_OPENAI_VOICE = "marin";

/** GPT-Live must have its session within this time, or the worker falls back to the pipeline. */
export const GPT_LIVE_READY_TIMEOUT_MS = 8000;
/** The readback guard checks what GPT-Live said once its speech has been quiet this long. */
export const READBACK_SETTLE_MS = 1500;
/** GPT-Live caps each appended text at 500 tokens; Kawase keeps its texts well under that. */
export const GPT_LIVE_APPEND_MAX_CHARS = 1500;
