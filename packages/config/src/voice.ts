import type { SupportedLocale } from "./locales";

/**
 * Voice (Stage 10; MASTER-PLAN "Voice", context/08-product-research/09-voice-decision): LiveKit carries the audio;
 * speech becomes text (STT), Kawase's own agent answers (the same turn as chat — one brain, one transcript), and the
 * answer is spoken (TTS). Per language: ElevenLabs Scribe v2 realtime hears all ten; ElevenLabs Flash v2.5 speaks
 * eight of them, and OpenAI's TTS speaks Bengali and Urdu, which Flash v2.5 does not (vendor language lists, checked
 * 2026-09-29 in the voice decision).
 */
export const VOICE_AGENT_NAME = "kawase-voice";
/** How long a voice session's LiveKit token and the worker's voice token last. */
export const VOICE_SESSION_TTL_S = 1800;
/** The method the worker calls on the phone to put a card on screen while talking. */
export const VOICE_CARD_RPC = "kawase.card";
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
