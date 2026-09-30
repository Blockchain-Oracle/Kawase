# Realtime voice options (two-way, interruptible, tool-calling)

Purpose: compare current (Sept 2026) realtime voice stacks and client libraries for an interruptible, tool-calling money agent on iOS, Android (Expo/React Native), web and desktop, and recommend a stack.

Sources (raw copies under `.firecrawl/product/voice/`):
- OpenAI: https://developers.openai.com/api/docs/guides/realtime.md, /guides/live.md, /guides/voice-agents.md, /guides/realtime-conversations.md, /guides/live-conversations.md, /guides/live-delegation.md, /models/gpt-live-1.md, /models/gpt-realtime-2.1.md, /models.md, /pricing.md, /guides/speech-to-text.md, /guides/text-to-speech.md
- Google: https://ai.google.dev/gemini-api/docs/live-api, /live-api/capabilities, /live-api/session-management, /models/gemini-3.8-live, /ephemeral-tokens, /pricing; https://firebase.google.com/docs/ai-logic/live-api
- ElevenLabs: https://elevenlabs.io/docs/overview/models.md, /eleven-agents/customization/voice/customization/language.md, /help-center/product/eleven-agents/which-languages-can-i-use-with-eleven-agents.md, /eleven-agents/libraries/react-native.md, /eleven-agents/guides/integrations/expo-react-native.md, /eleven-agents/libraries/swift.md, /eleven-agents/libraries/kotlin.md, /overview/capabilities/speech-to-text.md
- Deepgram: https://developers.deepgram.com/docs/multilingual-voice-agent.md, /docs/flux/language-prompting.md, /docs/models-languages-overview.md, https://deepgram.com/pricing
- Cartesia: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md, /build-with-cartesia/stt/latest.md, /agents/introduction.md
- Hume: https://dev.hume.ai/docs/speech-to-speech-evi/configuration/evi-version.md, /configuration/timeouts.md
- LiveKit: https://docs.livekit.io/llms.txt, /agents/logic/turns.md, /agents/logic/turns/turn-detector.md, /agents/models.md, /frontends.md, /agents/models/stt/spitch.md, /agents/models/tts/spitch.md, https://livekit.io/pricing
- Pipecat: https://docs.pipecat.ai/overview/clients.md
- Vapi: https://docs.vapi.ai/billing/pricing-and-success-packages.md, https://docs.vapi.ai/llms.txt
- Retell: https://docs.retellai.com/build/language-support.md, https://www.retellai.com/pricing
- On-device: https://github.com/jamsch/expo-speech-recognition (README), https://developer.apple.com/documentation/speech/speechanalyzer, https://developer.android.com/reference/android/speech/SpeechRecognizer, https://github.com/argmaxinc/WhisperKit, npm `whisper.rn`
- npm registry (`npm view <pkg> version`, run 2026-09-29): `.firecrawl/product/voice/npm-versions.txt`
- Lessons (not authority): `/Users/abu/dev/hackathon/arc-agent/docs/raw/2026-07-30-openai-realtime-voice-trial.md`, `context/07-prior-work/arc-agent-lessons.md:70`

Verified: 2026-09-29

> Prices are **temporal** (read 2026-09-29) and change often. Latency numbers below are **vendor-stated**, not measured by us.
> Course correction from Abu: arc-agent's architecture failed. Its choice of OpenAI Realtime is *not* a default here. Arc-agent is cited only for trial lessons.

---

## 1. Three architectures (the real decision)

OpenAI's own docs now name the three shapes, and every vendor below fits one of them [VERIFIED] (https://developers.openai.com/api/docs/guides/voice-agents.md):

| Shape | What it is | Who offers it |
|---|---|---|
| **A. Full-duplex voice + delegated backend** | A voice model handles talking and listening, and hands reasoning and tools to *your* backend agent | OpenAI **GPT-Live** (`gpt-live-1`, "client delegation") |
| **B. Speech-to-speech single model** | One model hears audio, reasons, calls tools and speaks | OpenAI Realtime (`gpt-realtime-2.1`), Gemini Live (`gemini-3.8-live`), Hume EVI |
| **C. Cascaded STT → LLM → TTS** | Separate recognizer, LLM of your choice, and synthesizer, with a turn detector in the middle | ElevenLabs Agents, Deepgram Voice Agent, Cartesia Managed Agents, LiveKit Agents, Pipecat, Vapi, Retell |

