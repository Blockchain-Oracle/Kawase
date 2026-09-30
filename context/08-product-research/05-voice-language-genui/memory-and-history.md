# Conversation history and memory

Purpose: how to store chat and voice history, keep long conversations inside context, remember per-user facts (contacts, preferences), and keep this private. Options are checked against current docs.

Sources:
- AI SDK message persistence: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence (saved `.firecrawl/product/memory/aisdk-persistence.md`)
- Anthropic compaction: https://platform.claude.com/docs/en/build-with-claude/compaction; context editing: https://platform.claude.com/docs/en/build-with-claude/context-editing; memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool (saved `.firecrawl/product/llm/claude_*.md`)
- OpenAI conversation state / Conversations API: https://developers.openai.com/api/docs/guides/conversation-state.md (saved `.firecrawl/product/llm/openai-conversation-state.md`); data controls: https://developers.openai.com/api/docs/guides/your-data.md
- Gemini API terms: https://ai.google.dev/gemini-api/terms (saved `.firecrawl/product/llm/gemini-terms.txt`)
- Mem0 docs: https://docs.mem0.ai/overview, https://docs.mem0.ai/llms.txt (saved `.firecrawl/product/memory/mem0-llms.txt`); GitHub API `repos/mem0ai/mem0`, `repos/letta-ai/letta`, `repos/getzep/graphiti`
- npm registry (`/latest`, fetched today): expo-sqlite 57.0.3, @op-engineering/op-sqlite 18.2.5, expo-secure-store 57.0.4, react-native-mmkv 4.3.2, @supabase/supabase-js 2.117.2, drizzle-orm 0.45.3, mem0ai 3.3.1, @mem0/vercel-ai-provider 3.0.3, @letta-ai/letta-client 1.12.1, @getzep/zep-cloud 3.30.0
- Nigeria Data Protection Act 2023: https://cert.gov.ng/ngcert/resources/Nigeria_Data_Protection_Act_2023.pdf (not fetched; see secondary summary https://trustedadvisorslaw.com/rights-of-a-data-subject-under-the-nigeria-data-protection-act-2023/)
- Prior-work lessons: `context/07-prior-work/arc-agent-lessons.md:24`; `/Users/abu/dev/hackathon/arc-agent/docs/research/2026-07-28-interaction-memory-and-generative-ui.md` ("Memory" section)

Verified: 2026-09-29

---

## 1. Three different things

| Layer | What it holds | Owner |
|---|---|---|
| **History** | Every message, including voice transcripts and tool/UI parts, per thread | App database |
| **Working context** | What the model sees this turn: recent turns, a summary of older ones, and relevant memory | Built per request |
| **Long-term memory** | Durable facts: contacts (name→address), preferences (language, default chain, currency display), automations, limits | App database, as typed tables, not free text |

The key design point: **contacts, limits and automations are structured product data, not "LLM memory".** The agent reads them through tools (`list_contacts`, `get_preferences`). Only soft preferences ("prefers short answers", "calls his sister 'Tolu'") belong in a fuzzy memory store [INFERENCE].

## 2. History storage (verified options)

- **AI SDK UI messages.**
  - Docs say to persist the `UIMessage[]` format, which includes `id` and `createdAt`, not model messages.
  - Load messages into `useChat({ id, messages: initialMessages })`. Save in `toUIMessageStream`'s `onEnd`.
  - Generate stable IDs with `createIdGenerator`, and call `validateUIMessages` on the server before resending stored tool/data parts.
  - Use `prepareSendMessagesRequest` to send only the last message.
  - Call `result.consumeStream()` so saving still happens if the client disconnects.
  - Persist `input-streaming` parts (with `rawInput`) so resumed streams can continue [VERIFIED, persistence page lines 80-100, 195, 250-282, 421, 520, 594].
  - This matters because genUI cards are tool parts, so history must store them to re-render cards later [INFERENCE].
