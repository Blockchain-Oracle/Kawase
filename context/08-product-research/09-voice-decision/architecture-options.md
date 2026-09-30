# Voice architecture options: one agent brain for chat, Telegram, app and voice

Purpose: three concrete ways to plug two-way voice into a single agent brain that text chat and Telegram also use. Each option walks the "send $20 to Alex" flow, and the chosen option comes with a day-1 spike list.

Sources:
- `candidates-major-languages.md` and `keeperhub-voice-architecture-review.md` (this folder), and the evidence they cite under `.firecrawl/product/voice-decision/`
- OpenAI GPT-Live delegation: `openai-guides_live-delegation.md` (https://developers.openai.com/api/docs/guides/live-delegation), `openai-guides_live.md`; sideband: `openai-guides_realtime-server-controls.md:168-207`
- LiveKit: `lk-agents_models_realtime_plugins_gpt-live.md` (https://docs.livekit.io/agents/models/realtime/plugins/gpt-live), `lk-transport_data_rpc.md` (https://docs.livekit.io/transport/data/rpc), `lk-transport_sdk-platforms_expo.md`
- Safety pattern: `05-voice-language-genui/voice-safety-confirmation.md`; platform: `06-mobile-desktop-platform/recommended-stack.md`, `mobile-capabilities.md`

Verified: 2026-09-29

Everything in this file is **[INFERENCE]** unless it cites a verified fact.

---

## The fixed part (same in every option)

```
                ┌──────────────────────────── AGENT BRAIN (our backend, TypeScript) ────────────────────────────┐
 text chat ───► │ agentTurn(conversationId, userInput, surface) → streamText(model, tools, policy)               │
 Telegram  ───► │ tools: resolve_contact, request_input(form), quote_transfer, propose_transfer, get_balance, …   │
 voice     ───► │ gate: read → run | write → signed ConfirmationDraft (hash(draft), expiry) | unknown → block     │
                │ stores: conversations (UIMessages), contacts, drafts, automations                              │
                └───────────────┬───────────────────────────────────────────────────────────────┬───────────────┘
                                │ UI events (card/form specs, Zod-validated catalog)             │ execution only after
                                ▼                                                               ▼ device-signed approval
                     app (Expo iOS/Android/web) renders cards                          wallet/limits service
```

These rules hold in every option:
- **One `agentTurn`** is used by every surface. Voice only changes how the input arrives (a transcript) and how the output leaves (speech plus UI events).
- **The model never supplies an address.** `resolve_contact` reads the user's address book. A miss returns `request_input(AddContactForm)`.
- **A spoken "yes" never moves money.** A write returns a ConfirmationDraft card. The phone authorizes it with a tap plus `expo-local-authentication` (`voice-safety-confirmation.md` §2).
- **Keep what keeperhub got right** (`keeperhub-voice-architecture-review.md` §2):
  - the effect-class gate
  - the same signed card for voice and chat
  - the form pop-up for addresses
  - the outcome injected back into the voice
  - one stored transcript

---

## Option (a): a speech-to-speech model calls our tools

The voice model (`gpt-realtime-2.1` or `gemini-3.8-live`) *is* the conversational brain. Its tools are thin proxies to our backend. This is keeperhub's design (`keeperhub-voice-architecture-review.md` §1).

```
phone ──WebRTC/WS──► S2S model (reasons, speaks) ──function call──► (sideband or app) ──► our tool endpoints (gate, stores)
```

**"Send $20 to Alex":**
1. The user speaks. The S2S model decides to call `resolve_contact("Alex")`. Our endpoint returns `not_found` plus a form spec.
2. The app renders the AddContact form from the tool event (data channel or server push). The model says "I don't have Alex's address. Add it on screen."
3. The user pastes or scans the address. The answer is posted to our backend. We inject a system item ("Alex saved, 0x…9f3a").
4. The model calls `propose_transfer({to:"Alex", amount:"20", asset:"USDC"})`. Our gate creates a signed draft, and the app shows the ConfirmationSheet.
5. The user taps Confirm, then Face ID. The backend executes. We inject "sent, tx …", and the model speaks it.

**Pros:**
- Lowest moving-part count.
- Best measured time to first audio (AA: Realtime-2.1 1.21 s [REPORTED]).
- Gemini documents all 15 languages [VERIFIED].

**Cons:**
- **Two brains.** Chat and Telegram use our LLM; voice uses the S2S model with its own prompt. Behaviour drifts. This is keeperhub F1.
- Gemini: WebSocket only and ~10-min connections [VERIFIED].
- Realtime: token cost grows with the session.
- No first-party React Native SDK for either.

---

## Option (b): a LiveKit pipeline with our LLM (cascaded)

```
phone ──WebRTC (LiveKit RN SDK)──► LiveKit Cloud SFU ──► LiveKit Agent worker (Node @livekit/agents 1.9.1)
                                                          STT (Deepgram Nova-3/Flux or ElevenLabs Scribe, language=user setting)
                                                          → llm node = OUR agentTurn()  (same code as chat)
                                                          → TTS (ElevenLabs v3 Conversational / Flash v2.5; per language)
                                                          → UI events to the phone via LiveKit RPC (performRpc)
```

**"Send $20 to Alex":**
1. "Send twenty dollars to Alex" goes through STT, which produces a transcript. The turn detector ends the turn. `agentTurn(conversationId, transcript, surface:"voice")` runs — the *same function* as text chat.
2. The brain calls `resolve_contact`, which misses and returns `request_input(AddContactForm)`.
   - The worker `performRpc("ui.show", spec)` on the phone. LiveKit RPC exists to let "your LLM… manipulate the UI" [VERIFIED].
   - The brain's text reply "I don't have Alex's address yet. I've opened a form" is spoken by TTS in the user's language.
3. The mic **stays open**, unlike keeperhub F3. Speech during the form is handled as conversation ("his address is on my clipboard"), never as form data or consent.
4. The form is submitted to our backend over HTTPS, not over voice. The backend stores the contact and appends a tool result. The worker receives a "form answered" event (RPC back, or a backend push), and the brain continues: `propose_transfer` produces a signed draft, then `ui.show(ConfirmationSheet)`.
5. TTS says "Twenty USDC, two-zero, to Alex, ending 9f3a. Check the card and confirm."
6. The user taps and uses Face ID. The backend verifies the signature over `hash(draft)` and executes.
7. The worker gets the outcome event, and the brain produces "Sent", which is spoken. Everything lands in the same transcript as chat.

**Pros:**
- **Literally one brain.**
- Language per STT/TTS vendor with documented lists for all 15 (Scribe + ElevenLabs v3 Conversational) [VERIFIED].
- Current first-party Expo SDK [VERIFIED].
- Node worker matches the TS backend.
- Telegram voice notes can reuse the same STT → agentTurn → TTS chain as a batch.

**Cons:**
- Latency stacks STT endpointing + LLM TTFT + TTS TTFB. FDB-v3's cascaded baseline was the slowest (10.12 s, old models) [REPORTED].
- Half-duplex feel.
- The turn detector lacks bn/ur/ru, so those fall back to VAD [VERIFIED list].
- More infra: LiveKit Cloud and a worker deploy.

---

## Option (c): hybrid — a full-duplex voice front end delegates to our brain (GPT-Live client delegation)

```
phone ──WebRTC (LiveKit RN SDK)──► LiveKit ──► Agent worker (Node)
                                                 llm = openai.realtime.GPTLiveModel({ delegation: 'client' })   ← voice/turn-taking only
                                                 on delegation → OUR agentTurn(transcript context) → results back as
                                                   session.commentary.append (speak) / session.thinking.append (quiet)
                                                 UI events → phone via LiveKit RPC
```

**Verified building blocks:**
- GPT-Live "can listen while speaking (full duplex)", and "with client delegation, connect any model, agent harness, or service your application runs" (`openai-guides_live.md:5,12`).
- The delegation event "contains metadata, not task text; use transcript events and application state to prepare the backend request" (`live-delegation.md:39`).
- Use `commentary.append` for results to say aloud and `thinking.append` for quiet facts, with 500 tokens per append (`live-delegation.md:272,316`).
- "Backend work can continue when the caller interrupts" (`live.md:14`).
- LiveKit supports `delegation: 'client'` in Node: "No backend model runs, so nothing reaches a second OpenAI model" (`lk-…gpt-live.md:9-10,273-277,323`).
- $0.05/min flat (`gpt-live-1.md:23`).

**"Send $20 to Alex":**
1. The user speaks. GPT-Live says "Sure, let me check" *while* it emits a client delegation. The worker builds context from our stored transcript and calls `agentTurn`.
2. The brain's `resolve_contact` misses. The worker sends `ui.show(AddContactForm)` over RPC, and appends commentary: "I don't have Alex's address. I've opened a form for it."
3. GPT-Live keeps listening (full duplex). If the user says "actually make it fifteen", the transcript goes to our brain, which updates the *draft*, not the form.
4. The form is submitted to the backend. The worker appends thinking ("Alex saved") and re-invokes `agentTurn`, which runs `propose_transfer`. That produces the ConfirmationSheet over RPC, plus commentary with the read-back.
5. Tap plus Face ID. Execute. Commentary: "Sent, twenty USDC to Alex." Mark it delivered only after checking playback (`live-conversations.md:536`).

**Pros:**
- One brain, **and** full-duplex natural turn-taking.
- The voice fills silence while the brain works.
- AA ranks GPT-Live-1 highest on arena preference among the OpenAI entries (Elo 1048), with agentic performance 67.9% [REPORTED].
- An academic frontend/backend split reports "92-97% tool-call recall" [REPORTED].

**Cons:**
- **No OpenAI language list.** Extra voices are English and pt-BR only [VERIFIED]. This is the D4 risk.
- A single vendor for the voice layer.
- Delegation carries no task text, so we must keep the transcript ourselves.
- Free tier unsupported [VERIFIED].
- Commentary is *paraphrased* by the model (`live-delegation.md:272`), so exact amounts must also be on screen (they are).

---

## Choice [INFERENCE]

**Build on LiveKit Agents (Node) with our brain as the only reasoner. Ship option (b) as the guaranteed path, and run option (c) in the same worker as a per-session switch.** Promote (c) to default for any language where it passes the day-1 listening and tool test. **Reject (a)** as the primary design.

Why:
1. **Abu's "one brain" requirement kills (a).** It repeats keeperhub's F1 (two brains).
2. **The two earlier streams were both half-right.**
   - The platform stream was right that OpenAI's current voice model is the best-rated duplex front end, and right to prefer WebRTC for mobile.
   - The voice stream was right that LiveKit is the only runtime with a current first-party Expo SDK, and right that voice must call *our* LLM.
   - GPT-Live client delegation (new since the platform stream's "Realtime over WebRTC" pick) runs *inside* LiveKit's Node plugin. So we don't have to choose: LiveKit is the transport and runtime, and GPT-Live or the STT+TTS pipeline is the swappable voice layer.
3. **D4 changed the math.**
   - Without the Nigerian languages, the pipeline's per-language vendor plugging is no longer the headline reason for LiveKit.
   - But OpenAI still has no language list, so (b) remains the only path with documented coverage of all 15 languages today (ElevenLabs Scribe + v3 Conversational; Deepgram Nova-3 as the second STT).
4. **Mobile.** Expo via `@livekit/react-native` 3.0.0 + Expo plugin (dev build) is documented [VERIFIED]. Direct OpenAI WebRTC in RN relies on an undocumented shim [UNKNOWN].

**Confidence: medium.** The design is well supported by docs. Latency and multilingual quality are unmeasured.

**Fallbacks:**
- If the LiveKit Cloud or worker deploy blocks: (c) direct GPT-Live over `react-native-webrtc` + a server sideband.
- If both fail on device: ElevenLabs Agents + Custom LLM (managed, official RN SDK).
- Worst case: push-to-talk (`expo-audio` record → STT → agentTurn → TTS).

## Day-1 spikes (de-risk in this order)

| # | Spike | Pass criterion | If it fails |
|---|---|---|---|
| 1 | Expo dev build + `@livekit/react-native` 3.0.0 + Expo plugin: join a room on iOS and Android and hear an echo agent | Two-way audio on both phones, speaker (not earpiece) output | Try `react-native-webrtc` direct to GPT-Live; else ElevenLabs RN SDK |
| 2 | Node worker, **pipeline (b)**: Deepgram/ElevenLabs STT → `agentTurn` stub → ElevenLabs TTS, in en/fr/es | p50 end-of-speech → first audio measured on 4G. Target ≤1.5 s | Swap STT/TTS vendors (LiveKit Inference); shorten LLM output; use a fast model tier |
| 3 | Worker, **GPT-Live `delegation:'client'`** calling the same `agentTurn` stub | Delegation events arrive, commentary is spoken, barge-in works | Stay on (b) |
| 4 | **Language test**, (b) vs (c), 10 utterances each in en, zh, hi, es, fr, ar, bn, pt, ru, ur (amounts, names, "cancel", corrections) | Correct language out, amounts right, no unwanted language switch | Per language, route to whichever path passes. Mark the rest "voice beta" |
| 5 | **UI round trip**: tool → `performRpc("ui.show", AddContactForm)` → form submit to backend → brain resumes → ConfirmationSheet → biometric → spoken "Sent" | Full "$20 to Alex" flow on a phone, transcript identical in the chat view | Fall back to backend push (SSE/WebSocket) for UI events instead of RPC |
| 6 | **Barge-in during read-back and during the form** | TTS stops within ~300 ms; speech never approves; a changed draft voids the old confirmation | Keep the mic open but drop to push-to-talk while a card waits |
| 7 | Session: 20-minute conversation, network drop and reconnect | Resumes the same conversation id | Reconnect creates a new voice session bound to the same transcript |

## Open risks
- No independent latency numbers for the *pipeline with modern models*. FDB-v3's cascaded baseline is outdated.
- The OpenAI language gap. Bengali and Urdu need Flash-v2.5 alternatives (v3 Conversational is ~280 ms vendor-stated).
- The `@elevenlabs/react-native` peer range excludes LiveKit RN 3.0.0, which matters only if we use the ElevenLabs fallback.
- LiveKit Cloud is another vendor holding voice audio. Check its retention settings before launch [UNKNOWN].
