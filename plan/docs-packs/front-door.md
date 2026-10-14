# Docs pack: front-door lane (AI SDK 7.0.122 agent, live tool cards)

Checked 2026-10-14 against the **exact tarballs** `ai@7.0.122`, `@ai-sdk/react@4.0.125`, `@ai-sdk/provider-utils@5.0.51` (their `dist/*.d.ts`, `dist/index.js` and bundled `docs/`; `node_modules` is not installed in the repo), plus `expo@57.0.26`. Context7 (`/vercel/ai`) matched. VERIFIED = read in those files. UNVERIFIED = not run. Nothing to install: every package here is already pinned.

## 0. Corrections to the research report (06)
- **No polyfill is needed.** `polyfills.native.ts` only has `react-native-get-random-values`, but Expo SDK 57's winter runtime installs `structuredClone`, `TextDecoderStream`, `TextEncoderStream` (`expo/src/winter/runtime.native.ts`). VERIFIED. Do not add `@stardazed/streams-text-encoding`.
- **`preliminary` is a real field** on the UI part: `{ state: "output-available"; preliminary?: boolean }` (`ai/dist/index.d.ts`, `UIToolInvocation`). VERIFIED. It is also in the subagents doc.
- **`lastAssistantMessageIsCompleteWithToolCalls` is safe**: it requires `part.preliminary !== true`. Same for `...WithApprovalResponses`. VERIFIED in `dist/index.js`.
- **`ignoreIncompleteToolCalls: true`** (already in turn.ts) drops preliminary-only tool parts from the model's history, so a race cut off by a crash never reaches the model. VERIFIED.

## 1. Generator tools (preliminary results)
```ts
tool({
  description, inputSchema,
  async *execute(input, { abortSignal, toolCallId }) { yield snapshot1; yield finalSnapshot },
  toModelOutput: ({ output }) => ({ type: "json", value: compact(output) }), // output = LAST yield
});
```
- Every `yield` is sent as a `tool-output-available` chunk with `preliminary: true`; the **last** yield is the final result. Each yield **replaces** the previous (send full snapshots, not deltas). All yields share one type. The model only sees `toModelOutput(lastYield)`.
- Server stored/persisted: the last yield loses the flag. Reloaded threads show a normal `output-available`.
- **Blocker in our code: `withQuarantine` (packages/agent/src/quarantine.ts) breaks generators.** Its wrapper is `async (...) => { const output = await execute(...) }`, so a generator comes back as a single object and the card gets `{}`. Make it pass iterables through:
```ts
const isIter = (v: unknown): v is AsyncIterable<unknown> => typeof v === "object" && v !== null && Symbol.asyncIterator in v;
execute: (input, options) => {
  const result = execute(input, options);
  if (!isIter(result)) return (async () => { const output = await result; /* existing onOutside check */ return output; })();
  return (async function* () {
    let last: unknown;
    for await (const v of result) { last = v; yield v; }
    /* run the existing onOutside check once on `last` */
  })();
},
```
  Also register `race_routes` in `UNTRUSTED_FIELDS` (use `TOKEN_IN_SENTENCE`); a test requires every tool to be classified.
- Persistence: routes.ts checkpoints on every change of the tool parts, so each yield writes to the DB. Cheap for ~6 yields; to skip, filter `isToolUIPart(p) && p.preliminary !== true` when computing `nextTools`.

### `race_routes` skeleton (settle-order, snapshot per arrival)
```ts
type Row = { venue: string; status: "checking" | "quote" | "failed"; netOut?: string; feeUsd?: string; etaSec?: number };
export type RaceSnapshot = { phase: "racing" | "done"; rows: Row[]; best: string | null };
type Venue = { id: string; quote(signal: AbortSignal): Promise<Omit<Row, "venue" | "status">> };

async function* raceRoutes(venues: Venue[], opts: { timeoutMs?: number; signal?: AbortSignal }): AsyncGenerator<RaceSnapshot> {
  const rows: Row[] = venues.map((v) => ({ venue: v.id, status: "checking" }));
  const better = (a: Row, b: Row) => BigInt(a.netOut ?? "0") > BigInt(b.netOut ?? "0"); // netOut = integer base units, same asset
  const best = () => rows.filter((r) => r.status === "quote").reduce<Row | null>((m, r) => (!m || better(r, m) ? r : m), null)?.venue ?? null;
  const snap = (phase: RaceSnapshot["phase"]): RaceSnapshot => ({ phase, rows: rows.map((r) => ({ ...r })), best: best() });

  // Each promise NEVER rejects and carries its index, so Promise.race can tell who settled.
  const pending = new Map(venues.map((v, i) => [i, settle(v, i)]));
  function settle(v: Venue, i: number) {
    const signal = AbortSignal.any([AbortSignal.timeout(opts.timeoutMs ?? 4_000), ...(opts.signal ? [opts.signal] : [])]);
    return v.quote(signal).then(
      (q): [number, Row] => [i, { venue: v.id, status: "quote", ...q }],
      (): [number, Row] => [i, { venue: v.id, status: "failed" }], // timeout and error look the same to the card
    );
  }
  yield snap("racing"); // all rows "checking": the card draws logos + shimmer at once
  while (pending.size > 0) {
    const [i, row] = await Promise.race(pending.values());
    pending.delete(i);
    rows[i] = row;
    yield snap(pending.size === 0 ? "done" : "racing");
  }
}
// in the tool:  async *execute(input, { abortSignal }) { yield* raceRoutes(venuesFor(input), { signal: abortSignal }); }
```
Money-path rule: the winner is only a *suggestion*. The final snapshot must carry the quote ids; the `propose_*`/execute step re-quotes before anything moves. Break ties on lower `feeUsd`, then `etaSec`. Quotes with a different output asset must not be compared by `netOut` (convert first). Per-venue 4 s cap keeps one slow venue from stalling the card. UNVERIFIED: not run against real venues.

