// race_routes (D37/D7, "watch it work"): the agent asks every venue for a quote at once and the card shows each venue's
// answer the moment it lands — logos lighting up, "Best" moving to the leader — instead of one spinner and a single
// answer. The tool is an `async *execute`: every snapshot it yields reaches the card as a preliminary result, and the
// last one is what the model reads. The race itself comes from the api (`context.raceRoutes`, bound to the Routes
// lane's apps/api/src/routing/race.ts); without it the tool says "routes_unavailable" and never invents a quote.
// The winner is only a suggestion: propose_trade / propose_bridge / bring_to_arc / compare_yield take the chosen
// venue and quote it again before anything can move.
import { tool } from "ai";
import { z } from "zod";

import type { RaceRoutesOutput, RouteQuote, RouteRace, RouteRaceRequest } from "@kawase/api-client";

import type { AgentContext } from "./context";
import { BARE } from "./quarantine";

const CHAINS = ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"] as const;
const ASSET_MAX = 64;
/** Rows the model reads (quoted ones, best first); the card has them all. */
const MODEL_ROWS = 6;
const BPS_PER_PERCENT = 100;
const DECIMAL_BASE = 10n;

/** A token amount in base units as a plain decimal ("1234567", 6 → "1.234567"), trailing zeros dropped. */
export function decimalOf(amount: string, decimals: number): string {
  if (!/^\d+$/.test(amount)) return amount;
  const value = BigInt(amount);
  const unit = DECIMAL_BASE ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

const hasNet = (row: RouteQuote) => row.net !== null && /^\d+$/.test(row.net);
const hasRate = (row: RouteQuote) => typeof row.apyBps === "number";

/** Whether a row can be Kawase's pick: quoted, executable, with something to rank by (what arrives; a yield's rate). */
const pickable = (kind: RouteRace["kind"]) => (row: RouteQuote) =>
  row.status === "quoted" && row.executable && (kind === "yield" ? hasRate(row) || hasNet(row) : hasNet(row));

const byLowerCost = (a: RouteQuote, b: RouteQuote) =>
  (a.feeUsd ?? Number.POSITIVE_INFINITY) - (b.feeUsd ?? Number.POSITIVE_INFINITY) || (a.etaSeconds ?? Number.POSITIVE_INFINITY) - (b.etaSeconds ?? Number.POSITIVE_INFINITY);

/**
 * The leader among pickable rows, when the race's own pick cannot stand: a yield's highest rate; otherwise the most that
 * arrives (rows in the same asset only: amounts in different assets are never compared), then the lower fee, then the
 * faster.
 */
function leader(kind: RouteRace["kind"], rows: readonly RouteQuote[]): string | null {
  const candidates = rows.filter(pickable(kind));
  if (kind === "yield") return [...candidates].sort((a, b) => (b.apyBps ?? 0) - (a.apyBps ?? 0) || byLowerCost(a, b))[0]?.venue ?? null;
  const asset = candidates[0]?.receive?.symbol;
  const comparable = candidates.filter((row) => row.receive?.symbol === asset);
  const ranked = comparable.sort((a, b) => {
    const [left, right] = [BigInt(a.net!), BigInt(b.net!)];
    return left === right ? byLowerCost(a, b) : right > left ? 1 : -1;
  });
  return ranked[0]?.venue ?? null;
}

/**
 * The race as the card and the model may trust it: `best` must name a pickable row (never a failed or checking one;
 * when the race's own pick is not one, the leader among the quoted rows takes its place), and a finished race has no
 * row left "checking" (a venue that never answered timed out).
 */
export function settleRace(race: RouteRace, finished: boolean): RouteRace {
  const rows = finished
    ? race.rows.map((row) => (row.status === "checking" ? { ...row, status: "failed" as const, reason: row.reason ?? "timeout" } : row))
    : race.rows;
  const named = rows.find((row) => row.venue === race.best);
  const best = named && pickable(race.kind)(named) ? named.venue : leader(race.kind, rows);
  return { ...race, rows, best, done: finished || race.done };
}

const unavailable = (request: RouteRaceRequest, reason: "not_bound" | "failed" | "no_venues"): RaceRoutesOutput => ({
  status: "routes_unavailable",
  request,
  race: null,
  reason,
});

/** Which propose step takes the race's pick, by kind (the model is told, so it carries the venue across). */
const NEXT_STEP: Record<RouteRaceRequest["kind"], string> = {
  swap: "propose_trade",
  bridge: "propose_bridge (bring_to_arc when moving to Arc)",
  yield: "compare_yield, then propose_earn or propose_supply",
};

/**
 * One amount as the model reads it: "1.7125 EURC" when the symbol is a bare one (it cannot carry a sentence), else the
 * number with the symbol apart under `symbol`, where the quarantine fences it as outside text.
 */
function amountForModel(amount: RouteQuote["receive"]): { receive: string | null; symbol?: string } {
  if (!amount) return { receive: null };
  const value = decimalOf(amount.amount, amount.decimals);
  return BARE.test(amount.symbol) ? { receive: `${value} ${amount.symbol}` } : { receive: value, symbol: amount.symbol };
}

/**
 * What the model reads of a race: venue ids and numbers, the quoted rows best first, and what to do next. Never the
 * venues' display names, the rows' facts or the logos: the card has those, and a vault's name is its curator's text.
 */
export function raceForModel(output: RaceRoutesOutput) {
  if (output.status === "routes_unavailable")
    return {
      status: output.status,
      kind: output.request.kind,
      summary:
        output.reason === "not_bound"
          ? "Kawase cannot compare venues live right now. Do not name venues or prices; go straight to the propose step, which quotes on its own."
          : "No venue answered. Do not invent a quote; say so and offer to try again.",
    };
  const { race } = output;
  const quoted = race.rows
    .filter((row) => row.status === "quoted")
    .sort((a, b) => (a.venue === race.best ? -1 : b.venue === race.best ? 1 : 0))
    .slice(0, MODEL_ROWS)
    .map((row) => ({
      venue: row.venue,
      ...amountForModel(row.receive),
      feeUsd: row.feeUsd,
      etaSeconds: row.etaSeconds,
      apyPct: row.apyBps === null || row.apyBps === undefined ? null : row.apyBps / BPS_PER_PERCENT,
      executable: row.executable,
    }));
  return {
    status: output.status,
    kind: race.kind,
    best: race.best,
    quoted,
    notQuoted: race.rows.filter((row) => row.status !== "quoted").map((row) => ({ venue: row.venue, reason: row.reason })),
    next: race.best
      ? `The card shows the race. Suggest ${race.best} in one short line, then call ${NEXT_STEP[output.request.kind]} with venue "${race.best}" (or the venue the person picks); it quotes again before anything moves.`
      : "No venue can do this right now: say why in one line, from notQuoted.",
  };
}

export function raceTools(context: AgentContext) {
  return {
    race_routes: tool({
      description:
        "Race every venue for a swap (any pair on Arc), a bridge (Arc to another chain, or bring to Arc from one) or a yield (where an asset earns most). Every venue is asked at once; the card shows each venue's logo light up as its quote lands and 'Best' move to the leader, so the person watches Kawase shop around. Call it first when the person asks to swap, bridge, move or earn and named an amount, then call the propose step with the race's best venue (the result says which). Nothing moves from this call, and the best is only a suggestion: the propose step quotes it again.",
      inputSchema: z.object({
        kind: z.enum(["swap", "bridge", "yield"]),
        from: z.string().max(ASSET_MAX).optional().describe("Swap: what they give up (symbol, name or 0x address); bridge or yield: the asset, omit for USDC"),
        to: z.string().max(ASSET_MAX).optional().describe("Swap only: what they want"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Digits with a dot, in the from asset; omit if they did not say"),
        destination: z.enum(CHAINS).optional().describe("Bridge out of Arc: the chain they named"),
        source: z.enum(CHAINS).optional().describe("Bring to Arc: the chain the money is on"),
      }),
      async *execute(input, { abortSignal }): AsyncGenerator<RaceRoutesOutput, void, unknown> {
        const request: RouteRaceRequest = {
          kind: input.kind,
          from: input.from ?? null,
          to: input.to ?? null,
          amount: input.amount ?? null,
          destination: input.destination ?? null,
          source: input.source ?? null,
        };
        if (!context.raceRoutes) {
          yield unavailable(request, "not_bound");
          return;
        }
        let last: RouteRace | null = null;
        try {
          for await (const snapshot of context.raceRoutes(request, { signal: abortSignal })) {
            last = snapshot;
            const race = settleRace(snapshot, snapshot.done);
            yield { status: race.done ? "done" : "racing", request, race };
            if (race.done) return;
          }
        } catch (error) {
          context.intelligence.warn(error, "route race failed");
          // The quotes that did land stay real; the rest timed out. With none, nothing is shown as a quote.
          yield last ? { status: "done", request, race: settleRace(last, true) } : unavailable(request, "failed");
          return;
        }
        // The race ended without saying it was done: whoever had not answered timed out.
        yield last && last.rows.length > 0 ? { status: "done", request, race: settleRace(last, true) } : unavailable(request, "no_venues");
      },
      toModelOutput: ({ output }) => ({ type: "json", value: raceForModel(output) }),
    }),
  };
}
