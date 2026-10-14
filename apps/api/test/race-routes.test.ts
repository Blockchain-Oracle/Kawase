// race_routes and the budget's approval (front-door lane, D37/D38). No database, no network, no model: a stub race
// stands in for the Routes lane's race.ts and a mock model for the provider.
// - The quarantine passes every snapshot of a generator tool through (it used to flatten it into one awaited value).
// - The stream carries every snapshot as a preliminary tool output, then the last one again as final.
// - Without a bound race the tool says routes_unavailable and invents nothing.
// - A money step goes without a tap only inside the budget, with no outside text read and to the person themselves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isStepCount, simulateReadableStream, streamText, toUIMessageStream, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { buildTools, decideApproval, raceForModel, settleRace, toolApprovals, turnTrust, type AgentContext } from "@kawase/agent";
import type { BudgetAction, RaceRoutesOutput, RouteQuote, RouteRace, RouteRaceRequest } from "@kawase/api-client";

const run = { toolCallId: "call-race", messages: [] } as never;

const row = (venue: string, status: RouteQuote["status"], net: string | null = null): RouteQuote => ({
  venue,
  mark: `venue:${venue}`,
  label: venue,
  status,
  receive: net ? { amount: net, symbol: "EURC", decimals: 6 } : null,
  net,
  feeUsd: net ? 0.01 : null,
  etaSeconds: net ? 4 : null,
  detail: [],
  executable: status === "quoted",
  reason: status === "failed" ? "no_route" : null,
});

/** Three snapshots, as a race reports them: all asked, one answer, then the rest (the leader changes). */
const SNAPSHOTS: RouteRace[] = [
  { kind: "swap", rows: [row("kyberswap", "checking"), row("lifi", "checking"), row("app_kit", "checking")], best: null, done: false, quotedAt: "2026-10-14T12:00:00.000Z" },
  { kind: "swap", rows: [row("kyberswap", "quoted", "1710000"), row("lifi", "checking"), row("app_kit", "checking")], best: "kyberswap", done: false, quotedAt: "2026-10-14T12:00:01.000Z" },
  { kind: "swap", rows: [row("kyberswap", "quoted", "1710000"), row("lifi", "quoted", "1712500"), row("app_kit", "failed")], best: "lifi", done: true, quotedAt: "2026-10-14T12:00:02.000Z" },
];

function fakeContext(extra: Partial<AgentContext> = {}): AgentContext {
  const warnings: unknown[] = [];
  return {
    network: "testnet",
    locale: "en",
    languageName: "English",
    isGuest: false,
    handle: null,
    lastUserText: "swap 2 USDC to EURC",
    surface: "chat",
    intelligence: { warn: (error: unknown) => warnings.push(error) } as unknown as AgentContext["intelligence"],
    ...extra,
  } as AgentContext;
}

async function* stubRace(request: RouteRaceRequest): AsyncGenerator<RouteRace> {
  assert.equal(request.kind, "swap");
  for (const snapshot of SNAPSHOTS) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    yield snapshot;
  }
}

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const seen: T[] = [];
  for await (const value of iterable) seen.push(value);
  return seen;
};

test("a stub race's 3 snapshots all pass through the quarantine, in order, the last one final", async () => {
  const trust = turnTrust("swap 2 USDC to EURC");
  const tools = buildTools(fakeContext({ raceRoutes: (request) => stubRace(request) }), trust);
  const result = tools.race_routes.execute!({ kind: "swap", from: "USDC", to: "EURC", amount: "2" }, run);
  assert.ok(Symbol.asyncIterator in (result as object), "the guarded tool is still a generator");
  const snapshots = await collect(result as AsyncIterable<RaceRoutesOutput>);
  assert.equal(snapshots.length, 3);
  assert.deepEqual(
    snapshots.map((snapshot) => [snapshot.status, snapshot.race?.best ?? null]),
    [
      ["racing", null],
      ["racing", "kyberswap"],
      ["done", "lifi"],
    ],
  );
  assert.deepEqual(snapshots[2]!.race?.rows.map((quote) => quote.status), ["quoted", "quoted", "failed"]);
  // The rows carry token symbols (outside text): once the race ran, a later send waits for the person's tap.
  assert.deepEqual(trust.outside, ["token contract or vault curator"]);
  // The model reads the final snapshot only, compact, best first, and is told to carry the venue to the propose step.
  const view = raceForModel(snapshots[2]!);
  assert.equal(view.status, "done");
  assert.equal("quoted" in view ? view.quoted[0]!.venue : null, "lifi");
  assert.equal("quoted" in view ? view.quoted[0]!.receive : null, "1.7125 EURC");
  assert.match(String("next" in view ? view.next : ""), /propose_trade with venue "lifi"/);
});