## 2. Rendering tool parts (mobile)
- Add `preliminary?: boolean` to `ToolPart` in `tool-cards.tsx` (it is missing; the type is hand-written).
- Today `if (part.state !== "output-available") return <AgentCardLoading/>` and everything else is treated as final. Insert **before** that check, for live tools only:
```tsx
if (tool === "race_routes" && (part.state === "output-available" || part.state === "input-available"))
  return <RaceCard snapshot={part.state === "output-available" ? (part.output as RaceSnapshot) : null} live={part.preliminary === true} />;
```
- States in v7: `input-streaming` (input is `DeepPartial`, fields may be undefined: guard every read), `input-available`, `approval-requested`, `approval-responded`, `output-available` (+`preliminary`), `output-error`, `output-denied`. `isToolUIPart(part)` is already used; for a typed switch use `part.type === "tool-race_routes"`.
- Gate buttons on a live card with `!part.preliminary`; `live` cards must not offer "Confirm".
- Perf: `useChat({ throttle: 50 })` batches message-state updates (default: none). Use `Animated.View layout` only on the card, not per row; animate row opacity/translate on arrival with Reanimated, keyed by `row.venue`.

## 3. Approval (`toolApproval`) and `addToolApprovalResponse`
`needsApproval` on a tool is **deprecated**; `streamText({ toolApproval })` takes a function for all tools or a per-tool map. Return values: `undefined | 'not-applicable'` run normally; `'approved'` or `{type:'approved', reason}` records an automatic approval, then runs; `'denied'` / `{type:'denied', reason}` returns a denied output; `'user-approval'` / `{type:'user-approval', reason}` emits a `tool-approval-request` and the turn ends. Function form: `(input, { toolCallId, messages, toolContext, runtimeContext }) => status` (may be async). VERIFIED (`dist/index.d.ts` 3205-3280).
```ts
import { isStepCount, streamText, type ToolSet } from "ai";
const trust = turnTrust(context.lastUserText);           // already in trust.ts; pass the same one to buildTools(context, trust)
const tools = buildTools(context, trust);
streamText({ /* … */ tools,
  experimental_toolApprovalSecret: approvalSecret,        // already set; same value on every instance
  toolApproval: {
    run_route: async ({ amountUsd, recipient }) =>        // a tool that actually moves money from the agent
      trust.hold(recipient ?? "") === null && (await withinAllowance(amountUsd))   // trust.hold(): real (null = may go); withinAllowance: hypothetical, wire to delegation caps
        ? { type: "approved", reason: "Inside your daily allowance" }
        : { type: "user-approval", reason: "Above your allowance" },
  },
});
```
- `propose_*` tools stay as they are (card = approval). `toolApproval` is for tools that **execute** under the delegation.
- Client:
```ts
useChat({ /* … */ sendAutomaticallyWhen: (o) => lastAssistantMessageIsCompleteWithToolCalls(o) || lastAssistantMessageIsCompleteWithApprovalResponses(o) });
// card: part.state === "approval-requested" && !part.approval.isAutomatic →
await chat.addToolApprovalResponse({ id: part.approval.id, approved: true /* or false */, reason });
```
  Automatic approvals show up as `approval-requested`/`approval-responded` with `approval.isAutomatic: true`: never call `addToolApprovalResponse` for those. `part.approval.requestReason` is the reason string for the card.
- Our server already accepts "the last assistant message again with an approval added" (routes.ts `incoming`), and it replaces the stored copy. Keep the whole part (including `approval.signature`) when sending back; the HMAC binds tool name + call id + input.
- **Default that bites:** if `AGENT_APPROVAL_SECRET` is unset, routes.ts makes a random per-process secret, so any pending approval dies on restart and fails across instances. Set it in Coolify. On a bad signature the SDK throws `InvalidToolApprovalSignatureError`: show "this request expired, ask again".
- Denied: tell the model not to retry ("When a tool execution is not approved, do not retry it" in the instructions), or it will re-ask.
- Tools with `toolApproval` still need `execute`; subagent tools cannot use it.

