// The agent's race_routes bound to the route racer (routing/agent-race.ts). No database, no network, no model: a fake
// token search and a fake racer stand in for the services.
// - Symbols Kawase lists and addresses go through as asked; "dollars"/"euros" are USDC/EURC; other names are searched
//   (exact symbol first, never a copycat of a stablecoin).
// - What cannot be resolved or raced is refused with a reason, and race_routes turns the refusal into a quiet note
//   (`direct`, `unknown_token`), never a failed race.
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTools, RaceRefused, turnTrust, type AgentContext } from "@kawase/agent";
import type { AgentRaceRequest, RaceRoutesOutput, RouteRace, RouteRaceRequest, TokenSearchResult } from "@kawase/api-client";

import { agentRaceRoutes, resolveRaceToken, toRouteRaceRequest } from "../src/routing/agent-race";
import { RaceInputError, type RouteRacer } from "../src/routing/racer";
import type { SessionUser } from "../src/types";

const user = { id: "u1", activeNetwork: "testnet", isAnonymous: true } as SessionUser;
const ARGUS = "0x1111111111111111111111111111111111111111";
const FAKE_USDC = "0x2222222222222222222222222222222222222222";
const ARGUS2 = "0x3333333333333333333333333333333333333333";

const found = (address: string, symbol: string, status: TokenSearchResult["token"]["status"]): TokenSearchResult =>
  ({ token: { address, symbol, status }, priceUsd: null, liquidityUsd: null, held: false }) as unknown as TokenSearchResult;

const assets = {
  search: async (_viewer: SessionUser | undefined, _network: string, query: string): Promise<TokenSearchResult[]> => {
    if (/argus/i.test(query)) return [found(ARGUS2, "ARGUS2", "listed"), found(ARGUS, "ARGUS", "unverified")];
    if (/usdc/i.test(query)) return [found(FAKE_USDC, "USDC", "impersonator")];
    return [];
  },
};

const ask = (extra: Partial<AgentRaceRequest>): AgentRaceRequest => ({ kind: "swap", from: null, to: null, amount: null, destination: null, source: null, ...extra });

test("tokens: listed symbols and addresses as asked, currencies by name, others by search (exact symbol first, no copycats)", async () => {
  assert.equal(await resolveRaceToken(assets, user, "testnet", "EURC"), "EURC");
  assert.equal(await resolveRaceToken(assets, user, "testnet", "dollars"), "USDC");
  assert.equal(await resolveRaceToken(assets, user, "testnet", "Euro"), "EURC");
  assert.equal(await resolveRaceToken(assets, user, "testnet", ARGUS), ARGUS);
  assert.equal(await resolveRaceToken(assets, user, "testnet", "argus"), ARGUS, "the exact symbol wins over a better-ranked partial match");
  await assert.rejects(resolveRaceToken(assets, user, "testnet", "nothing-like-it"), (error: unknown) => error instanceof RaceRefused && error.reason === "unknown_token");
});

test("requests: a swap defaults its missing side to USDC; no amount, bringing in, or no destination is quoted directly", async () => {
  assert.deepEqual(await toRouteRaceRequest(assets, user, ask({ from: "USDC", to: "EURC", amount: "2" })), { kind: "swap", tokenIn: "USDC", tokenOut: "EURC", amount: "2" });
  assert.deepEqual(await toRouteRaceRequest(assets, user, ask({ to: "argus", amount: "5" })), { kind: "swap", tokenIn: "USDC", tokenOut: ARGUS, amount: "5" });
  assert.deepEqual(await toRouteRaceRequest(assets, user, ask({ kind: "bridge", amount: "3", destination: "base" })), { kind: "bridge", destination: "base", amount: "3", asset: null, toAsset: null });
  assert.deepEqual(await toRouteRaceRequest(assets, user, ask({ kind: "yield" })), { kind: "yield", asset: "USDC", amount: null });
  const direct = (error: unknown) => error instanceof RaceRefused && error.reason === "direct";
  await assert.rejects(toRouteRaceRequest(assets, user, ask({ from: "USDC", to: "EURC" })), direct);
  await assert.rejects(toRouteRaceRequest(assets, user, ask({ kind: "bridge", amount: "5", source: "base" })), direct);
  await assert.rejects(toRouteRaceRequest(assets, user, ask({ kind: "bridge", amount: "5" })), direct);
});

const SNAPSHOT: RouteRace = { kind: "swap", rows: [], best: null, done: true, quotedAt: "2026-10-14T12:00:00.000Z" };

function fakeRacer(onSwap: (request: Extract<RouteRaceRequest, { kind: "swap" }>) => void, fail?: RaceInputError): RouteRacer {
  return {
    swap: async (_user, request) => {
      if (fail) throw fail;
      onSwap(request);
      return (async function* () {
        yield { ...SNAPSHOT, done: false };
        yield SNAPSHOT;
      })();
    },
    bridge: async () => {
      throw new Error("not in this test");
    },
    yield: async () => {
      throw new Error("not in this test");
    },
  };
}

function context(raceRoutes: ReturnType<typeof agentRaceRoutes>): AgentContext {
  return {
    network: "testnet",
    locale: "en",
    languageName: "English",
    isGuest: true,
    handle: null,
    lastUserText: "swap 2 USDC to EURC",
    surface: "chat",
    raceRoutes: (request: AgentRaceRequest, options: { signal?: AbortSignal | undefined }) => raceRoutes(user, request, options.signal),
    intelligence: { warn: () => undefined } as unknown as AgentContext["intelligence"],
  } as AgentContext;
}

async function outputs(raceRoutes: ReturnType<typeof agentRaceRoutes>, input: Record<string, string>) {
  const tools = buildTools(context(raceRoutes), turnTrust("swap"));
  const run = { toolCallId: "call-race", messages: [] } as never;
  const seen: RaceRoutesOutput[] = [];
  for await (const output of tools.race_routes.execute!(input as never, run) as AsyncIterable<RaceRoutesOutput>) seen.push(output);
  return seen;
}

test("race_routes through the binding: snapshots pass through; refusals and racer input errors become quiet notes", async () => {
  let asked: unknown;
  const ok = await outputs(agentRaceRoutes({ racer: fakeRacer((request) => (asked = request)), assets }), { kind: "swap", from: "USDC", to: "EURC", amount: "2" });
  assert.deepEqual(asked, { kind: "swap", tokenIn: "USDC", tokenOut: "EURC", amount: "2" });
  assert.deepEqual(ok.map((output) => output.status), ["racing", "done"]);

  const unknown = await outputs(agentRaceRoutes({ racer: fakeRacer(() => undefined), assets }), { kind: "swap", from: "USDC", to: "nothing-like-it", amount: "2" });
  assert.deepEqual(unknown.map((output) => (output.status === "routes_unavailable" ? output.reason : output.status)), ["unknown_token"]);

  const sameToken = await outputs(agentRaceRoutes({ racer: fakeRacer(() => undefined, new RaceInputError("same_token")), assets }), { kind: "swap", from: "USDC", to: "USDC", amount: "2" });
  assert.deepEqual(sameToken.map((output) => (output.status === "routes_unavailable" ? output.reason : output.status)), ["direct"]);

  let allowed = 0;
  const limited = await outputs(agentRaceRoutes({ racer: fakeRacer(() => undefined), assets, allow: () => allowed++ < 0 }), { kind: "swap", from: "USDC", to: "EURC", amount: "2" });
  assert.deepEqual(limited.map((output) => (output.status === "routes_unavailable" ? output.reason : output.status)), ["direct"], "over the per-person race budget");
});
