> **Superseded scope (2026-09-29, DECISIONS-FROM-ABU.md D4):** the target languages are English, French, Spanish and the most widely spoken world languages, across the whole app (UI, chat and voice). The Nigerian-language coverage below (Pidgin, Yoruba, Hausa, Igbo, en-NG) was Claude's own assumption and is **not a requirement**. Re-rank voice vendors on the major languages only.

# 05 · Voice, language and generative UI: index

Purpose: an entry point to the research on two-way voice, multilingual support (including Nigerian languages), generative UI on Expo and web, conversation memory, safe voice confirmation, and LLM choice for the money agent.

Sources: the files in this folder (each lists its own primary sources). Raw evidence is under `.firecrawl/product/{voice,genui,llm,voice-safety,memory}/`. Prior arc-agent research (Jul–Aug 2026) was read and re-verified. Abu reports arc-agent's architecture failed, so it is cited **only for trial lessons**, never as a default.
Verified: 2026-09-29

---

## Files

| File | Read it for |
|---|---|
| [realtime-voice-options.md](realtime-voice-options.md) | The three voice architectures; OpenAI (`gpt-live-1`, `gpt-realtime-2.1`), Gemini Live (`gemini-3.8-live`), ElevenLabs, Deepgram, Cartesia, Hume, LiveKit, Pipecat, Vapi and Retell; mobile SDKs, pricing, barge-in, on-device fallback |
| [language-coverage-matrix.md](language-coverage-matrix.md) | Per-vendor coverage for en-NG, Pidgin, Yoruba, Hausa, Igbo, fr, es, pt, ar, zh, including Africa-focused vendors (Spitch, Intron, N-ATLaS, Omnilingual ASR) |
| [voice-safety-confirmation.md](voice-safety-confirmation.md) | Read-back patterns, NIST's ban on voice biometrics, PSD2 dynamic linking, how Apple, Alexa and Capital One gate voice payments, and a tap + biometric policy table |
| [i18n.md](i18n.md) | i18next / Lingui / expo-localization, RTL restart on native, Hermes Intl, the USDC currency-code problem, and answering in the user's language |
| [generative-ui.md](generative-ui.md) | AI SDK 7 `useChat` on Expo + web, json-render, assistant-ui, CopilotKit, Thesys C1/OpenUI, A2UI, MCP-UI/Apps SDK; the declarative-catalog recommendation |
| [memory-and-history.md](memory-and-history.md) | UIMessage persistence, compaction, typed contacts and preferences versus fuzzy memory (Mem0/Letta/Zep), privacy and deletion |
| [llm-choice.md](llm-choice.md) | Verified current IDs and prices: `claude-sonnet-5-5` / `claude-opus-5-5` / `claude-haiku-4-5`, `gpt-6-sol` / `gpt-6-luna`, `gemini-3.8-flash`; strict tool schemas |

## Headline findings

- **Voice.** No single realtime vendor covers the full list [VERIFIED per matrix].
  - Nigerian English: only Azure publishes an explicit `en-NG` locale, for both STT and TTS.
  - Yoruba and Hausa: Gemini Live covers both. ElevenLabs Scribe publishes 25–50% WER for Yoruba and Igbo.
  - Igbo and Pidgin voices come only from Africa-focused vendors (Spitch).
  - No mainstream realtime vendor supports Pidgin.
- **OpenAI** now ships `gpt-live-1` alongside `gpt-realtime-2.1`, with no published language list [VERIFIED]. Gemini's `gemini-3.8-live` is stable [VERIFIED].
- **Mobile.** LiveKit has first-party Expo/RN, Swift, Android, Flutter and web SDKs. ElevenLabs' RN SDK uses LiveKit and needs an Expo dev build [VERIFIED].
- **Safety.** NIST SP 800-63B-4: "Biometric comparison based on voice SHALL NOT be used." PSD2 requires the payer to be "made aware of the amount … and of the payee" [VERIFIED].
- **GenUI.** AI SDK 7 `useChat` runs on Expo and web. json-render is the only verified option with Zod catalogs **and** an official RN renderer, but it is pre-1.0. A2UI is real but has no RN renderer [VERIFIED, see generative-ui.md].
- **i18n.** `Intl.NumberFormat` rejects "USDC" as a currency code, so stablecoins need a custom formatter. Toggling RTL on native requires a restart [VERIFIED, see i18n.md].

## Recommended shape [INFERENCE]

1. **One brain, two modalities.**
   - Text chat and voice call the same backend tool-calling LLM (provider-swappable; see llm-choice.md).
   - Voice runs as a cascaded pipeline in **LiveKit Agents**: per-language STT → our LLM → per-language TTS.
   - Plug-in paths: Deepgram/ElevenLabs for major languages, Google Chirp/Spitch for Nigerian languages, Pidgin as beta.
   - `gpt-live-1` delegation or Gemini Live are simpler alternatives to bake off.
2. **Voice proposes, screen confirms, device authorises.**
   - The model never supplies addresses.
   - A missing contact opens an add-contact sheet.
   - Every write needs a ConfirmationSheet tap plus biometric or passkey, bound to a hash of the draft.
3. **Declarative genUI.** Tools return data. The server wraps it in a Zod-validated spec that names a fixed catalog component (SwapQuoteCard, BridgeRouteComparison, ContactPicker, ConfirmationSheet, AutomationEditor, Chart). Separate web and native registries render it. Specs never execute money writes.
4. **Memory = typed product data first.** Contacts, preferences, limits and automations live in tables read through tools. History is stored as UIMessages so cards re-render. Fuzzy memory is optional, visible and deletable.

## Top gaps (need hands-on tests)

- Real-mic accuracy for Nigerian-accented English, Pidgin and Yoruba **numbers and names**. No vendor publishes this.
- End-to-end voice latency from Lagos for each stack.
- Whether json-render web and RN renderers match on the same spec.
- Hermes ICU coverage for yo/ha/ig/pcm locales on device.
