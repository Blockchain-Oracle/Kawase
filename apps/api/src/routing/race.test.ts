// The race's contract, without the network: rows start `checking`, one snapshot per answer, a venue past the
// timeout fails, `best` is the highest net among executable quoted rows, the last snapshot is `done`.
// Run: pnpm --filter @kawase/api exec tsx --test src/routing/race.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { RouteQuote, RouteRace } from "@kawase/api-client";

import { checkingRow, raceRoutes, rankRows, type RaceAttempt } from "./race";

const quoted = (venue: string, net: string, executable = true): RouteQuote => ({ ...checkingRow(venue, `venue:${venue}`, venue), status: "quoted", receive: { amount: net, symbol: "EURC", decimals: 6 }, net, executable, reason: executable ? null : "not_enabled" });
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const attempt = (venue: string, ms: number, row: RouteQuote | Error): RaceAttempt => ({
  pending: [checkingRow(venue, `venue:${venue}`, venue)],
  result: row instanceof Error ? after(ms, null).then(() => Promise.reject(row)) : after(ms, [row]),
});

test("one snapshot per answer, best moves to the leader, a slow venue times out", async () => {
  const snapshots: RouteRace[] = [];
  for await (const snapshot of raceRoutes(
    "swap",
    [attempt("kyberswap", 30, quoted("kyberswap", "8926880")), attempt("zerox", 10, quoted("zerox", "8912940")), attempt("socket", 20, quoted("socket", "9999999", false)), attempt("app_kit", 500, quoted("app_kit", "9000000")), attempt("lifi", 15, new Error("no route"))],
    { timeoutMs: 100 },
  ))
    snapshots.push(snapshot);

  assert.equal(snapshots.length, 6);
  assert.ok(snapshots[0]!.rows.every((row) => row.status === "checking"));
  assert.equal(snapshots[0]!.best, null);
  assert.equal(snapshots[1]!.best, "zerox");
  // A higher net Kawase cannot execute never becomes best.
  assert.equal(snapshots[3]!.best, "zerox");
  assert.equal(snapshots[4]!.best, "kyberswap");
  const last = snapshots[snapshots.length - 1]!;
  assert.equal(last.done, true);
  assert.equal(last.rows.find((row) => row.venue === "app_kit")?.reason, "timeout");
  assert.equal(last.rows.find((row) => row.venue === "lifi")?.status, "failed");
  assert.deepEqual(
    last.rows.map((row) => row.venue),
    ["kyberswap", "zerox", "socket", "app_kit", "lifi"],
  );
  assert.ok(snapshots.slice(0, -1).every((snapshot) => !snapshot.done));
});

test("ranking: executable by net, then not executable, then checking, then failed", () => {
  const rows = rankRows([checkingRow("a", "venue:a", "a"), quoted("b", "5"), { ...checkingRow("c", "venue:c", "c"), status: "failed", reason: "timeout" }, quoted("d", "7", false), quoted("e", "6")]);
  assert.deepEqual(
    rows.map((row) => row.venue),
    ["e", "b", "d", "a", "c"],
  );
});

test("no attempts: one done snapshot", async () => {
  const snapshots: RouteRace[] = [];
  for await (const snapshot of raceRoutes("bridge", [])) snapshots.push(snapshot);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]!.done, true);
});
