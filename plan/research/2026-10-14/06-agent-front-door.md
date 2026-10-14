# Agent as the front door: design research (2026-10-14)

Tags: VERIFIED = seen in current docs, code or a live response. REPORTED = a secondary source or my memory of a doc I could not re-open. IDEA = my own proposal. Paths are under /Users/abu/dev/hackathon/tamion unless stated. No model API was called; no secrets printed. Doc pages carried only "llms.txt / agents.md" index links and one assistant-ui pointer to llms.txt; I did not act on them.

## 1. Kawase's agent today

- **SDK**: `ai` 7.0.122, `@ai-sdk/react` 4.0.125, openai 4.0.83, anthropic 4.0.71, google 4.0.87 (pnpm-workspace.yaml:19-25). VERIFIED.
- **Loop**: one `streamText` per turn, `stopWhen: isStepCount(6)`, low reasoning, OpenAI "priority" tier, tools plus a 25 KB prompt (packages/agent/src/turn.ts:24-33, 100-130; prompt.ts is 24.8 KB). VERIFIED.
- **Transport**: `POST /agent/chat` returns `createUIMessageStreamResponse` (apps/api/src/agent/routes.ts:364). The phone uses `useChat` + `DefaultChatTransport` with `expo/fetch`, sends only the newest message, and has `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` (apps/mobile/src/chat/use-agent-chat.ts). History lives on the server, and the stream is `tee`d to persist the thread (routes.ts:309). No resumable stream. VERIFIED.
- **Tools**: about 73 (tools.ts 29, rails 12, intelligence 9, business 8, safety 6, automations 5, everyday 3, money-out 1). Almost all are `propose_*`: the tool resolves and checks, then returns a small result and **nothing moves** (rails-tools.ts:1-4). Execution happens on the card (slide or Face ID). None is an async generator, so none streams progress. VERIFIED.
- **Cards**: tool part `tool-<name>`; any state other than `output-available` shows one pulsing chip with a single label (tool-cards.tsx:651-660, card.tsx `AgentCardLoading`). Then ~40 cards by tool name (tool-cards.tsx switch). Device-side tool (`propose_network_switch`) uses `addToolOutput` (conversation.tsx:158). VERIFIED.
- **Approval**: Kawase does not use the SDK's approval states. Its own rules: inside the allowance a send goes at once only if the person typed the recipient and no outside text was read (trust.ts:1-12, 80-89); otherwise a card waits for a tap. The SDK `experimental_toolApprovalSecret` HMAC is set (turn.ts:107) but I found no `needsApproval`/`toolApproval` in the repo. VERIFIED.
- **Resolve and resume**: already exists as `useResumeWhenFixed` (apps/mobile/src/intents/use-resume.ts): when a blocking code (`WALLET_NOT_READY`, `NO_ALLOWANCE`, `INSUFFICIENT_BALANCE`, `OVER_*`, sign-in) is fixed elsewhere, the card re-checks. Chat-level `ChatResumeProvider` sends text to continue (chat/resume.tsx). Design doc: context/08-product-research/SMART-PRECONDITIONS.md (five kinds: clarification, precondition, policy refusal, warning, error). VERIFIED.
- **Voice**: LiveKit room; a worker calls `POST /voice/turn` (same `agentTurn`), and cards are pushed to the phone over LiveKit RPC (apps/api/src/voice/routes.ts:1-5). Voice uses reasoningEffort "none". VERIFIED.
- **Home** (screens/home-screen.tsx header): balance hero, action row (Add money, Send, Swap, Withdraw), First steps, Needs you, assets, positions, For you, automations, contacts, activity. No agent composer, no feed of what Kawase did. Tabs: Home, Markets, Chat, Activity. The agent is a tab, not the front door. VERIFIED.
- **Model availability**: `hasKeyFor` makes `/agent/chat` throw `agent_unavailable` when the key is missing (routes.ts:352). VERIFIED.

## 2. What AI SDK 7 gives us