- **OpenAI server-side state.** The Conversations API "persist[s] conversation state as a long-running object with its own durable identifier… across sessions, devices, or jobs". `previous_response_id` chains responses [VERIFIED, conversation-state.md:444,554]. This ties history to one vendor, so own the canonical copy anyway [INFERENCE].
- **Voice sessions.** Realtime/Live session state is transport state. Persist the user and assistant transcripts plus tool calls into the same thread table so voice and text share one history [INFERENCE; also the arc-agent research conclusion "Provider session state is transport state, not canonical memory" (`2026-07-28-multilingual-realtime-voice.md`, "Product Boundary")].
- **Storage.**
  - Server: Postgres (e.g. Supabase, `@supabase/supabase-js` 2.117.2), with a `threads` / `messages(jsonb parts)` / `contacts` / `preferences` / `memories` schema [INFERENCE].
  - Device cache: `expo-sqlite` 57.0.3 or `op-sqlite` 18.2.5 for offline history.
  - Secrets and tokens: `expo-secure-store` 57.0.4, never SQLite or MMKV [INFERENCE; versions VERIFIED from npm].

## 3. Keeping long conversations in context

- **Anthropic compaction**: "replaces the older turns of a conversation with a summary that Claude writes on the server, so you need no summarization code of your own". Both variants (on demand, token threshold) are **beta** [VERIFIED].
- **Anthropic context editing** clears old tool results and thinking blocks by rule [VERIFIED].
- **Anthropic memory tool**: a client-side file store. "Claude requests file operations, and your application executes them. You control where and how the data is stored" [VERIFIED].
- **Portable approach** that works across providers [INFERENCE]:
  - Keep the last N turns verbatim.
  - Roll older turns into a stored summary per thread, generated by a cheap model (see `llm-choice.md`).
  - Drop bulky tool outputs (quotes, route lists) after they are rendered, keeping just `{tool, key result, card id}`.
  - Always inject the current contacts list, or a retrieval over it, and preferences via tools.

## 4. Long-term memory libraries (verified existence)

| Option | What it is | License / status | Notes |
|---|---|---|---|
| Mem0 (`mem0ai` 3.3.1) | Memory layer, managed Platform or OSS. Scopes memories "by user, agent, app, and run" | Apache-2.0, repo pushed 2026-09-25 [VERIFIED gh] | `add`/`search`/`update`/`delete`/`delete_all(user_id=…)` [VERIFIED llms.txt]; Vercel AI SDK integration `@mem0/vercel-ai-provider` 3.0.3 [VERIFIED] |
| Letta (`@letta-ai/letta-client` 1.12.1) | "Platform for stateful agents" | Apache-2.0 [VERIFIED gh] | A whole agent runtime, which is heavy if you only need memory [INFERENCE] |
| Zep / Graphiti (`@getzep/zep-cloud` 3.30.0) | "Real-Time Knowledge Graphs for AI Agents" | Graphiti Apache-2.0 [VERIFIED gh] | Temporal graph, more than needed here [INFERENCE] |
| DIY | Postgres table `memories(user_id, kind, text, embedding?, source_msg_id, created_at)` plus a `remember`/`forget` tool | n/a | Smallest surface, and user-visible and editable [INFERENCE] |

**Recommendation [INFERENCE]:**
- Build DIY typed tables for contacts, preferences and automations, plus a small `memories` table the user can see and delete in Settings → "What the agent remembers".
- Add Mem0 only if fuzzy recall becomes a real need.
- Never let memory override the address book. A remembered "Alex = 0x…" from chat must go through the add-contact sheet (see `voice-safety-confirmation.md`).

## 5. Privacy

- **Vendor data use.**
  - OpenAI API: no training unless you opt in, and abuse logs are kept up to 30 days. ZDR needs approval [VERIFIED].
  - Gemini: the **unpaid tier** uses content to improve Google products and allows human review, so use the paid tier [VERIFIED, terms].
  - Anthropic: the features above list ZDR eligibility per feature [VERIFIED, doc front-matter/notes].
- **Voice audio.** Store transcripts, not raw audio, by default. Make audio retention opt-in [INFERENCE].
- **Onchain.** Arc memo data is public onchain, so never write contact names or notes to memos [VERIFIED lesson, `arc-agent-lessons.md:24`].
- **User rights.** The Nigeria Data Protection Act 2023 gives data subjects rights including correction and erasure (s.34) [REPORTED, secondary summary; primary PDF not fetched]. GDPR applies to EU users [INFERENCE]. Provide export and "delete my history/memory" that cascades to any memory vendor, e.g. Mem0 `delete_all(user_id)` [INFERENCE].
- **Least exposure.** Send the model contact **names and IDs**, and resolve addresses server-side. Addresses are needed only in the confirmation card [INFERENCE].

## Gaps

- The Anthropic compaction beta header and model coverage were not extracted.
- The NDPA primary text was not fetched (only secondary).
- Mem0 benchmarks and latency were not evaluated.