For a money agent, shapes A and C keep the **tool-calling LLM and business rules in our backend**, separate from the voice layer [INFERENCE]. Shape C is also the only one where we can plug in an African-language STT or TTS (see `language-coverage-matrix.md`) [INFERENCE].

---

## 2. Vendor-by-vendor (verified facts)

### OpenAI: GPT-Live and Realtime

- **Current models** (models index) [VERIFIED] (https://developers.openai.com/api/docs/models.md):
  - `gpt-live-1`: "Our premier model for natural, expressive voice conversations with smooth interruption handling."
  - `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`: "Reasoning model with tool use."
  - `gpt-realtime-2`, `gpt-realtime-1.5`, `gpt-realtime`, `gpt-realtime-mini`: older.
  - Speech-only: `gpt-realtime-translate`, `gpt-realtime-whisper`, `gpt-live-transcribe`, `gpt-transcribe`.
- **`gpt-live-1`** [VERIFIED] (https://developers.openai.com/api/docs/models/gpt-live-1.md, /guides/live.md):
  - It is full duplex: it "can listen and speak at the same time, and delegate reasoning and tool use to a backend agent."
  - With **client delegation** you "connect any model, agent harness, or service your application runs." That means the backend can be Claude, Gemini or our own agent.
  - It runs on the endpoint `v1/live/sessions`, over WebRTC (browser), WebSocket (server) or SIP. Partner integrations exist for LiveKit, Twilio, Telnyx and Daily/Pipecat.
  - Pricing is **$0.05 per minute, billed per second**, plus backend model and tool usage.
  - Modalities are audio and text in and out. Image and video are not supported.
  - The docs say "Your application checks permissions, obtains required confirmations, runs functions."
  - The only extra voices it lists are English (Australian, British, Irish, North American, Filipino, Southern U.S.) and Portuguese (Brazilian). **No French, Spanish, Arabic, Chinese or African-language voices are listed** (https://developers.openai.com/api/docs/guides/live-conversations.md).
- **`gpt-realtime-2.1`** [VERIFIED] (https://developers.openai.com/api/docs/models/gpt-realtime-2.1.md):
  - It improves "alphanumeric recognition, silence and noise handling, and interruption behavior". Alphanumeric recognition matters for addresses and amounts.
  - It has a 128k context window and configurable reasoning effort, and supports `function_calling`.
  - Audio costs **$32 per 1M input tokens / $0.40 cached / $64 per 1M output tokens**. Text costs $4 / $24.
  - `gpt-realtime-2.1-mini` audio costs $10 in / $20 out (https://developers.openai.com/api/docs/pricing.md).
- **Session and transport** [VERIFIED] (https://developers.openai.com/api/docs/guides/realtime-conversations.md):
  - The maximum Realtime session is **60 minutes**.
  - Over WebRTC/SIP, the server truncates unplayed audio automatically on interruption. Over WebSocket, the client must stop playback and send `conversation.item.truncate`.
  - Browser and mobile clients use ephemeral keys from `POST /v1/realtime/client_secrets` (https://developers.openai.com/api/docs/guides/realtime.md).
  - The WebRTC guide recommends WebRTC over WebSockets for mobile (https://developers.openai.com/api/docs/guides/realtime-webrtc.md, line ~388).
- **Languages** [UNKNOWN]: no supported-language list exists for Realtime or GPT-Live. For `gpt-transcribe`, the `languages` parameter accepts ISO 639-1 and selected 639-3 codes and "rejects unsupported" ones, but no list is published (https://developers.openai.com/api/docs/guides/speech-to-text.md). TTS "generally follows" Whisper's language list. That list names Swahili but not Yoruba, Hausa or Igbo (https://developers.openai.com/api/docs/guides/text-to-speech.md).
- **Libraries** [VERIFIED npm, 2026-09-29]: `@openai/agents` 0.18.0 and `@openai/agents-realtime` 0.18.0. The docs show `RealtimeAgent` / `RealtimeSession` for the browser. No first-party React Native, Swift or Kotlin SDK is documented [UNKNOWN; searched the docs index]. On React Native, WebRTC would need `@livekit/react-native-webrtc` or `react-native-webrtc` [INFERENCE].

### Google: Gemini Live API

- **Models** [VERIFIED] (https://ai.google.dev/gemini-api/docs/live-api/capabilities):
  - `gemini-3.8-live` is the default and **Stable** (updated September 2026).
  - `gemini-3.8-live-extended-thinking` supports async-only tools.
  - `gemini-3.1-flash-live-preview` is legacy.
  - `gemini-3.8-live` has 131,072 input and 65,536 output tokens. It supports function calling. **Structured outputs are not supported** (https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live).
- **Tool calling mid-speech** [VERIFIED]: async function calling (`NON_BLOCKING`) is the default on 3.8 Live. Scheduling modes `SILENT`, `WHEN_IDLE` and `INTERRUPTED` let the model keep talking while a tool runs. On 3.1 Flash Live, calls are sequential only.
- **Languages** [VERIFIED]: the language table lists **99 languages**, including **Hausa `ha` and Yoruba `yo`**. Igbo and Nigerian Pidgin are absent. "Native audio output models can switch between languages naturally" and "don't support explicitly setting the language code". The same docs' overview page says "70 supported languages", so the docs contradict themselves.
- **Session limits** [VERIFIED] (https://ai.google.dev/gemini-api/docs/live-api/session-management):
  - Audio-only sessions last 15 minutes without context-window compression, and are unlimited with it.
  - A connection lasts about 10 minutes, so you must use session resumption.
  - The transport is a stateful WebSocket only (no WebRTC). Input is 16 kHz PCM and output is 24 kHz PCM.
  - Ephemeral tokens: by default you have 1 minute to open a session and 30 minutes of messages (https://ai.google.dev/gemini-api/docs/ephemeral-tokens).
- **Pricing (paid tier)** [VERIFIED, temporal] (https://ai.google.dev/gemini-api/docs/pricing):
  - Audio in costs $3.00 per 1M tokens or **$0.005/min**. Audio out costs $12.00 per 1M or **$0.018/min**. Text costs $0.75 in / $4.50 out.
  - On the free tier, data "Used to improve our products: Yes". On the paid tier: No.
- **Mobile SDKs** [VERIFIED] (https://firebase.google.com/docs/ai-logic/live-api):
  - Firebase AI Logic has Live API quickstarts for Swift, Android (Kotlin), Web and Flutter. Unity is "coming soon". It has no React Native SDK.
  - The Firebase page lists only `gemini-3.1-flash-live-preview` as a supported 3.x Live model (Gemini Developer API), so **3.8 Live via Firebase is unconfirmed** [UNKNOWN].
  - Web/Node SDK: `@google/genai` 2.24.0 [VERIFIED npm].

### ElevenLabs Agents (cascaded, managed)

- **Language set** [VERIFIED] (https://elevenlabs.io/docs/help-center/product/eleven-agents/which-languages-can-i-use-with-eleven-agents.md): "All the languages supported by our v3 Conversational and Flash v2.5 models can be used with ElevenAgents."
  - `eleven_v3_conversational` lists 70+ languages, including **Hausa** but not Yoruba or Igbo.
  - `eleven_v4` / `eleven_v4_turbo` list 90+ languages, also Hausa and no Yoruba or Igbo. They are exposed via Text-to-Dialogue, and are not in the Agents language FAQ (https://elevenlabs.io/docs/overview/models.md).
- **Default agent language** [VERIFIED]: English on Flash v2. "Additional languages switch the agent to use the v2.5 Multilingual model" (language page). The FAQ, which names v3 Conversational, disagrees, so the exact TTS model per language is [UNKNOWN] until configured.
- **STT (Scribe v2 / v2 Realtime)** [VERIFIED] (https://elevenlabs.io/docs/overview/capabilities/speech-to-text.md):
  - It covers 90+ languages, including Hausa, Igbo and Yoruba, with published WER tiers:
    - English, French, Spanish and Portuguese: ≤5%.
    - Mandarin: 5–10%.
    - Arabic and Hausa: 10–20%.
    - **Igbo and Yoruba: 25–50%**.
  - Scribe v2 Realtime latency is stated as ~150 ms.
- **Vendor-stated TTS latency** [VERIFIED claim]: Flash v2.5 ~75 ms, v4 Turbo ~100 ms, v3 Conversational ~280 ms.
- **Tools** [VERIFIED per prior research, still listed]: client, webhook, MCP and system tools, plus a language-detection system tool (https://elevenlabs.io/docs/llms.txt).
- **Mobile and web SDKs** [VERIFIED docs + npm]:
  - React Native: `@elevenlabs/react-native` 1.2.27. It requires `@livekit/react-native` 3.0.0, `@livekit/react-native-webrtc` 144.2.0 and `livekit-client` 2.22.3. On Expo also add `@livekit/react-native-expo-plugin` 1.0.3 and `@config-plugins/react-native-webrtc` 15.0.2. It needs **Expo development builds only, not Expo Go**.
  - Web: `@elevenlabs/react` 1.15.2 and `@elevenlabs/client` 1.25.0.
  - iOS: `elevenlabs-swift-sdk` via SPM.
  - Android: `io.elevenlabs:elevenlabs-android` via Gradle. The docs show `<latest>`, so the exact version is [UNKNOWN].
- **Pricing** [UNKNOWN]: the API pricing page (https://elevenlabs.io/pricing/api) is JS-rendered and could not be parsed. Check before committing.

### Deepgram Voice Agent API (cascaded, managed)

- **STT** [VERIFIED] (https://developers.deepgram.com/docs/multilingual-voice-agent.md, /docs/flux/language-prompting.md):
  - **Flux Multilingual** (`flux-general-multi`) has turn awareness and barge-in in 10 languages: en, es, fr, de, hi, ru, pt, ja, it, nl.
  - Nova-3 `multi` does code-switching without turn awareness.
  - Nova-3 monolingual models add Arabic (many locales), Chinese, and English variants `en-US/AU/GB/IN/NZ`.
  - **There is no `en-NG`, Yoruba, Hausa or Igbo** (https://developers.deepgram.com/docs/models-languages-overview.md).
- **TTS** [VERIFIED]: Aura code-switching covers English and Spanish only. For other mixes the docs say to use Cartesia, OpenAI or ElevenLabs with `language: "multi"`.
- **LLM** [VERIFIED]: you can bring your own LLM (https://developers.deepgram.com/docs/voice-agent-llm-models.md).
- **Pricing (PAYG)** [VERIFIED, temporal] (https://deepgram.com/pricing): Standard **$0.075/min**, BYO TTS $0.065/min, BYO LLM $0.059/min, BYO LLM + TTS $0.050/min, all "calculated based on websocket connection time". Concurrency is up to 45 (PAYG) or 60 (Growth).
- **SDK** [VERIFIED npm]: `@deepgram/sdk` 5.13.0. No first-party React Native, Swift or Kotlin voice-agent SDK was found in the docs index [UNKNOWN].

### Cartesia (Sonic, Ink, Managed Agents)

- **TTS** [VERIFIED] (https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md): `sonic-3.6` covers 44 languages, including fr, es, pt, ar and zh. It has **no Yoruba, Hausa, Igbo or Pidgin**. The docs claim it "voices confirmation codes … correctly without preprocessing".
- **STT** [VERIFIED]: `ink-2` (released Sept 17 2026) covers **en, fr, hi, ja, es only**. It emits turn events (`turn.start … turn.end`).
- **Managed Agents** [VERIFIED]: Ink-2 + an LLM you choose + Sonic-3.6. They support system, webhook and client tools. Client tools are "functions that the connected browser, mobile app, or server runs at Cartesia's request".
- **SDK** [VERIFIED npm]: `@cartesia/cartesia-js` 4.2.0.
- **Pricing** [UNKNOWN; not checked].

### Hume EVI

- **Versions** [VERIFIED] (https://dev.hume.ai/docs/speech-to-speech-evi/configuration/evi-version.md): EVI 3 (English only) and **EVI 4-mini**. EVI 4-mini covers English, Japanese, Korean, Spanish, French, Portuguese, Italian, German, Russian, Hindi and Arabic, and **requires a supplemental LLM**. It has no Chinese and no Nigerian languages.
- **Session** [VERIFIED]: the maximum duration is **30 minutes** (1,800 s) (https://dev.hume.ai/docs/speech-to-speech-evi/configuration/timeouts.md).
- **SDK** [VERIFIED npm]: `hume` 0.16.1 and `@humeai/voice-react` 0.3.0-beta.6 (beta).

### LiveKit Agents (open-source framework + cloud)

- **What it is** [VERIFIED] (https://docs.livekit.io/llms.txt):
  - An agents framework for Python and Node.js, with STT/LLM/TTS or realtime-model plugins.
  - A WebRTC SFU that you can self-host or run on LiveKit Cloud.
  - Client SDKs for web, Swift, Android, Flutter, React Native, Unity and more. Starter apps exist for React, SwiftUI, Android, Flutter and React Native (https://docs.livekit.io/frontends.md).
- **Turn detection** [VERIFIED] (https://docs.livekit.io/agents/logic/turns/turn-detector.md):
  - An audio end-of-turn model (`v1` on LiveKit Inference, free on LiveKit Cloud, and `v1-mini` on CPU).
  - It covers 14 languages: English, Arabic, German, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Dutch, Portuguese, Turkish and Chinese. **Yoruba, Hausa, Igbo and Pidgin are not covered.**
  - "Adaptive interruption handling" tells real interruptions apart from backchannel ("mm-hm") (https://docs.livekit.io/agents/logic/turns.md).
- **Plugins** [VERIFIED] (https://docs.livekit.io/agents/llms.txt):
  - STT: Deepgram, ElevenLabs, Google Cloud, Azure, Gladia, Speechmatics, Soniox, OpenAI, **Spitch** and more.
  - TTS: Cartesia, ElevenLabs, Google, Azure, **Spitch** and more.
  - The Spitch plugin is **Python only** (`livekit-agents[spitch]~=1.8`) (https://docs.livekit.io/agents/models/stt/spitch.md).
- **Libraries** [VERIFIED npm]:
  - Server: `@livekit/agents` 1.9.1 (Node).
  - Clients: `livekit-client` 2.22.3, `@livekit/react-native` 3.0.0, `@livekit/react-native-webrtc` 144.2.0, `@livekit/react-native-expo-plugin` 1.0.3, `@livekit/components-react` 2.9.24.
- **Pricing** [VERIFIED, temporal] (https://livekit.io/pricing): 1,000 free agent-session minutes a month. Paid tiers include 5,000 or 50,000 minutes, "then $0.01 per min". Model inference is extra.

### Pipecat (open-source framework, Daily)

- **Clients** [VERIFIED] (https://docs.pipecat.ai/overview/clients.md): JavaScript, React, **React Native**, iOS (Swift), Android (Kotlin) and C++, over WebRTC or WebSocket.
- **Libraries** [VERIFIED npm]: `@pipecat-ai/client-js` 1.13.1, `@pipecat-ai/client-react` 1.8.2, `@pipecat-ai/react-native-daily-transport` 1.8.0 (last published 2026-06-22), and `@pipecat-ai/small-webrtc-transport` 1.10.8.
- **Server**: a Python pipeline. OpenAI's GPT-Live docs list Daily/Pipecat as a partner integration [VERIFIED] (https://developers.openai.com/api/docs/guides/live.md).

### Vapi and Retell (telephony-first platforms)

- **Vapi** [VERIFIED docs]: usage-based "per-minute hosting fee, plus the model, voice, transcriber, and telephony costs". The hosting rate itself is only on the calculator at https://vapi.ai/pricing [UNKNOWN value]. The docs cover the Web SDK. `@vapi-ai/react-native` 0.3.0 and `@vapi-ai/web` 2.7.1 exist on npm [VERIFIED npm].
- **Retell** [VERIFIED] (https://www.retellai.com/pricing): pay-as-you-go "$0.07-$0.31/minute". Its language-support page lists **no Nigerian locale or language** (https://docs.retellai.com/build/language-support.md). The docs describe a JS web-call SDK (`retell-client-js-sdk` 3.0.1 on npm).
- Both are built around phone calls and add a platform layer over the same STT/LLM/TTS vendors [INFERENCE]. For an in-app agent they add cost and lock-in without adding languages.

### Nigeria-focused speech vendors (fallback path; see matrix)

- **Spitch** [VERIFIED] (https://docs.spitch.app/llms-full.txt, /concepts/pricing.md, /features/transcription.md):
  - TTS voices for English, Hausa, Igbo, Yoruba, Amharic and **Nigerian Pidgin**.
  - STT `language` values: `en`, `yo`, `ha`, `ig`, `am`.
  - Pricing: TTS $0.0014/s, STT $0.00042/s.
  - The documented STT is file-based (25 MB max, mp3/wav/m4a/ogg). A streaming STT endpoint was not found [UNKNOWN].
- **Intron Sahara v2.5** [REPORTED] (https://www.intron.io/):
  - Claims 57 languages, 500+ accents, and code-switching across 12 African languages, including Pidgin, Yoruba, Hausa and Igbo.
  - Claims new streaming ASR and TTS endpoints.
  - Its WER comparisons are the vendor's own (https://techcabal.com/2026/03/05/intron-expands-sahara-to-57-languages/).
- **N-ATLaS (NCAIR / Awarri)** [VERIFIED HF API]: Yoruba-ASR, Hausa-ASR, Igbo-ASR and NigerianAccentedEnglish models are fine-tunes of `openai/whisper-small`. The license is "other" and access is gated ("auto") (https://huggingface.co/NCAIR1/Yoruba-ASR). These are open weights to self-host, not a realtime API [INFERENCE].
- **Meta Omnilingual ASR** [VERIFIED repo]: Apache-2.0. The language IDs include `yor_Latn`, `hau_Latn`, `ibo_Latn` and **`pcm_Latn`** (Nigerian Pidgin) (https://github.com/facebookresearch/omnilingual-asr). It is self-hosted, and its streaming latency is [UNKNOWN].

### On-device options

| Option | Facts | Status |
|---|---|---|
| Apple `SpeechAnalyzer` / `SpeechTranscriber` | New in iOS/macOS 26.0. Locales are queried at runtime (`supportedLocales`), and no static list is published | [VERIFIED] (https://developer.apple.com/documentation/speech/speechanalyzer). Whether en-NG, yo, ha or ig are supported is [UNKNOWN] |
| Android `SpeechRecognizer.createOnDeviceSpeechRecognizer` | API level 31+ | [VERIFIED] (https://developer.android.com/reference/android/speech/SpeechRecognizer) |
| `expo-speech-recognition` 57.1.0 (community, jamsch) | Wraps iOS `SFSpeechRecognizer`, Android `SpeechRecognizer` and Web `SpeechRecognition`. Offers `requiresOnDeviceRecognition` and `getSupportedLocales()` | [VERIFIED] (README, npm) |
| `expo-speech` 57.0.3 | OS text-to-speech | [VERIFIED npm] |
| WhisperKit (Argmax) | Swift package for on-device Whisper on iOS/macOS | [VERIFIED] (https://github.com/argmaxinc/WhisperKit) |
| `whisper.rn` 0.7.4 | "React Native binding of whisper.cpp" | [VERIFIED npm] |

On-device STT has no speech-to-speech, tool calling or barge-in built in. It is only a fallback for push-to-talk dictation or for privacy [INFERENCE].

---

## 3. Comparison table

| | Shape | Mid-speech tools | Barge-in | Max session | Nigerian langs (voice in / out) | RN/Expo | iOS / Android native | Price (temporal) |
|---|---|---|---|---|---|---|---|---|
| OpenAI GPT-Live `gpt-live-1` | A | Delegated to your backend while voice continues | Full duplex | duration-limited ([UNKNOWN] value) | [UNKNOWN]; English/Portuguese voices only | no 1st-party | no 1st-party | $0.05/min + backend |
| OpenAI Realtime `gpt-realtime-2.1` | B | Yes (function calls) | Server VAD + truncation | 60 min | [UNKNOWN] | no 1st-party | no 1st-party | audio $32 / $64 per 1M tok |
| Gemini Live `gemini-3.8-live` | B | Yes, **async by default** | Yes | 15 min w/o compression; 10-min connections | ha, yo in; no ig/pcm | no | Firebase Swift/Kotlin/Flutter (3.1 preview listed) | $0.005/min in + $0.018/min out (+text) |
| ElevenLabs Agents | C | client/webhook/MCP tools | Yes, configurable | [UNKNOWN] | STT ha/yo/ig (yo/ig 25–50% WER); TTS ha only | **Yes** (`@elevenlabs/react-native`, dev build) | Swift SPM, Kotlin | [UNKNOWN] |
| Deepgram Voice Agent | C | client/server functions | Flux turn-aware | [UNKNOWN] | none | no | no | $0.050–0.075/min |
| Cartesia Managed Agents | C | system/webhook/client tools | Ink-2 turn events | [UNKNOWN] | none (Ink-2 = 5 langs) | no | no | [UNKNOWN] |
| Hume EVI 4-mini | B | via supplemental LLM | Yes | 30 min | none | beta React | no | [UNKNOWN] |
| LiveKit Agents | framework (C or B) | Yes, any LLM | Adaptive interruption + audio turn detector (14 langs) | self-set | via plugins (Spitch, Google, ElevenLabs) | **Yes** (`@livekit/react-native` + Expo plugin) | Swift, Android, Flutter | $0.01/min agent hosting after included minutes + models |
| Pipecat | framework | Yes | Yes | self-set | via services | Yes (Daily transport) | Swift, Kotlin | infra + models |
| Vapi / Retell | C platform | Yes | Yes | — | Retell: none listed | Vapi RN 0.3.0 | — | Retell $0.07–0.31/min |

---

## 4. Lessons from arc-agent's trials (lessons only, not authority)

- In a clean synthetic-audio trial, `gpt-realtime-2.1` first transcribed "Base … to Arc" as "Base to Polygon … Ark". It also put "USDC" inside decimal fields. Domain vocabulary and constrained chain enums fixed both (`arc-agent/docs/raw/2026-07-30-openai-realtime-voice-trial.md`). Constrain slot enums and validate amounts server-side, whatever the vendor.
- A WebRTC track carries silence and never reports that it stopped. Derive speaking state from transcript and events, not the track (`context/07-prior-work/arc-agent-lessons.md:70`).
- The agent re-asked for confirmation after the user had confirmed. This is a dialogue-policy bug, not a vendor bug (same source).
- The trial covered only clean synthetic English over WebSocket. It never tested a Nigerian accent, noise or mobile (trial doc, "What Remains Open").

---

## 5. Gaps

- Realtime and GPT-Live language lists from OpenAI: none published.
- ElevenLabs and Cartesia pricing: pages not parseable.
- Whether Gemini 3.8 Live is available through Firebase.
- A streaming endpoint for Spitch STT.
- Whether Apple and Android on-device support en-NG, yo, ha or ig.
- Any Lagos-network latency measurement.
- **No vendor was tested live in this research** (rule 8: no accounts).

---

## 6. Recommendation [INFERENCE]

1. **Voice transport and orchestration: LiveKit Agents (Node `@livekit/agents` or Python) with LiveKit client SDKs.**
   - It is the only option with first-party React Native/Expo (`@livekit/react-native` + `@livekit/react-native-expo-plugin`, dev build), Swift, Android, Flutter and web SDKs, plus open-source server code.
   - Its plugin layer lets us swap STT, TTS or realtime models per language without rewriting the client.
   - ElevenLabs' own React Native SDK already rides on LiveKit's WebRTC, so this is the common denominator anyway.
2. **Keep the money brain in our backend, not in the voice model.** Use a cascaded pipeline (shape C) inside LiveKit, calling our own tool-calling LLM (see `llm-choice.md`). This keeps one code path for text chat and voice, and one place for policy and confirmation.
3. **Default per-language models** (verify with a bake-off):
   - English/French/Spanish/Portuguese/Arabic/Chinese STT: Deepgram Flux Multilingual or ElevenLabs Scribe v2 Realtime (en/fr/es/pt ≤5% WER per ElevenLabs).
   - TTS: ElevenLabs Flash v2.5 (~75 ms stated) or Cartesia Sonic-3.6.
4. **Nigerian path:**
   - English (Nigerian accent): start with ElevenLabs Scribe or Google Chirp 3. Measure it, because no realtime vendor above has an explicit `en-NG` STT model except Azure (see matrix).
   - Yoruba, Hausa and Igbo STT: Google Chirp 3 `yo-NG` / `ha-NG` streaming (Preview) or Chirp 2 `ig-NG`, with ElevenLabs Scribe as a second option.
   - Yoruba, Igbo and Pidgin TTS: Spitch, via the LiveKit Python plugin.
   - Pidgin STT: Intron Sahara (vendor-claimed) or self-hosted Omnilingual ASR `pcm_Latn`. Mark it **beta** in the UI.
5. **Alternative if simplicity beats language breadth:**
   - Gemini Live `gemini-3.8-live` has native audio, async tools, ha/yo input, cheap per-minute audio, and Firebase native SDKs. But it has no React Native SDK, no structured outputs, and 10-minute connection limits.
   - OpenAI `gpt-live-1` with client delegation is the cleanest "voice layer + our backend" design at $0.05/min. But it has no published language list and English/Portuguese-only voices. Treat it as unproven for French and Nigerian languages until tested.
6. **Push-to-talk fallback:** `expo-speech-recognition` (on-device where available) + `expo-speech` covers offline or low-bandwidth use and costs nothing.