1. **Live tool progress (best fit)**: `execute` may be an `async *` generator. Every `yield` is a preliminary result; the last is final (https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling, https://ai-sdk.dev/docs/reference/ai-sdk-core/tool). VERIFIED. The UI stream chunk `tool-output-available` has an optional `preliminary` boolean (https://raw.githubusercontent.com/vercel/ai/main/packages/ai/src/ui-message-stream/ui-message-chunks.ts). VERIFIED. The model only sees the final value, and `toModelOutput` still maps it. Caveat: Kawase's card code treats `output-available` as "final", so a card must check the part's `preliminary` flag (UI-part field: REPORTED, not in docs; confirm on `ai@7.0.122` types after install). Also test that `lastAssistantMessageIsCompleteWithToolCalls` does not fire on a preliminary output (IDEA).
2. **Data parts**: `data-<name>` chunks with optional `id` (same id updates the earlier part, which suits "loading becomes result") and `transient: true` (not stored, read through `onData`) (https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data). VERIFIED. Needs a `writer` from `createUIMessageStream`, which tools do not get; pass an `emit` callback through `AgentContext` (IDEA).
3. **Input streaming**: `onInputStart/Delta/Available` hooks; UI part states `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, `output-denied` (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage). VERIFIED. Use `input-streaming` to draw the card skeleton ("Base to Arc, 250 USDC") before the call completes.
4. **Approval in v7**: `needsApproval` is deprecated; use `toolApproval` (one function or a per-tool map returning `'not-applicable' | 'approved' | 'denied' | 'user-approval'`). Manual approval does not pause; it returns `tool-approval-request` parts, the app answers with `addToolApprovalResponse({id, approved})` and `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` continues (same two pages). VERIFIED. This matches "one approval, or none inside the budget": the function returns `'approved'` when the amount is inside the delegation allowance and the trust rules pass, else `'user-approval'`.
5. **Multi-step**: `stopWhen` (`isStepCount`, `hasToolCall`, `isLoopFinished`), `prepareStep` per step, and `ToolLoopAgent` (default 20 steps) with `createAgentUIStreamResponse` (https://ai-sdk.dev/docs/agents/building-agents). VERIFIED. Kawase's `streamText` + 6 steps is fine; no migration needed.
6. **RN generative UI**: `useChat` in Expo works with `expo/fetch`, needs `structuredClone`, `TextEncoderStream`, `TextDecoderStream` polyfills, Expo 52+ (https://ai-sdk.dev/docs/getting-started/expo). VERIFIED, and Kawase already does this (polyfills.native.ts exists). Rendering is the same switch on `part.type`.
7. **Resumable streams**: need the `resumable-stream` package, **Redis**, an `activeStreamId` in the database, plus GET resume route; a `stop()` becomes a disconnect unless you add a stop endpoint; docs do not mention React Native (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams). VERIFIED. Recommendation: skip it. A money run must not depend on a socket anyway. IDEA: the tool starts the existing durable (DBOS) workflow and returns an id; the live view streams while connected and falls back to polling run status, as `/move` already does (apps/mobile/src/crosschain/move-ticket.tsx). Cost: free.
8. **Route race** (IDEA): a `race_routes` generator tool. Server fires all venue quotes in parallel (swap: KyberSwap, App Kit, LI.FI in apps/api/src/swap/venues.ts; bridge: 5 adapters in packages/integrations/bridges; yield: Aave, Morpho, Merkl) but consumes them **as they complete** instead of `Promise.all`, and yields a full snapshot each time: `{ rows: [{venue, status: "checking"|"quote"|"failed", netOut, fee, eta}], best }`. The card renders one row per venue with its logo, which lights up on arrival, a shimmer while pending, and a "Best" badge moving to the leader; the final yield picks the winner and hands over to the execute step. Per-venue timeout 4 s so one slow venue cannot stall it. Same shape works for vault checks.
9. **Alternatives** (only if clearly better): `assistant-ui` has a native Expo package (`@assistant-ui/react-native`, AI SDK adapter via `@assistant-ui/ai-sdk`) but its tool-UI docs are thin and the maturity is not stated (https://www.assistant-ui.com/docs/react-native), so it would replace a working chat shell for little gain. REPORTED. `json-render` (Vercel Labs) has `@json-render/react-native` with catalog-limited components and progressive rendering; last push seen 2026-03 (https://www.infoq.com/news/2026/03/vercel-json-render). REPORTED. It is for model-composed layouts, which we do not want on a money path: our cards are typed per tool. CopilotKit: I did not verify RN support; not recommended. **Verdict: stay on AI SDK + our cards.** Cost: all free and open source.

## 3. The model problem

Prices are per 1M tokens. Typical turn is my assumption (IDEA): about 20k input tokens (prompt plus tool definitions, over 2 steps, 90 percent cache hit when warm) and 500 output. turn.ts:28-32 measured about $0.0005 a turn for luna on the priority tier, so real prompts may be smaller than my estimate; treat my figures as upper-ish bounds.

| Option | Price in / cached / out | Typical turn, warm cache | Free tier | Tool-calling notes |
|---|---|---|---|---|
| OpenAI gpt-5.6-luna (current default) | $0.2 / $0.02 / $1.2 | about $0.0014; priority tier about 2x | none | Verified working earlier (plan/STATUS.md:121); key now rejected, needs a funded key |
| Claude Haiku 5.5 (`claude-haiku-5-5`) | $0.10 / $0.01 / $0.50 under 100k prompt | about $0.0006; cold (cache write $0.125) about $0.003 | none | Cheapest paid option verified (https://platform.claude.com/docs/en/about-claude/pricing). Strict tool use is documented for Opus, Sonnet and Haiku 4.5; Haiku 5.5 not confirmed; tool quality unmeasured (UNKNOWN) |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 / $0.10 / $10 | about $0.011 warm, up to $0.055 cold | none | Strongest tool-caller here; llm-choice.md:55 lists strict tool use. Too costly to run on every voice and feed turn without a key budget |
| Gemini 3.8 Flash | $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50 | about $0.017 without caching | **Yes, free input and output** | Stable, tool-capable; code already sets `thinkingLevel: low` (turn.ts:119). Rate limits not published on the pricing or rate-limit pages (check AI Studio) |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | about $0.006 | **Yes, free** | Cheapest tool-capable stable option; weaker on 70+ tools (IDEA) |
| OpenRouter `:free` models | $0 | $0 | 20 requests/min, 50/day (1,000/day after a one-time $10 top-up) per a third-party blog | Models rotate without notice; unfit for a demo path (REPORTED, https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) |

Free-tier catch: Google says free-tier content is used to improve its products and humans may read it (pricing page; terms in llm-choice.md:48). So a Gemini free key is fine for the hackathon with test money and not for real users' data. VERIFIED.

**Recommendation** (IDEA): (a) today, set `KAWASE_MODEL_AGENT_CHAT=google:gemini-3.8-flash` on a free AI Studio key, which costs $0 and needs no code change since `google` is already in the registry; (b) fall back to `google:gemini-3.1-flash-lite` when it rate-limits; (c) when Abu can put about $5 on a key, Haiku 5.5 for chat and feed turns (about $0.0006 per turn, so $5 buys roughly 8,000 turns) and Sonnet 5.5 only for the "plan a multi-venue move" planner call. Note ALTERNATIVE_MODELS still lists haiku-4-5 (packages/config/src/models.ts), which Anthropic may retire from 2026-10-15 (llm-choice.md:23), so update it. Add a startup self-test that calls the model once with a trivial tool and shows "agent offline" instead of failing mid-turn. Run a 30-prompt tool-call check on the chosen model before demo day (the cost is cents). I did not measure tool-calling quality; no vendor publishes per-model tool accuracy (UNKNOWN).

## 4. Information architecture (all IDEA unless cited)

### Agent home
Make Home the agent. Top to bottom:
1. **Header** (existing avatar, network pill, bell) and one **hero figure**: total balance (keep portfolio-hero).
2. **Live strip**: while a run is active, a pinned run card (see below) that stays on Home and in the dock.
3. **Feed** of what Kawase did and is doing, newest first, grouped by day.
4. **Composer** docked above the dock: text, mic (voice overlay already exists), and 4 suggestion chips (Bring USDC to Arc, Put idle USDC to work, Buy $50, Send to a contact). The existing chip list in conversation.tsx:166-173 is the seed.
5. Today's sections (assets, positions, automations, contacts) move behind a "Portfolio" tab or below the feed. Tabs become Home (agent), Markets, Activity (the feed's full history), Settings. Chat as its own tab disappears; the thread is the Home feed item you open.

### Live tool view (the "watch it work" card)
One card, four phases, one hero figure:
- **Understand**: skeleton from `input-streaming` ("250 USDC, Base to Arc").
- **Race**: venue rows with real logos (packages/identity has Circle, Aave, Morpho, KyberSwap, LI.FI, Across, Relay, deBridge; missing CCTP, Uniswap, Merkl, Apple/Google Pay per 00-context); rows light up as quotes land; winner badge; "why this one" in one line (net received, time).
- **Approve**: either nothing (inside the budget, shown as "Inside your 500 USDC daily allowance") or one slide/Face ID.
- **Run and receipt**: the step tracker from move-ticket (sign, send, confirm), then a receipt that morphs from the CTA (Mitoshi `TxMorph`, `TxFailureCard` says whether money moved; crypto-world-fair/web/src/components/tx/*). Reduced-motion and sound/haptics follow the Senryo rules in 00-context.

### Cards to screens and back
- Every card has one "Open in <screen>" link that passes the **intent id**, not text: Swap, Move, Buy, Earn, Perps, Marketplace, Send. The screen opens prefilled with the agent's chosen venue and amount, and shows "Kawase picked X" with a one-tap change (swap-review has no venue choice today; add it).
- Reverse: each screen has an "Ask Kawase" bar. It opens Home with a composer prefill and the screen's context (token, vault, position), so "make this a weekly automation" or "find a better rate" works from anywhere.
- Both directions share the same intent record (apps/api/src/intents), so a half-finished flow resumes in either place.

### Smart pop-up (resolve and resume)
Extend what exists (use-resume.ts, SMART-PRECONDITIONS.md): any step that cannot proceed returns a typed blocker, and the agent card turns into a **bottom sheet with exactly the fix**, never an error: unknown name ("drop Alex's address"), missing gas or balance (Add money), no allowance (grant), wrong network (switch), not signed in. When the sheet's job is done, the **same run continues from the failed step** (re-check all facts, do not restart, never auto-send beyond the budget). The sheet closes into the run card. Policy refusals stay terminal and cite the rule (SMART-PRECONDITIONS table row 3).

### Autonomous feed
Modelled on Mitoshi's agent cockpit (crypto-world-fair/web/src/features/agents/DecisionTimeline.tsx, NextDecision.tsx, RecordHero.tsx): a day-grouped timeline, filter chips with counts (All, Done, Held, Failed), each node = time, outcome badge, one-line "call to ruling", the why clamped to two lines, tap opens the detail (the race table, the receipt). Kawase's rows:
- Done: "Moved 250 USDC Base to Arc via Across, saved $0.18 vs next best".
- Held for you: automation or autopay waiting on a tap (reuse Needs you, apps/mobile/src/needs-you/*).
- Skipped with reason: outside budget, venue stale, price moved.
- Watching: next scheduled run with a countdown ring (Mitoshi `NextDecision`), e.g. "Tuesday $10 to Alex in 2d 4h".
- Found: idle USDC could earn 5.1 percent in Morpho (a suggestion, one tap to start; ties to "For you").
Sources: automations, `Needs you`, history and agent threads already exist; the feed is a read model joining them (IDEA; new endpoint, no new money logic). A "Kawase this week" hero (saved, earned, moved) replaces the Mitoshi win-rate figure.

## Build order if time is short (IDEA, deadline 2026-10-17 11:59 PM ET)
1. Model: switch to Gemini free key, add self-test (30 minutes).
2. `race_routes` generator tool + race card for bridge and swap (the demo moment).
3. Feed on Home from existing history/automations/needs-you data, composer on Home.
4. `toolApproval` function wired to the allowance, so in-budget runs need no tap.
5. Venue choice and logos in swap-review; smart sheet reuse.

## Risks
- Preliminary results show as `output-available`; guard cards on `preliminary` or they will look final.
- Persistence: stored threads keep only the final value; the feed should be built from run records, not from stored stream parts.
- Voice: race cards must be forwarded by the worker over LiveKit RPC; only final cards are practical there.