test("the UI stream carries every snapshot: preliminary while racing, the last one final", async () => {
  const tools = buildTools(fakeContext({ raceRoutes: (request) => stubRace(request) }));
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "tool-call", toolCallId: "call-race", toolName: "race_routes", input: JSON.stringify({ kind: "swap", from: "USDC", to: "EURC", amount: "2" }) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ],
      }),
    }),
  });
  const result = streamText({ model, prompt: "swap 2 USDC to EURC", tools, stopWhen: isStepCount(1) });
  const chunks = await collect(toUIMessageStream({ stream: result.stream, tools }) as unknown as AsyncIterable<UIMessageChunk>);
  const outputs = chunks.filter((chunk): chunk is Extract<UIMessageChunk, { type: "tool-output-available" }> => chunk.type === "tool-output-available");
  // Each of the 3 snapshots streams as a preliminary output the moment it lands; the SDK then repeats the last as final.
  assert.equal(outputs.length, 4, chunks.map((chunk) => chunk.type).join(","));
  assert.deepEqual(outputs.map((chunk) => chunk.preliminary === true), [true, true, true, false]);
  assert.deepEqual(outputs.slice(0, 3).map((chunk) => (chunk.output as RaceRoutesOutput).race?.best ?? null), [null, "kyberswap", "lifi"]);
  assert.deepEqual(outputs[3]!.output, outputs[2]!.output);
});

test("without a bound race the tool says routes_unavailable once and shows no quote", async () => {
  const tools = buildTools(fakeContext());
  const snapshots = await collect(tools.race_routes.execute!({ kind: "bridge", amount: "5", destination: "base" }, run) as AsyncIterable<RaceRoutesOutput>);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]!.status, "routes_unavailable");
  assert.equal(snapshots[0]!.race, null);
});

test("a race that breaks keeps the quotes that landed and marks the rest timed out; a best that is not quoted is dropped", async () => {
  async function* breaking(): AsyncGenerator<RouteRace> {
    yield SNAPSHOTS[1]!;
    throw new Error("venue socket closed");
  }
  const tools = buildTools(fakeContext({ raceRoutes: () => breaking() }));
  const snapshots = await collect(tools.race_routes.execute!({ kind: "swap", from: "USDC", to: "EURC", amount: "2" }, run) as AsyncIterable<RaceRoutesOutput>);
  const last = snapshots.at(-1)!;
  assert.equal(last.status, "done");
  assert.deepEqual(last.race?.rows.map((quote) => [quote.status, quote.reason]), [["quoted", null], ["failed", "timeout"], ["failed", "timeout"]]);
  assert.equal(settleRace({ ...SNAPSHOTS[0]!, best: "lifi" }, false).best, null, "a checking row is never the pick");
});

