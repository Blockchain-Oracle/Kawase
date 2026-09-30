# keeperhub-copilot-v2: voice architecture review

Purpose: record how keeperhub-copilot-v2 does voice, with file:line citations, and judge it against current vendor docs. It is a reference and a source of lessons, not a template (D7).

Sources:
- Clone at `refs/abu/keeperhub-copilot-v2`, HEAD `32fcfaef` (2026-09-18). All `path:line` references below are relative to that folder.
- OpenAI docs (saved under `.firecrawl/product/voice-decision/`): `openai-guides_realtime-server-controls.md` (https://developers.openai.com/api/docs/guides/realtime-server-controls), `openai-models_gpt-realtime-2.1.md`, `openai-models_gpt-live-1.md`, `openai-guides_live.md`, `openai-guides_live-delegation.md`, `openai-guides_voice-latency-cost.md`, `openai-guides_realtime-models-prompting.md`, `openai-guides_realtime-webrtc.md`
- Artificial Analysis speech-to-speech leaderboard: https://artificialanalysis.ai/speech-to-speech (read with WebFetch, data "current through July 2026")

Verified: 2026-09-29

---

## 1. What it does

### Provider and model
- **OpenAI Realtime, speech-to-speech.** The default model is `gpt-realtime-2.1` (`lib/config.ts:114`). The session length defaults to 600 s (`lib/config.ts:115`), which the env can override between 60 and 3600 s (`lib/config.ts:123`) [VERIFIED].
- **Text chat uses a different model.** Chat runs `openai.responses(aiConfig.chatModel)` (`app/api/chat/route.ts:389`), with a default of `gpt-5.6` (`lib/config.ts:62`). So voice and chat have **two reasoning brains** with two prompts: `VOICE_POLICY_PROMPT` (`lib/voice/instructions.ts:19`) and the chat `instructions` (`app/api/chat/route.ts:390`) [VERIFIED].
- **They share one tool registry.** It has 14 tool names (`lib/registry/surface-tools.ts:29-43`). Voice gets `surfaceRealtimeTools` (`:304`) and chat gets `surfaceChatTools` (`app/api/chat/route.ts:657`). Both run through the same `routeToolCall` / `requiresConfirmation` (`app/api/voice/tool/route.ts:6,115,137`) [VERIFIED].

### Transport
- **Browser-only WebRTC**, through the OpenAI Agents SDK: `RealtimeAgent` + `RealtimeSession` + `OpenAIRealtimeWebRTC` (`components/voice/voice-engine.ts:147-178`), from `@openai/agents` 0.18.0 (`package.json`) [VERIFIED].
- **Ephemeral key.** The server mints a short-lived key via `POST /v1/realtime/client_secrets` with a 120 s expiry (`app/api/voice/session/route.ts:24-26,63-77`). It sends back the model, instructions, tool schemas and session length (`:92-101`). The browser then registers the tools itself on connect (`session/route.ts:17-19`, `voice-engine.ts:152-165`) [VERIFIED].
- It uses `navigator.mediaDevices.getUserMedia` and an `HTMLAudioElement` (`voice-engine.ts:122,148`). **There is no React Native, iOS or Android path** in the repo, which is a Next.js 16 web app (`package.json`) [VERIFIED].

### Tool calls and UI cards mid-voice
1. The model calls a tool. The browser's `execute` only POSTs `{toolName, args, said}` to `/api/voice/tool` (`voice-engine.ts:162,294-326`) [VERIFIED].
2. The server decides the outcome (`app/api/voice/tool/route.ts:26-41`) [VERIFIED]:
   - `gateVoiceCall` classifies the call as **run / confirm / block**. It derives this from the effect class of the *arguments*, not from a hand-kept list of names (`lib/voice/policy.ts:1-24,59-63`).
   - A conversation that already ends in a waiting card refuses a second one (`tool/route.ts:90-97`).
   - `request_input` stores an open **form** part and answers the model with "A form is on screen… stop and wait" (`tool/route.ts:63-64,101-113`; `_shared/voice.ts:144-151`).
   - A write is stored as the chat's **HMAC-signed `approval-requested` card** (`_shared/voice.ts:112-141`). The model is told "It has NOT happened… wait for a system message" (`tool/route.ts:60-61,115-134`).
   - Reads run right away and are stored as the same card chat draws (`tool/route.ts:136-153`). Results are truncated to 6,000 characters for the voice model (`_shared/voice.ts:30,197-200`).
3. The browser applies the returned `messages` to the chat view. When `pending`, it **mutes the mic** and enters `waiting` (`voice-engine.ts:312-321`) [VERIFIED].
4. **The form pop-up.**
   - `VoiceFormSheet` rises above the voice bar. Its comment reads "nobody reads an address aloud, so it is typed or pasted here while the mic waits" (`components/voice/voice-form-sheet.tsx:8-14`).
   - The answer goes to `/api/voice/answer`, which validates it against the *stored* form, not the browser's copy (`app/api/voice/answer/route.ts:9-15,34-46`).
5. When a card or form finishes, the chat calls `reportOutcome`. This unmutes the mic and injects a `system` message plus `response.create` so the model speaks the result (`voice-engine.ts:257-262,361-370`) [VERIFIED].
6. **One transcript.** Voice speech is persisted into the same conversation with stable ids `voice-<itemId>` (`_shared/voice.ts:15-22,90-104`; `app/api/voice/transcript/route.ts`) [VERIFIED].

### Interruption handling
- The code sets `turnDetection: { type: "semantic_vad" }` (`voice-engine.ts:174`). It relies on the server truncating audio over WebRTC [VERIFIED code]. OpenAI documents that over WebRTC/SIP "the server truncates unplayed audio automatically", while over WebSocket the client must send `conversation.item.truncate` [VERIFIED, `openai-guides_realtime-conversations.md:1285-1313`; `05-voice-language-genui/realtime-voice-options.md`].
- The client only maps `audio_interrupted` / `audio_stopped` to a UI phase (`voice-engine.ts:185-192`) [VERIFIED].
- **While a card or form waits, the mic is muted** (`voice-engine.ts:314`, the `toggleMute` guard at `:250`). So the user cannot barge in, say "cancel", or ask a question until they tap [VERIFIED].

### Language switching
- There are 13 locales (`lib/locale.ts:13-27`): en, es, pt-BR, fr, de, id, vi, ko, ja, zh-CN, hi, ru, tr. **There is no Arabic, Bengali or Urdu, and so no RTL** [VERIFIED].
- The language is pinned in the instructions when the key is minted (`lib/voice/instructions.ts:27-31`; `session/route.ts:59-60`). The prompt says "Do not switch language because of the person's accent… tell them… they can change it in the account menu" (`instructions.ts:30`). The transcription model is `gpt-4o-mini-transcribe`, with `language` set to the locale (`voice-engine.ts:173`) [VERIFIED].
- This follows OpenAI's current prompting guide: "Do not infer language from accent alone… Only switch languages if the user explicitly asks" [VERIFIED, `openai-guides_realtime-models-prompting.md:744-787`].
- **Voice cannot switch language mid-session.** Changing it means changing the setting, and a new session picks it up [INFERENCE from the mint-time instructions].
- The spoken system nudges are hard-coded English: `CARD_WAITING`, `FORM_WAITING` and the wrap-up line (`tool/route.ts:60-64`; `voice-engine.ts:210-212`). The model is expected to answer in the pinned language anyway [VERIFIED code; how well that works is untested].

### Session, cost, mobile
- Sessions hard-stop at `sessionSeconds`, with a one-minute goodbye nudge (`voice-engine.ts:206-216`; `components/voice/voice-rules.ts:14-15`). There is no resumption [VERIFIED].
- **Cost.** `gpt-realtime-2.1` audio costs $32 per 1M input tokens and $64 per 1M output tokens [VERIFIED, `openai-models_gpt-realtime-2.1.md:33-39`]. User audio is 1 token per 100 ms and assistant audio 1 token per 50 ms, and "the entire conversation is sent to the model for each Response" [VERIFIED, `openai-guides_voice-latency-cost.md:217-219`].
  - That works out to about $0.019 per minute of user speech and about $0.077 per minute of model speech, before the context is re-billed on every turn [INFERENCE, arithmetic].
  - Artificial Analysis lists "GPT-Realtime-2.1 High" at **$10.75/hour** [REPORTED].
- **Mobile: none.** It is web only (see Transport above).

---

## 2. Judgement against current docs

### Sound (keep these ideas)
| Idea | Why it holds |
|---|---|
| The server decides every tool call; the browser only forwards | Matches OpenAI: "Your application checks permissions, obtains required confirmations, runs functions" [VERIFIED, `openai-guides_live.md:14`] |
| The gate is derived from the effect class of the arguments (`policy.ts:16-19`) | Can't go stale when tools are added [INFERENCE] |
| A voice write becomes the **same signed card** as a chat write (`_shared/voice.ts:106-141`) | One confirmation ceremony across surfaces. Matches `05-voice-language-genui/voice-safety-confirmation.md` ("voice proposes, screen confirms") |
| The form pop-up for details nobody should speak (addresses) | This is exactly Abu's "add Alex's address" flow |
| One stored transcript for voice and chat, with idempotent ids | Conversation history survives voice |
| Language pinned, not inferred from accent | Current OpenAI guidance [VERIFIED] |

### Flawed or outdated
| # | Problem | Evidence | Consequence |
|---|---|---|---|
| F1 | **Two brains.** Voice reasons with `gpt-realtime-2.1`; chat reasons with `gpt-5.6` | `config.ts:62,114`; `chat/route.ts:389` | The same request can behave differently in voice and chat. There are two prompts to keep in sync. Telegram would add a third [INFERENCE]. OpenAI now ships **GPT-Live client delegation**, where "you choose the backend model or agent independently of the voice model" [VERIFIED, `openai-guides_live.md:7,12`]. That removes this split |
| F2 | **Tools go through the browser** | `voice-engine.ts:294-326` | A backgrounded tab or dropped network loses the call. OpenAI documents a server **sideband** (`wss://api.openai.com/v1/realtime?call_id=…`) that keeps tools and business logic server-side [VERIFIED, `openai-guides_realtime-server-controls.md:168-207`]. Keeperhub doesn't use it. The risk is mitigated because the server re-validates everything (`tool/route.ts:76-86`) |
| F3 | **The mic goes deaf while a card or form waits** | `voice-engine.ts:250,314` | No "wait, make it 15" or "cancel" by voice. Two-way conversation (D5) pauses at exactly the moment the user most needs to talk. A safer design keeps listening but never treats speech as consent (see `voice-safety-confirmation.md` §2.7) [INFERENCE] |
| F4 | **Up to 2.5 s of polling before every tool call**, waiting for the user's transcript | `voice-engine.ts:298-301`; `voice-rules.ts:18` | Added latency on every tool turn, so that the transcript is saved before the card |
| F5 | `strict: false` on every voice tool | `voice-engine.ts:161` | Arguments are unconstrained at the model. Server Zod checks catch this later (`tool/route.ts:116-119`), but the model wastes turns repairing them [INFERENCE] |
| F6 | **Web only** | `voice-engine.ts:122,148` | Fails D3 (iOS + Android required) |
| F7 | 13 locales with no ar/bn/ur and no RTL; English system nudges | `locale.ts:13-27`; `tool/route.ts:60-64` | Misses 3 of the top 15 languages (D4) |
| F8 | A 10-minute hard cap with no resumption | `config.ts:115`; `voice-engine.ts:215` | Realtime allows 60 min [VERIFIED, `openai-guides_realtime-conversations.md:35`]. It's an arbitrary product limit |
| F9 | Cost model | See above | Token billing grows with context. GPT-Live is a flat $0.05/min plus backend [VERIFIED, `openai-models_gpt-live-1.md:23-29`] |

### Verdict [INFERENCE]
- The **safety and UI plumbing is sound**: server gate, signed cards, form pop-up and shared transcript. It is the best part of the reference.
- The **model topology is outdated**: a speech-to-speech model acting as a second brain, with tools relayed through the browser.
- The **platform reach is wrong** for this product: web only.
- Carry over the *patterns*: effect-class gate, the same card for voice and chat, form-for-addresses, and outcome-to-voice injection. Don't carry over the Realtime-as-brain topology or the browser tool relay.
