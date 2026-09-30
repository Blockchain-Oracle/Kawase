# Language coverage matrix (voice in / voice out)

Purpose: show, per vendor, which of the target languages are documented for speech recognition (STT) and speech synthesis (TTS). The targets are English (Nigerian accent), Nigerian Pidgin, Yoruba, Hausa, Igbo, French, Spanish, Portuguese, Arabic and Chinese.

Sources (raw copies under `.firecrawl/product/voice/`):
- OpenAI: https://developers.openai.com/api/docs/guides/speech-to-text.md, /guides/text-to-speech.md, /guides/live-conversations.md; Whisper language table https://github.com/openai/whisper/blob/main/whisper/tokenizer.py
- Gemini Live: https://ai.google.dev/gemini-api/docs/live-api/capabilities (section "Supported languages")
- ElevenLabs: https://elevenlabs.io/docs/overview/models.md, /overview/capabilities/speech-to-text.md, /help-center/product/eleven-agents/which-languages-can-i-use-with-eleven-agents.md
- Deepgram: https://developers.deepgram.com/docs/flux/language-prompting.md, /docs/models-languages-overview.md, /docs/multilingual-voice-agent.md
- Cartesia: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md, /build-with-cartesia/stt/latest.md
- Hume: https://dev.hume.ai/docs/speech-to-speech-evi/configuration/evi-version.md
- LiveKit turn detector: https://docs.livekit.io/agents/logic/turns/turn-detector.md
- Retell: https://docs.retellai.com/build/language-support.md
- Google Cloud STT: https://cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages, https://cloud.google.com/speech-to-text/v2/docs/chirp_3-model
- Azure Speech: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- Spitch: https://docs.spitch.app/llms-full.txt, /features/transcription.md, /concepts/voices.md
- Intron: https://www.intron.io/ ; https://techcabal.com/2026/03/05/intron-expands-sahara-to-57-languages/
- N-ATLaS: https://huggingface.co/NCAIR1/Yoruba-ASR (and Hausa-ASR, Igbo-ASR, NigerianAccentedEnglish)
- Meta Omnilingual ASR: https://github.com/facebookresearch/omnilingual-asr (`src/omnilingual_asr/models/wav2vec2_llama/lang_ids.py`)

Verified: 2026-09-29

Legend:
- ✅ = listed in the vendor's current docs.
- ❌ = the vendor's list was checked and the language is absent.
- ? = no list published, or the page could not be parsed.
- A tick means *listed*, not *good*. Where a vendor publishes accuracy, it is shown.
- `en-NG` means an explicit Nigerian-English locale or model. Generic English is ✅ for every vendor and is not repeated.

---

## 1. Realtime voice vendors

| Vendor / model | en-NG | Pidgin (pcm) | Yoruba (yo) | Hausa (ha) | Igbo (ig) | fr | es | pt | ar | zh | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **OpenAI Realtime / GPT-Live** (in + out) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | [UNKNOWN]: no language list for `gpt-realtime-2.1` or `gpt-live-1`. GPT-Live extra voices are English and Portuguese (BR) only |
| OpenAI TTS ("follows Whisper") | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] TTS list (includes Swahili; no Nigerian languages) |
| OpenAI Whisper-family STT | ❌ | ❌ | ✅ (`yo`) | ✅ (`ha`) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] Whisper tokenizer. "accuracy varies by language" |
| **Gemini Live** `gemini-3.8-live` (in + out, auto-switch) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ (pt-BR, pt-PT) | ✅ | ✅ (zh-Hans, zh-Hant) | [VERIFIED] 99-language table |
| **ElevenLabs Scribe v2 / v2 Realtime** (STT) | ❌ | ❌ | ✅ **25–50% WER** | ✅ 10–20% WER | ✅ **25–50% WER** | ✅ ≤5% | ✅ ≤5% | ✅ ≤5% | ✅ 10–20% | ✅ 5–10% (cmn) | [VERIFIED] published WER tiers |
| **ElevenLabs Agents TTS** (v3 Conversational / Flash v2.5) | ❌ | ❌ | ❌ | ✅ (v3) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] v3 list. Hausa is also in v4 (90+) |
| **Deepgram** Flux Multilingual (turn-aware STT) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | [VERIFIED] 10 langs |
| Deepgram Nova-3 (STT, no turn-awareness) | ❌ (en-US/AU/GB/IN/NZ) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] |
| Deepgram Aura TTS | ❌ | ❌ | ❌ | ❌ | ❌ | ? | ✅ (en↔es code-switch) | ? | ? | ? | [VERIFIED] for es; others not checked |
| **Cartesia** Sonic-3.6 (TTS, 44 langs) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] |
| Cartesia Ink-2 (STT) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | [VERIFIED] en/fr/hi/ja/es only |
| **Hume** EVI 4-mini | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | [VERIFIED] 11 langs. EVI 3 is English only |
| **LiveKit** audio turn detector | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] 14 langs. Other langs fall back to VAD/STT endpointing [INFERENCE] |
| **Retell** (all providers) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [VERIFIED] no Nigerian entry found on the language page |

## 2. Cloud speech APIs (pluggable into LiveKit or Pipecat)