test("approval: inside the budget it goes without a tap; outside text, someone else, no budget or over it waits", async () => {
  const asked: BudgetAction[] = [];
  const budget = { allows: async (action: BudgetAction) => (asked.push(action), Number(action.amount) <= 10) };
  const context = fakeContext({ budget });
  const clean = turnTrust("swap 2 USDC to EURC");
  assert.deepEqual(await decideApproval(context, clean, "propose_trade", { from: "USDC", to: "EURC", amount: "2", venue: "lifi" } as never), { type: "approved", reason: "inside_budget" });
  assert.deepEqual(asked[0], { tool: "propose_trade", kind: "swap", amount: "2", asset: "USDC", venue: "lifi", recipient: null, network: "testnet" });
  assert.deepEqual(await decideApproval(context, clean, "propose_trade", { from: "USDC", amount: "50" }), { type: "user-approval", reason: "over_budget" });
  const read = turnTrust("swap 2 USDC to EURC");
  read.read("x402 seller");
  assert.deepEqual(await decideApproval(context, read, "propose_trade", { from: "USDC", amount: "2" }), { type: "user-approval", reason: "outside_text" });
  assert.deepEqual(await decideApproval(context, clean, "propose_bridge", { amount: "2", recipient: "@ada" }), { type: "user-approval", reason: "other_recipient" });
  assert.deepEqual(await decideApproval(fakeContext(), clean, "propose_bridge", { amount: "2" }), { type: "user-approval", reason: "no_budget" });
  assert.equal(await decideApproval(context, clean, "propose_trade", { from: "USDC" }), "not-applicable", "no amount: the card asks how much first");
  const broken = fakeContext({ budget: { allows: async () => Promise.reject(new Error("ledger down")) } });
  assert.deepEqual(await decideApproval(broken, clean, "propose_earn", { amount: "1" }), { type: "user-approval", reason: "over_budget" }, "a failing budget check never approves");
  assert.equal(await decideApproval(fakeContext({ surface: "voice" }), clean, "propose_trade", { from: "USDC", amount: "2" }), "not-applicable", "by voice the card's own confirm stays");
  assert.deepEqual(Object.keys(toolApprovals(context, clean)).sort(), ["bring_to_arc", "propose_bridge", "propose_earn", "propose_supply", "propose_swap", "propose_trade"]);
});

test("in the stream: inside the budget the step is approved automatically and runs; otherwise it stops at an approval request", async () => {
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const callTrade = () =>
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "tool-call", toolCallId: "call-trade", toolName: "propose_trade", input: JSON.stringify({ from: "USDC", to: "EURC", amount: "2", venue: "lifi" }) },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
          ],
        }),
      }),
    });
  const trades: unknown[] = [];
  const proposeTrade = async (input: unknown) => (trades.push(input), { intent: { id: "intent-1" }, summary: { status: "ready" } }) as never;
  const turn = async (context: AgentContext) => {
    const trust = turnTrust(context.lastUserText);
    const tools = buildTools(context, trust);
    const result = streamText({ model: callTrade(), prompt: "swap 2 USDC to EURC", tools, toolApproval: toolApprovals(context, trust), experimental_toolApprovalSecret: "test-secret-test-secret-test-secret", stopWhen: isStepCount(1) });
    return collect(toUIMessageStream({ stream: result.stream, tools }) as unknown as AsyncIterable<UIMessageChunk>);
  };
  const inside = await turn(fakeContext({ proposeTrade, budget: { allows: async () => true } }));
  const request = inside.find((chunk) => chunk.type === "tool-approval-request") as { isAutomatic?: boolean } | undefined;
  assert.equal(request?.isAutomatic, true, inside.map((chunk) => chunk.type).join(","));
  assert.ok(inside.some((chunk) => chunk.type === "tool-output-available"), "the step ran");
  assert.deepEqual(trades, [{ from: "USDC", to: "EURC", amount: "2", venue: "lifi" }], "the race's venue reaches the propose step");
  const waiting = await turn(fakeContext({ proposeTrade }));
  const asked = waiting.find((chunk) => chunk.type === "tool-approval-request") as { isAutomatic?: boolean } | undefined;
  assert.ok(asked && !asked.isAutomatic, waiting.map((chunk) => chunk.type).join(","));
  assert.equal(waiting.some((chunk) => chunk.type === "tool-output-available"), false, "nothing ran before the person's answer");
  assert.equal(trades.length, 1);
});
