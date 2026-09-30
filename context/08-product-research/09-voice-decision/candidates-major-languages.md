# Voice candidates, re-ranked for the top world languages

Purpose: re-rank the realtime voice candidates on D4's languages (English, French, Spanish plus the most widely spoken world languages, across the whole app) and on what this product needs: one shared brain, mid-voice UI cards, React Native/Expo, and money-grade safety. The Nigerian-language scope is superseded and not used here.

Sources (raw copies under `.firecrawl/product/voice-decision/`):
- OpenAI: `openai-models_gpt-realtime-2.1.md`, `openai-models_gpt-live-1.md`, `openai-guides_live.md`, `openai-guides_live-delegation.md`, `openai-guides_live-conversations.md`, `openai-guides_realtime-server-controls.md`, `openai-guides_realtime-conversations.md`, `openai-guides_realtime-webrtc.md`, `openai-guides_voice-latency-cost.md`, `openai-guides_your-data.md`, `openai-tts.md` (all from https://developers.openai.com/api/docs/…); Whisper languages `whisper-tokenizer.py` (https://github.com/openai/whisper/blob/main/whisper/tokenizer.py)
- Google: `gemini-live-api.txt`, `gemini-live-api_capabilities.txt`, `gemini-live-api_session-management.txt`, `gemini-models_gemini-3.8-live.txt`, `gemini-pricing.txt` (https://ai.google.dev/gemini-api/docs/…); React Native Firebase AI `rnfb-ai-index.ts` (https://github.com/invertase/react-native-firebase/blob/main/packages/ai/lib/index.ts)
- ElevenLabs: `el-_eleven-agents_which-languages-can-i-use-with-eleven-agents.md`, `el-overview_models.md`, `el-eleven-agents_customization_llm_custom-llm.md`, `el-eleven-agents_customization_tools_client-tools.md`, `el-eleven-agents_libraries_react-native.md`, `el-eleven-agents_customization_privacy_retention.md`, `el-agents-cost.md`, `el-burst.md` (https://elevenlabs.io/docs/…); https://elevenlabs.io/pricing/agents (WebFetch)
- Deepgram: `dg-multilingual-voice-agent.md`, `dg-models-languages-overview.md`, `dg-voice-agent-llm-models.md`, `dg-data-privacy-compliance.md` (https://developers.deepgram.com/docs/…), `dg-pricing.html` (https://deepgram.com/pricing)
- LiveKit: `lk-agents_logic_turns_turn-detector.md`, `lk-transport_sdk-platforms_expo.md`, `lk-agents_models_realtime_plugins_gpt-live.md`, `lk-transport_data_rpc.md`, `lk-pricing.html` (https://docs.livekit.io/…, https://livekit.io/pricing)
- Pipecat: `pc-llms.txt` (https://docs.pipecat.ai/llms.txt)
- Vapi: `vapi-llms.txt`, `vapi-pricing.md`, `vapi-faq.md` (https://docs.vapi.ai/…); https://vapi.ai/pricing (WebFetch)
- npm registry, queried 2026-09-29: `npm-versions-2026-09-29.tsv`, `el-rn-deps.json`
- Independent latency: Artificial Analysis https://artificialanalysis.ai/speech-to-speech; Full-Duplex-Bench-v3 https://arxiv.org/abs/2604.04847; frontend/backend tool-call paper https://arxiv.org/abs/2609.19334
- Prior research: `05-voice-language-genui/realtime-voice-options.md`, `06-mobile-desktop-platform/mobile-capabilities.md`

Verified: 2026-09-29

> Prices are temporal (read 2026-09-29). "Vendor-stated" latency is marketing unless marked independent. No vendor was tested live (rule 8: no accounts).

---

## 1. Language coverage, top 15 languages

Legend:
- ✅ = listed in the vendor's current docs.
- ❌ = the list was checked and the language is absent.
- ? = no list published.
- A tick means *listed*, not *good*.

| Lang | OpenAI Realtime / GPT-Live | Gemini 3.8 Live (in+out) | ElevenLabs Agents TTS: v3 Conversational / Flash v2.5 | Deepgram STT: Nova-3 / Flux-multi (turn-aware) | LiveKit audio turn detector |
|---|---|---|---|---|---|
| English | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| Mandarin | ? | ✅ zh-Hans/Hant | ✅ / ✅ | ✅ / ❌ | ✅ |
| Hindi | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| Spanish | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| French | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| Arabic | ? | ✅ | ✅ / ✅ | ✅ / ❌ | ✅ |
| Bengali | ? | ✅ | ✅ / **❌** | ✅ / ❌ | **❌** |
| Portuguese | ? (GPT-Live has pt-BR voices) | ✅ pt-BR, pt-PT | ✅ / ✅ | ✅ / ✅ | ✅ |
| Russian | ? | ✅ | ✅ / ✅ | ✅ / ✅ | **❌** (audio); ✅ text model |
| Urdu | ? | ✅ | ✅ / **❌** | ✅ / ❌ | **❌** |
| Indonesian | ? | ✅ | ✅ / ✅ | ✅ / ❌ | ✅ |
| German | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| Japanese | ? | ✅ | ✅ / ✅ | ✅ / ✅ | ✅ |
| Turkish | ? | ✅ | ✅ / ✅ | ✅ / ❌ | ✅ |
| Korean | ? | ✅ | ✅ / ✅ | ✅ / ❌ | ✅ |

Evidence for each column:
- **OpenAI.** No official language list exists for `gpt-realtime-2.1` or `gpt-live-1` [UNKNOWN; searched the model pages and the Live/Realtime guides]. Indirect evidence only:
  - OpenAI TTS "generally follows the Whisper model in terms of language support" (`openai-tts.md:393`). The Whisper tokenizer lists all 15 codes [VERIFIED, `whisper-tokenizer.py:11-54`].
  - GPT-Live's *additional* voices are English and Portuguese (BR) only (`openai-guides_live-conversations.md:32-45`). The guide says "Test the voice with the languages and pronunciation your application needs" (`:47`) [VERIFIED].
- **Gemini.** "Live API supports the following 99 languages", and "native audio output models can switch between languages naturally" (`gemini-live-api_capabilities.txt:905-908`) [VERIFIED]. The overview page of the same docs says "70 supported languages" (`gemini-live-api.txt:37`), so the docs contradict themselves [VERIFIED]. Native audio models "don't support explicitly setting the language code" (`capabilities.txt:431-434`) [VERIFIED].
- **ElevenLabs.** Agents use "the languages supported by our v3 Conversational and Flash v2.5 models" [VERIFIED].
  - Flash v2.5 has 32 languages (`el-overview_models.md:169,196,288`) and lacks Bengali and Urdu [VERIFIED].
  - v3 Conversational has 70+ languages, including Bengali and Urdu (`el-overview_models.md:166,261-265`) [VERIFIED].
  - Scribe STT lists all 15 (`el-overview_models.md:5`) [VERIFIED].
- **Deepgram.**
  - Flux Multilingual (turn-aware) covers "English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, and Dutch" [VERIFIED, `dg-multilingual-voice-agent.md`].
  - Nova-3 lists ar, bn, zh, id, ko, tr and ur [VERIFIED, `dg-models-languages-overview.md`].
  - Aura TTS code-switching is en/es only. For other languages the docs say "Cartesia, OpenAI, or Eleven Labs" [VERIFIED].
- **LiveKit.** The audio turn detector covers "English, Arabic, German, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Dutch, Portuguese, Turkish, and Chinese" (`lk-…turn-detector.md:125`) [VERIFIED]. The text `MultilingualModel` adds Russian (`:438`) [VERIFIED]. Other languages fall back to VAD/STT endpointing [INFERENCE].

**Takeaway [INFERENCE].** Only **Gemini Live** (one model) and the **ElevenLabs v3 Conversational + Scribe** pipeline document all 15 languages end to end. OpenAI is the biggest documentation gap for D4, not necessarily a quality gap. It needs a listening test in bn, ur, ar, zh and hi on day 1.

---

## 2. Capability matrix

| | OpenAI **Realtime** `gpt-realtime-2.1` | OpenAI **GPT-Live** `gpt-live-1` | **Gemini Live** `gemini-3.8-live` | **ElevenLabs Agents** | **Deepgram Voice Agent** | **LiveKit Agents** | **Pipecat** | **Vapi** |
|---|---|---|---|---|---|---|---|---|
| Shape | Speech-to-speech; model is the brain | Full-duplex voice front end; **delegates** reasoning and tools | Speech-to-speech; model is the brain | Managed STT → LLM → TTS | Managed STT → LLM → TTS | Framework: pipeline **or** realtime plugins | Framework: pipeline or S2S services (Python) | Managed pipeline platform |
| Bring your own LLM (one brain) | ❌ (it *is* the LLM) | ✅ **client delegation**: "connect any model, agent harness, or service" (`openai-guides_live.md:12`) | ❌ (it *is* the LLM) | ✅ Custom LLM via an OpenAI-compatible Chat Completions/Responses endpoint (`el-…custom-llm.md:13-20`) | ✅ BYO LLM tier (`dg-pricing`) | ✅ any LLM plugin, or our own node | ✅ many LLM services | ✅ custom LLM server (`vapi-llms.txt`) |
| Mid-conversation tools | ✅ function calling | ✅ via delegation; backend work continues when the caller interrupts (`live.md:14`) | ✅ async `NON_BLOCKING` by default, with `SILENT/WHEN_IDLE/INTERRUPTED` scheduling (`gemini-models_gemini-3.8-live.txt`) | ✅ client, webhook, MCP and system tools | ✅ function calls ([UNKNOWN] client-side details; function-calling doc URL 404'd) | ✅ tools + **RPC to the frontend** | ✅ function calling | ✅ tools; client-side tools documented for the **Web SDK** |
| How a tool result shows a client UI card | Function-call event on the WebRTC data channel, or server **sideband** `wss://…/v1/realtime?call_id=` (`server-controls.md:168-207`) | Our app gets the delegation, shows UI through its own channel, and feeds results back with `session.commentary.append` / `thinking.append` (`live-delegation.md:272,314-316`) | `toolCall` message on the client WebSocket | **Client tools**: "Triggering UI events… alerts, modals" (`el-…client-tools.md`) | [UNKNOWN] | Agent calls `performRpc` on the app. Docs: "your LLM can… manipulate the UI" (`lk-transport_data_rpc.md`) | RTVI client messages [REPORTED, docs index] | Web SDK client tools |
| Barge-in | ✅ server VAD; WebRTC auto-truncation (`realtime-conversations.md:1285-1313`) | ✅ **full duplex**, "can listen while speaking" (`live.md:5`) | ✅ "Users can interrupt the model at any time" (`gemini-live-api.txt:38-39`) | ✅ | ✅ Flux turn-aware (10 langs) | ✅ adaptive interruption + turn detector | ✅ | ✅ |
| Voice in X, UI in X | Pin the language in the prompt; no language param for output | Same (prompt); `session.instructions.append` greeting in the chosen language (`live-prompting.md:118-128`) | Auto-switches; restrict via system instructions | Per-agent language + language-detection system tool | `language_hints` on STT; TTS per vendor | Per-session STT/TTS `language` | Per service | Per assistant / squad |
| Transport | WebRTC (recommended for mobile, `realtime-webrtc.md:388`), WebSocket, SIP | WebRTC, WebSocket, SIP; + sideband | **WebSocket only** (`gemini-live-api.txt:62-63`) | WebRTC via LiveKit (RN) | WebSocket | WebRTC (SFU) | WebRTC (Daily / small-webrtc) or WebSocket | WebRTC (Daily) |
| Session limits | 60 min (`realtime-conversations.md:35`) | "duration limit" exists; value [UNKNOWN] (`live-conversations.md:570`) | 15 min audio without compression; **~10 min per connection**, resumption required (`session-management.txt:16-24`) | [UNKNOWN] | [UNKNOWN] | self-set | self-set | [UNKNOWN] |

### SDKs (npm checked 2026-09-29; `npm-versions-2026-09-29.tsv`)

| Vendor | Official React Native / Expo | iOS / Android native | Web |
|---|---|---|---|
| OpenAI | **None first-party.** `@openai/agents-realtime` 0.18.0 (2026-09-10) ships a `react-native` export condition and shim [VERIFIED npm `exports`], but no documented RN guide [UNKNOWN]. Raw WebRTC via `react-native-webrtc` 124.0.8 (2026-07-21) | None first-party [UNKNOWN; per `05-…/realtime-voice-options.md`] | `@openai/agents-realtime` 0.18.0 |
| Google | **None first-party.** `@react-native-firebase/ai` 26.4.0 (2026-09-05, Invertase) exports `LiveGenerativeModel`, but its own comment says "The Live API is only supported in modern browser windows and Node >= 22" (`rnfb-ai-index.ts:108-110`) | Firebase AI Logic Swift/Kotlin (lists only `gemini-3.1-flash-live-preview`, per `05-…`) | `@google/genai` 2.24.0 (2026-09-22) |
| ElevenLabs | ✅ `@elevenlabs/react-native` 1.2.27 (2026-09-07). "Expo compatibility (development builds only)". **Peer dep `@livekit/react-native ^2.12.0`, while current is 3.0.0** (`el-rn-deps.json`), a version conflict to resolve [VERIFIED] | Swift SPM, Kotlin | `@elevenlabs/react` 1.15.2, `@elevenlabs/client` 1.25.0 |
| Deepgram | None | None found | `@deepgram/sdk` 5.13.0 (2026-09-28) |
| LiveKit | ✅ `@livekit/react-native` 3.0.0 (2026-09-11) + `@livekit/react-native-expo-plugin` 1.0.3 (2026-09-23) + `@livekit/react-native-webrtc` 144.2.0. Official Expo quickstart; "not compatible with the Expo Go app" (`lk-…expo.md`) [VERIFIED] | Swift, Android, Flutter SDKs | `livekit-client` 2.22.3. Server: `@livekit/agents` 1.9.1 (Node, 2026-09-26) + plugins openai/google/deepgram/elevenlabs/cartesia 1.9.1 |
| Pipecat | `@pipecat-ai/react-native-daily-transport` and `…-small-webrtc-transport` 1.8.0 (both **2026-06-22**, three months old); no `@pipecat-ai/client-react-native` package | iOS / Android clients (docs index) | `@pipecat-ai/client-js` 1.13.1. **Server is Python** |
| Vapi | `@vapi-ai/react-native` 0.3.0, **published 2025-07-29** (14 months old), peer `@daily-co/react-native-webrtc 118.0.3-daily.4`. Not in the docs index (0 mentions of "react native" in `vapi-llms.txt`) | — | `@vapi-ai/web` 2.7.1 (2026-09-18) |

### Latency: vendor-stated vs independent
| Claim | Source | Type |
|---|---|---|
| ElevenLabs Flash v2.5 ~75 ms, v3 Conversational ~280 ms (TTS model latency) | `el-overview_models.md:166-169` | vendor-stated |
| Vapi "typically around 800 milliseconds for end-to-end" | `vapi-faq.md:55` | vendor-stated |
| Artificial Analysis time to first audio: GPT-Realtime-2.1 High **1.21 s**; GPT-Live-1 (Astra, medium) **1.34 s**; Gemini 3.8 Live Extended Thinking (High) **1.35 s**; Gemini 3.1 Flash Live High 2.99 s. Agentic performance: GPT-Live-1 67.9%, Gemini 3.8 Live ET 68.6%, GPT-Realtime-2.1 45.7% | artificialanalysis.ai/speech-to-speech, "data current through July 2026" | **independent** [REPORTED; read via WebFetch summary, not saved] |
| Full-Duplex-Bench-v3 (Apr 2026), tool use under disfluency: GPT-Realtime best Pass@1 "0.600"; Gemini Live 3.1 fastest "4.25 s"; cascaded Whisper→GPT-4o→TTS slowest "10.12 s"; "self-correction handling and multi-step reasoning… remain the most consistent failure modes" | arxiv 2604.04847 | **independent** academic [REPORTED]. The cascaded baseline uses old models and is not our planned pipeline |
| A frontend/backend split (duplex speech front end → text LLM backend for tools): "92-97% tool-call recall" | arxiv 2609.19334 (Sep 2026) | independent academic [REPORTED]. It supports the delegation shape |

---

## 3. Pricing, retention, BYO LLM

| | Price (official, temporal) | ≈ $/min of conversation [INFERENCE] | Data retention (default) | BYO LLM |
|---|---|---|---|---|
| OpenAI Realtime `gpt-realtime-2.1` | Audio $32 in / $0.40 cached / $64 out per 1M tokens; text $4 / $24 (`gpt-realtime-2.1.md:25-39`). 1 token per 100 ms in, 1 per 50 ms out; the whole conversation is re-sent every turn (`voice-latency-cost.md:217-219`) | ~$0.02/min of user audio + ~$0.08/min of model audio + growing context. AA: **$10.75/h (~$0.18/min)** for High [REPORTED]; LiveKit's calculator shows "OpenAI GPT Realtime: $0.0676/min" [REPORTED] | API abuse-monitoring logs "retained for up to 30 days"; ZDR "subject to prior approval" (`your-data.md:18-20`). Realtime's ZDR eligibility [UNKNOWN] | No |
| OpenAI GPT-Live `gpt-live-1` | **$0.05/min, billed per second**, plus backend (`gpt-live-1.md:23-31`). Free tier unsupported (`:78`) | $0.05 + our LLM (with client delegation there is no OpenAI backend charge) | Same OpenAI API policy | **Yes (client delegation)** |
| Gemini 3.8 Live | Audio in $3/1M or **$0.005/min**; audio out $12/1M or **$0.018/min**; text $0.75 / $4.50 (`gemini-pricing.txt:450-476`) | ~$0.02–0.03/min + text/thinking tokens. AA: Gemini 3.8 Live ET $3.50/h [REPORTED] | Paid tier: content "not used to improve our products"; free tier: "Yes" (same page) [VERIFIED] | No |
| ElevenLabs Agents | **$0.08/min** voice, "95% discount for periods of silence longer than 10 seconds"; LLM "passed through separately" (`el-agents-cost.md`; burst example "$0.08/minute" `el-burst.md:44`) [VERIFIED]. The pricing page also showed a "$0.003 per additional call minute" overage, which looks like a misread [UNKNOWN] | $0.08 + LLM | "By default, ElevenLabs retains conversation data for 2 years", configurable in days (`el-…retention.md:9-12`) [VERIFIED] | **Yes** |
| Deepgram Voice Agent | PAYG: Standard **$0.075**, BYO TTS $0.065, **BYO LLM $0.059**, BYO LLM+TTS $0.050 per min, "calculated based on websocket connection time" (`dg-pricing.html`) [VERIFIED] | $0.059 + our LLM | MIP opt-out (`mip_opt_out=true`) exists (`dg-data-privacy-compliance.md:33`); default retention on the linked "Your Data" page not read [UNKNOWN] | **Yes** |
| LiveKit Agents (Cloud) | 1,000 free agent-session min/month; Ship $50/mo 5,000 min, "then $0.01 per min"; inference extra, e.g. Deepgram Flux Multilingual $0.0078/min (`lk-pricing.html`) [VERIFIED]. The calculator example totals **$0.0479/min** | ~$0.01 + STT + TTS + LLM (≈ $0.03–0.06) | Per provider; LiveKit recordings are opt-in [INFERENCE] | **Yes** |
| Pipecat | OSS; hosting cost is ours (Pipecat Cloud not checked) | infra + providers | Per provider | **Yes** |
| Vapi | "$0.05/min Vapi hosting" plus provider costs (vapi.ai/pricing via WebFetch; `vapi-pricing.md:25`) | $0.05 + providers | "14 days raw data retention" (free/no package), 30 (Core), 180 (Pro) [VERIFIED via WebFetch] | **Yes** |

---

## 4. Re-ranking for this product [INFERENCE]

The weights come from Abu's decisions:
- D5: voice is the top priority.
- D4: the top 15 languages.
- D3: iOS and Android are required.
- **One brain for text, Telegram and voice.**
- Money safety: server gate, and tap + biometric.

| Rank | Candidate | Why | Main risk |
|---|---|---|---|
| **1** | **LiveKit Agents (Node) as the voice runtime, running our own brain**, with the voice layer swappable per session: pipeline (Deepgram/ElevenLabs STT + our LLM + ElevenLabs v3 Conversational TTS) **or** the GPT-Live client-delegation plugin | Only candidate with a *current* first-party Expo SDK (3.0.0 + Expo plugin, Sept 2026). Node server matches the TS backend. RPC gives mid-voice UI cards. Both "our brain" shapes run in one worker: the GPT-Live plugin supports `delegation: 'client'` in Node (`lk-…gpt-live.md:9-10,273-277,323`). ElevenLabs v3 Conv + Scribe document all 15 languages | Extra infra (LiveKit Cloud + worker). Pipeline latency must be measured. Turn detector misses bn/ur/ru (VAD fallback) |
| 2 | **OpenAI GPT-Live, client delegation, direct WebRTC** (no LiveKit) | Cleanest "voice layer + our brain" design. Full duplex. $0.05/min flat. AA agentic 67.9% | **No language list**; extra voices en/pt only. No RN SDK, so raw `react-native-webrtc` + sideband. Free tier unsupported |
| 3 | **ElevenLabs Agents + Custom LLM** | Managed. Official RN SDK. Client tools = UI cards. Documented 15 languages (v3 Conv) | Our brain must sit behind an OpenAI-compatible endpoint. RN peer-dep conflict with LiveKit 3.0.0. $0.08/min. **2-year default retention** (set it lower) |
| 4 | Gemini 3.8 Live | Best documented language coverage (99). Cheapest audio. Async tools. AA top-tier | It is a **second brain** (no BYO LLM). WebSocket only. ~10-min connections. No RN SDK. No structured outputs |
| 5 | OpenAI Realtime `gpt-realtime-2.1` | Strongest tool accuracy in FDB-v3 | **Second brain** (keeperhub's F1). Token cost grows. No language list |
| 6 | Deepgram Voice Agent | BYO LLM, cheap | No RN/mobile SDK. Turn-aware in only 10 languages. TTS for most languages must come from another vendor |
| 7 | Pipecat | Flexible | Python server beside a TS backend. RN transports three months stale |
| 8 | Vapi | BYO LLM | RN SDK 14 months stale and undocumented. Telephony-first |

## 5. Gaps
- OpenAI still publishes **no language list** for Realtime or GPT-Live, and there is no value for the GPT-Live session duration limit.
- Deepgram Voice Agent client-side function-call details (doc URL 404) and default retention.
- Whether `@elevenlabs/react-native` 1.2.27 works with `@livekit/react-native` 3.0.0 despite its `^2.12.0` peer range.
- The ElevenLabs overage figure from the pricing page.
- The Artificial Analysis numbers were read through a summarizer, and a plain `gemini-3.8-live` row wasn't extracted.
- No listening test in any language. **No latency measured from a phone.**
