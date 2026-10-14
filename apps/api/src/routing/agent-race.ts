// The agent's race_routes, bound to the route racer (D7). The model names things the way the person did ("2 USDC to
// EURC", "my ARGUS", "to Base"); the racer takes a RouteRaceRequest with resolved tokens and a destination. This maps one
// to the other: a symbol Kawase lists or a 0x address goes through as is, "dollars"/"euros" are USDC/EURC, and any other
// name is found the way propose_trade finds it (held and verified first, never a copycat of a stablecoin). What cannot be
// resolved or raced is refused with a reason (RaceRefused), never raced with a guess:
//   - a token that is not found → unknown_token (the agent asks which one was meant);
//   - bringing money to Arc, no amount yet, an asset or chain the race does not cover, or this person's race budget for
//     the minute spent → direct (the propose step quotes on its own).
import { isAddress } from "viem";

import { RaceRefused } from "@kawase/agent";
import type { AgentRaceRequest, RouteRace, RouteRaceRequest } from "@kawase/api-client";
import { CANONICAL_TOKENS, normalizeSymbol, type NetworkId } from "@kawase/networks";

import type { AgentRaceRoutes } from "../agent/context";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import { RaceInputError, type RouteRacer } from "./racer";

const DOLLAR = /^(dollars?|usd)$/i;
const EURO = /^(euros?|eur)$/i;
/** What a swap pays with when the person named only what they want (a buy), and gets for a sale (as propose_trade). */
const DEFAULT_SIDE = "USDC";

/** A token as the racer takes it: a listed symbol or an address; any other name resolved through the token search. */
export async function resolveRaceToken(assets: Pick<AssetService, "search">, user: SessionUser, network: NetworkId, text: string): Promise<string> {
  const value = text.trim();
  if (DOLLAR.test(value)) return "USDC";
  if (EURO.test(value)) return "EURC";
  if (isAddress(value)) return value;
  const wanted = normalizeSymbol(value);
  if (CANONICAL_TOKENS[network].some((token) => normalizeSymbol(token.symbol) === wanted)) return value;
  const found = (await assets.search(user, network, value).catch(() => [])).filter((result) => result.token.status !== "impersonator");
  const best = found.find((result) => normalizeSymbol(result.token.symbol) === wanted) ?? found[0];
  if (!best) throw new RaceRefused("unknown_token");
  return best.token.address;
}

/** The racer's request for what the agent asked, or a refusal. */
export async function toRouteRaceRequest(assets: Pick<AssetService, "search">, user: SessionUser, request: AgentRaceRequest): Promise<RouteRaceRequest> {
  const network = user.activeNetwork;
  if (request.kind === "yield") return { kind: "yield", asset: await resolveRaceToken(assets, user, network, request.from ?? DEFAULT_SIDE), amount: request.amount };
  // Every other race prices an amount: without one the propose step asks for it.
  if (!request.amount) throw new RaceRefused("direct");
  if (request.kind === "swap") {
    const [tokenIn, tokenOut] = await Promise.all([resolveRaceToken(assets, user, network, request.from ?? DEFAULT_SIDE), resolveRaceToken(assets, user, network, request.to ?? DEFAULT_SIDE)]);
    return { kind: "swap", tokenIn, tokenOut, amount: request.amount };
  }
  // The race moves USDC out of Arc; bringing money in is quoted by bring_to_arc itself.
  if (request.source || !request.destination) throw new RaceRefused("direct");
  return { kind: "bridge", destination: request.destination, amount: request.amount, asset: request.from, toAsset: request.to };
}

export type AgentRaceDeps = {
  racer: RouteRacer;
  assets: Pick<AssetService, "search">;
  /** One race from this person may start now (the same per-person budget as POST /routes/race). */
  allow?: ((user: SessionUser) => boolean) | undefined;
};

/** AgentDeps.raceRoutes: each snapshot as venues answer, the last `done`; a refusal is thrown before anything is asked. */
export function agentRaceRoutes(deps: AgentRaceDeps): AgentRaceRoutes {
  return async function* race(user, request, signal): AsyncGenerator<RouteRace> {
    const routeRequest = await toRouteRaceRequest(deps.assets, user, request);
    if (deps.allow && !deps.allow(user)) throw new RaceRefused("direct");
    let snapshots: AsyncGenerator<RouteRace>;
    try {
      snapshots = routeRequest.kind === "swap" ? await deps.racer.swap(user, routeRequest) : routeRequest.kind === "bridge" ? await deps.racer.bridge(user, routeRequest) : await deps.racer.yield(user, routeRequest);
    } catch (error) {
      if (error instanceof RaceInputError) throw new RaceRefused(error.code === "unknown_token" ? "unknown_token" : "direct");
      throw error;
    }
    for await (const snapshot of snapshots) {
      // The turn was stopped: the venues still answering time out on their own (4 s), nobody reads them.
      if (signal?.aborted) return;
      yield snapshot;
    }
  };
}
