# 09 · Voice decision: index and recommendation

Purpose: settle the disagreement between the voice stream (LiveKit pipeline) and the platform stream (OpenAI Realtime over WebRTC) with current evidence, for D4 (top world languages) and D5 (voice is first-class).

Sources: the three files in this folder, each with its own primary sources. Raw evidence is in `.firecrawl/product/voice-decision/`: vendor docs, pricing pages and `npm-versions-2026-09-29.tsv`. Binding inputs are `RESEARCH-RULES.md` and `DECISIONS-FROM-ABU.md` (D3, D4, D5, D7).
Verified: 2026-09-29

## Files
| File | Read it for |
|---|---|
| [keeperhub-voice-architecture-review.md](keeperhub-voice-architecture-review.md) | How keeperhub-copilot-v2 does voice (file:line), what's sound, and what's flawed |
| [candidates-major-languages.md](candidates-major-languages.md) | The 15-language matrix, capabilities, RN/Expo SDKs checked on npm, latency (vendor vs independent), price, retention, BYO LLM, and the ranking |
| [architecture-options.md](architecture-options.md) | Options (a) S2S, (b) LiveKit pipeline and (c) GPT-Live hybrid, each walking "send $20 to Alex", plus the choice and the day-1 spikes |

## Recommendation [INFERENCE]

**Use LiveKit Agents (Node) as the voice runtime, with our backend agent as the only brain. Voice becomes one more surface of the same `agentTurn` that text chat and Telegram use.**

- **Guaranteed path, option (b).** A cascaded pipeline inside LiveKit: STT (ElevenLabs Scribe or Deepgram Nova-3) → our LLM → TTS (ElevenLabs v3 Conversational, or Flash v2.5 where it is listed). UI cards and forms reach the phone through LiveKit RPC.
- **Upgrade path, option (c).** OpenAI **GPT-Live `gpt-live-1` with client delegation**, run by the same worker through LiveKit's Node plugin (`delegation: 'client'`). It gives full-duplex voice for $0.05/min with no second brain. Make it the default for each language that passes the day-1 listening and tool test.
- **Reject option (a) as the primary design:** `gpt-realtime-2.1` or Gemini Live as the reasoner. It creates two brains, which is exactly what keeperhub did (F1).

### How the two earlier streams resolve
| Claim | Verdict |
|---|---|
| Voice stream: "LiveKit + our own LLM, vendor per language" | **Kept, but for a different reason.** The per-language plumbing matters less now that D4 drops the Nigerian languages. LiveKit wins because it is the only candidate with a current first-party Expo SDK (`@livekit/react-native` 3.0.0 + Expo plugin 1.0.3, Sept 2026), a Node agent runtime, and RPC for UI cards [VERIFIED npm/docs] |
| Platform stream: "OpenAI Realtime over WebRTC; LiveKit plan C" | **Superseded.** Realtime-as-reasoner is a second brain. OpenAI's own newer design, GPT-Live delegation, separates voice from reasoning [VERIFIED `openai-guides_live.md:7-12`]. It is available *inside* LiveKit, so the choice isn't either/or. There is still no first-party OpenAI RN SDK [UNKNOWN beyond an undocumented shim] |

### Key evidence
- **Languages.** Gemini Live lists 99 languages, including all 15 [VERIFIED]. ElevenLabs v3 Conversational + Scribe list all 15; Flash v2.5 lacks Bengali and Urdu [VERIFIED]. **OpenAI publishes no language list for Realtime or GPT-Live**, and GPT-Live's extra voices are English and pt-BR only [VERIFIED absence].
- **Independent latency and quality** [REPORTED]:
  - Artificial Analysis (to July 2026) measured time to first audio at 1.21 s for Realtime-2.1 High, 1.34 s for GPT-Live-1 and 1.35 s for Gemini 3.8 Live ET. Agentic performance: 45.7%, 67.9% and 68.6%.
  - Full-Duplex-Bench-v3 found an old cascaded pipeline slowest (10.12 s).
- **Price per minute** (temporal):
  - GPT-Live: $0.05 plus our LLM.
  - ElevenLabs Agents: $0.08 plus LLM.
  - Deepgram BYO-LLM: $0.059.
  - LiveKit: $0.01 session plus models (calculator example $0.048).
  - Gemini Live audio: about $0.023.
  - Realtime-2.1: token-based, reported at about $0.18/min (High).
- **Keeperhub** is a good source of *safety and UI patterns*: server gate by effect class, the same signed card for voice and chat, a form pop-up for addresses, and one transcript. Its *topology* is wrong for us: two brains, tools relayed through the browser, a mic muted during cards, and web only.

## Confidence
**Medium.**
- The architecture rests on verified docs and packages.
- Latency on phones, multilingual voice quality (especially bn, ur, ar, zh and hi on the OpenAI path) and RPC round-trips are **unmeasured** until the day-1 spikes in `architecture-options.md` run.

## Open risks
1. **OpenAI language coverage is undocumented.** If GPT-Live fails bn/ur/ar, those languages stay on the pipeline, which is slower.
2. **Pipeline latency with modern models is unmeasured.** The target is ≤1.5 s from end of speech to first audio on 4G.
3. **Infra footprint.** LiveKit Cloud plus a worker deploy, with Vercel Functions for the rest. LiveKit's own data-retention settings are [UNKNOWN].
4. **The ElevenLabs RN SDK peer-depends on `@livekit/react-native ^2.12.0`** while the current version is 3.0.0. This matters only for the managed fallback.
5. **Retention defaults.**
   - ElevenLabs: 2 years (lower it if used).
   - OpenAI: abuse logs up to 30 days; ZDR needs approval.
   - Vapi: 14 days.
   - Deepgram: [UNKNOWN].
6. **Safety is unchanged by any choice.** Voice proposes, the screen shows, the device authorizes (`05-voice-language-genui/voice-safety-confirmation.md`).

## Gaps (looked, not found)
- An OpenAI Realtime/GPT-Live language list, and the GPT-Live session duration value.
- Deepgram client-side function-call docs (URL 404) and its default retention.
- A plain `gemini-3.8-live` row in Artificial Analysis.
- Pipecat Cloud pricing (not checked).