## 4. Data parts and giving tools an emitter
Writer chunks: `{ type: "data-<name>", id?, data, transient? }`. Same `id` updates the earlier part (loading becomes result). `transient: true` is not stored and only reaches `onData`. Type them via `UIMessage<Meta, { route_status: {...} }>`.

Tools do not receive the writer. Use a closure (tool `context` is for validated, immutable data, not functions):
```ts
type Emit = (chunk: InferUIMessageChunk<KawaseMessage>) => void;
const sink: { emit: Emit } = { emit: () => {} };            // put `emit: (c) => sink.emit(c)` on AgentContext
const stream = createUIMessageStream<KawaseMessage>({
  originalMessages: messages, generateId: messageId, onEnd, onError: (e) => { onError(e); return "error"; },
  execute: ({ writer }) => {
    sink.emit = (c) => writer.write(c);
    writer.merge(toUIMessageStream({ stream: result.stream.pipeThrough(watch.stream), tools, originalMessages: messages, generateMessageId: messageId, messageMetadata }));
  },
});
```
`originalMessages`/`onEnd`/`generateId` must sit on the **outer** `createUIMessageStream` or persisted messages will miss the data parts (`handleUIMessageStreamFinish` runs there). UNVERIFIED: whether the inner `start` chunk also needs `sendStart:false`; test that exactly one `start` arrives and the message id stays stable on an approval continuation. Prefer plain generator yields for the race; use data parts only for side channels (toasts, voice cues).

## 5. Loop control
- `stopWhen: isStepCount(6)` is right (`ToolLoopAgent` would default to 20). Combine: `[isStepCount(6), hasToolCall("race_routes")]` stops the turn right after the race so the card is the answer (saves a model call; the model gets no chance to narrate; decide per UX).
- `prepareStep({ stepNumber, steps, messages })` can return `model`, `toolChoice`, `activeTools`, `instructions`, `messages`, `reasoning`, `temperature`, `maxOutputTokens`. Two useful uses: `activeTools` narrowed after the first tool call; `toolChoice: "none"` when the last step already produced a `propose_*` card, to force a one-line wrap-up instead of another tool call. A `messages` override persists into later steps.
- A turn also ends on a tool without `execute` and on any pending approval.

## 6. `useChat` on Expo
Already correct: `DefaultChatTransport` + `fetch: expoFetch` on native, `headers` async bearer, `prepareSendMessagesRequest` sends only the newest message. Notes: `expo/fetch` is required for streaming on native; web uses the global fetch. Expo's own guide sets `Content-Type: application/octet-stream` + `Content-Encoding: none` only for Expo API routes that buffer; ours is Hono behind Traefik (streams fine per the spike). Resumable streams: skip (needs Redis, not documented for RN). `onData` receives transient data parts.

## 7. Gotchas
1. Quarantine wrapper vs generators (section 1). Most important.
2. Card code that treats `output-available` as final shows partial data as done.
3. Each yield replaces the output; large snapshots are re-sent whole. Keep rows small (no logos or base64 in output; send venue ids, the app maps ids to logos).
4. `input-streaming` input is partial; guard reads.
5. Voice (`/voice/turn`, same `agentTurn`) forwards only final cards over LiveKit; make the tool's final yield self-sufficient, and don't emit data parts on that surface.
6. SDK 7 still labels `experimental_toolApprovalSecret`/`experimental_` options as unstable; pin `ai` exactly (as now).
7. Open issues, none blocking: vercel/ai#9306 (a request for an `output-streaming` state), #17606 (repeated-tool-call stop condition).

## Sources
- Bundled docs inside `ai@7.0.122`: `docs/03-agents/{06-tool-approvals,06-subagents,04-loop-control}.mdx`, `docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx`, `docs/04-ai-sdk-ui/{03-chatbot-tool-usage,20-streaming-data}.mdx`, `docs/02-getting-started/07-expo.mdx`
- Public: https://ai-sdk.dev/docs/agents/tool-approvals · /docs/agents/subagents · /docs/agents/loop-control · /docs/ai-sdk-core/tools-and-tool-calling · /docs/ai-sdk-ui/streaming-data · /docs/ai-sdk-ui/chatbot-tool-usage · /docs/getting-started/expo
- Types read: `ai/dist/index.d.ts`, `@ai-sdk/provider-utils/dist/index.d.ts` (`ToolExecuteFunction`, `ToolExecutionOptions`), `@ai-sdk/react/dist/index.d.ts` (`throttle`, `addToolApprovalResponse`), `expo/src/winter/runtime.native.ts`
- Context7: `/vercel/ai` (versions list includes `ai_7.0.0`)