| Vendor / model | en-NG | pcm | yo | ha | ig | Notes | Status |
|---|---|---|---|---|---|---|---|
| **Google Cloud STT Chirp 3** (V2, `StreamingRecognize` supported) | ❌ not listed | ❌ | ✅ `yo-NG` **Preview** | ✅ `ha-NG` **Preview** | ❌ | fr-FR, es-ES, pt-BR, cmn-Hans-CN are GA; Arabic locales Preview | [VERIFIED] |
| Google Cloud STT Chirp 2 | ❌ | ❌ | ✅ `yo-NG` | ✅ `ha-NG` | ✅ `ig-NG` | Regions include us-central1, europe-west4, asia-southeast1 | [VERIFIED] |
| Google Cloud TTS | ? | ? | ? | ? | ? | The voices page is JS-rendered and was not parsed | [UNKNOWN] |
| **Azure Speech** | ✅ STT `en-NG`; TTS `en-NG-EzinneNeural` (F), `en-NG-AbeoNeural` (M) | ❌ | ❌ | ❌ | ❌ | The only vendor found with an explicit Nigerian-English STT locale **and** Nigerian-English voices | [VERIFIED] |

## 3. Africa-focused and open models

| Vendor / model | en-NG | pcm | yo | ha | ig | Delivery | Status |
|---|---|---|---|---|---|---|---|
| **Spitch** | ✅ (English voices; STT `en`) | ✅ **TTS voices**; STT ? | ✅ STT + TTS | ✅ STT + TTS | ✅ STT + TTS | REST API. STT documented as file upload (≤25 MB); streaming STT [UNKNOWN]. LiveKit Python plugin STT+TTS. $0.00042/s STT, $0.0014/s TTS (temporal) | [VERIFIED] |
| **Intron Sahara v2.5** | ✅ claimed (African-accented English) | ✅ claimed | ✅ claimed | ✅ claimed | ✅ claimed | Vendor claims streaming ASR and TTS, and code-switching across 12 African languages | [REPORTED] (vendor site + press) |
| **N-ATLaS** (NCAIR/Awarri) | ✅ `NigerianAccentedEnglish` | ❌ | ✅ | ✅ | ✅ | Open weights, fine-tunes of `openai/whisper-small`. License "other", gated. Self-host | [VERIFIED] HF API |
| **Meta Omnilingual ASR** | ? | ✅ `pcm_Latn` | ✅ `yor_Latn` | ✅ `hau_Latn` | ✅ `ibo_Latn` | Apache-2.0, 300M to 7B, self-host; realtime latency [UNKNOWN] | [VERIFIED] repo |

## 4. On-device

| Option | Target-language coverage | Status |
|---|---|---|
| Apple `SpeechAnalyzer` / `SFSpeechRecognizer` | Locales are only discoverable at runtime (`supportedLocales`) | [UNKNOWN] for en-NG, yo, ha, ig |
| Android on-device `SpeechRecognizer` (API 31+) | Depends on installed language packs. `expo-speech-recognition.getSupportedLocales()` reports them | [UNKNOWN] per device |
| Whisper on-device (WhisperKit, `whisper.rn`) | Same as the Whisper list: yo and ha listed, ig and pcm not | [VERIFIED] list; on-device quality [UNKNOWN] |

---

## 5. What this means [INFERENCE]

- **French, Spanish, Portuguese, Arabic and Chinese** are well covered by Gemini Live, ElevenLabs, Cartesia (TTS), Deepgram Nova-3 and Google. These can be first-class voice languages at launch.
- **Nigerian-accented English**:
  - Only Azure (`en-NG`) and N-ATLaS name it explicitly. Intron claims it.
  - Everyone else treats it as generic English, which may be fine, but it must be measured with real speakers: amounts, names and "0x" addresses.
- **Hausa** is the best-covered Nigerian language: Gemini Live native audio, ElevenLabs STT (10–20% WER) and TTS, Google Chirp 2/3, Whisper, and Spitch.
- **Yoruba**:
  - Speech in: Gemini Live, Google Chirp (Preview), ElevenLabs (25–50% WER), Spitch.
  - Speech out: only Gemini Live native audio and Spitch.
- **Igbo**:
  - Speech in: ElevenLabs (25–50% WER), Google Chirp 2, Spitch.
  - Speech out: only Spitch among the vendors checked.
- **Nigerian Pidgin** has no mainstream realtime vendor.
  - TTS: Spitch voices.
  - STT: Intron (claimed) or self-hosted Omnilingual `pcm_Latn`.
  - Ship it as **text-first / beta voice**.
- **Money safety** [INFERENCE]: a 25–50% WER is not acceptable for dictating amounts or recipients. For Yoruba, Igbo and Pidgin:
  - Allow voice conversation.
  - Always show a text read-back card for every write, as in `voice-safety-confirmation.md`.
  - Consider numbers-in-English or an on-screen keypad for amounts.
- **UI language and voice language are separate settings** [INFERENCE]. The app UI can be localized in yo, ha, ig and pcm (text) even where voice output is weak. See `i18n.md`.

## 6. Gaps

- OpenAI publishes no language list for Realtime or GPT-Live.
- Google Cloud TTS voices for yo, ha and ig were not parsed.
- Spitch streaming STT, and Pidgin STT.
- Apple and Android locale availability for Nigerian languages.
- **No accuracy test with Nigerian speakers was run.** A bake-off corpus is still needed: amounts, names, addresses, code-switching English↔Yoruba/Pidgin, and noise.
