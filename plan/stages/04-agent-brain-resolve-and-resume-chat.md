# Stage 4: Agent brain + resolve and resume + chat

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: in progress (2026-10-01: the agent and the Chat tab are live on real data; intents, policy, memory and resume come with the money tools)

## Scope (from the master plan)
- `packages/{policy,intents,agent,cards}`: `evaluate()` with the 5 kinds and the reason enum; the A2A intent state machine + draft versions + EIP-712 hashing + read-back templates.
- `agentTurn` with prompt caching, the network/locale tail, capability-filtered tools, untrusted quarantine + taint, and `toModelOutput` compaction.
- Card registry for native and web.
- Chat UI (composer, message parts, tool-approval UI).
- Threads with history and search. Rolling summary. Visible memory. Risk modes.
- `resume-intents` flow; the `precondition.cleared` outbox events; the `/i/[intentId]` deep-link resume.
- **Exit:**
  - "send 10 to Alex" (unknown) → AddContactForm → resumes.
  - "send 10" → USDC/EURC chips.
  - An over-limit request → PolicyRefusal with the numbers and **no split option**.
  - A mainnet-only request on testnet → NetworkSwitch card with asymmetric resume.
  - Every result renders on native and web.

## Docs to read first (Context7 / official docs)
- AI SDK 7 (`ai@7.0.122`): the installed type definitions (`streamText`, `toUIMessageStream`'s `onEnd({ messages })`, `createProviderRegistry`, `createIdGenerator`, `DefaultChatTransport` + `prepareSendMessagesRequest`), and spike 7's verified usage (`plan/spikes/07-streaming-chat.md`).
- `@ai-sdk/openai@4.0.83` options (`reasoningEffort`, `textVerbosity`, `promptCacheKey`), `@ai-sdk/anthropic@4.0.71`.

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- 2026-10-01: **The agent is live in the Chat tab, on real data only.**
  - `packages/agent`: `createModels` (D29 registry: openai + anthropic, role → `DEFAULT_MODELS`, env overrides `KAWASE_MODEL_*`), `instructions()` (stable prefix: what works today, never invent numbers, the person chooses the network, plain text, keep symbols/addresses; tail: network, `@handle`/guest, "Reply in {language}", date), `buildTools(context)` and `agentTurn()` (streamText → `toUIMessageStream`, `reasoningEffort: low`, `textVerbosity: low`, a prompt-cache key, `experimental_toolApprovalSecret`, 6 steps max). **K2 holds: no tool takes a network, an address or an approval** — every tool reads through an injected `AgentContext` already scoped to the session's user and network.
  - Tools: `get_wallet` (balances with real marks, allowance), `get_activity` (ArcScan history), `get_capabilities` (the registry for this network and the other, with reasons — D15), `claim_test_money` (Circle's faucet through the shared `FaucetService`), `show_receive`, `get_authority` (the signed grant, decoded), `propose_network_switch` (a device-side tool: the card's button switches through the same hook as the header pill, mainnet consent included, then `addToolOutput` lets the agent continue).
  - Api: `apps/api/src/agent/` — `POST /agent/chat` (guests allowed; the app sends only the new message; the thread's history is loaded from Postgres and the whole conversation saved in `onEnd`), `GET /agent/threads`, `GET /agent/threads/:id`, `DELETE`. New tables `threads` + `thread_messages` (migration `0004_threads`, both in the guest-merge list). Env: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `KAWASE_MODEL_*`, `AGENT_APPROVAL_SECRET` (set on Coolify).
  - App: the Chat tab opens the latest conversation (history follows the account), a Conversations sheet and a new-conversation button; messages as bubbles and plain text; each tool result as a card on the card base (wallet, activity rows, capability chips, faucet result with the gold koban, receive with copy/QR, the authority receipt, the network switch); "Thinking" until the first words; inline error + Retry; starter chips; home's chips open a new thread with the question asked. `useAgentChat` = spike 7's transport (expo/fetch, bearer token).
  - Verified: a French guest asked "Qu'est-ce que tu peux faire ?" → `get_capabilities` → an accurate French answer (6.4 s, local api); on the simulator "What's my balance?" → wallet card with 19.99 USDC / 20 EURC; "Send 10 USDC to @amina" → capability card + "sending is coming, share your address for now". Fixes from that look: plain text only (the model used `**`), card numbers not repeated, whole limits.
  - Not yet: intents/drafts + `policy.evaluate()` (they land with send in Stage 5, where they first matter), visible memory and the risk dial (M3/M4), the resume flow, thread search, voice (Stage 10) and the web chat run.
