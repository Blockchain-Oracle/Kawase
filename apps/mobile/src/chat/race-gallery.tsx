// /dev/gallery only: the race card replaying a recorded race, snapshot by snapshot, exactly as race_routes streams
// them (every snapshot but the last arrives as a preliminary part), then a finished swap race, a race no venue could
// answer, the "quoting directly" note, the approval ask and the agent-offline state. Sample data lives here and
// nowhere else (premium bar §5).
import * as React from "react";
import { View } from "react-native";

import type { RaceRoutesOutput, RouteQuote, RouteRace, RouteRaceRequest } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { AgentOffline } from "./agent-offline";
import { ApprovalCard, InsideBudgetChip, NotDoneCard } from "./approval-card";
import { AgentCard } from "./card";
import { RaceCard } from "./race-card";

/** Between two recorded snapshots, as the venues answered (4 s cap per venue). */
const STEP_MS = 700;

const SWAP: RouteRaceRequest = { kind: "swap", from: "USDC", to: "EURC", amount: "2", destination: null, source: null };
const BRING_IN: RouteRaceRequest = { kind: "bridge", from: "USDC", to: null, amount: "5", destination: null, source: "base" };

const row = (venue: string, label: string): RouteQuote => ({
  venue,
  mark: `venue:${venue}`,
  label,
  status: "checking",
  receive: null,
  net: null,
  feeUsd: null,
  etaSeconds: null,
  detail: [],
  executable: false,
  reason: null,
});

const quoted = ({ symbol, amount, feeUsd, etaSeconds }: { symbol: string; amount: string; feeUsd: number; etaSeconds: number }): Partial<RouteQuote> => ({
  status: "quoted",
  receive: { amount, symbol, decimals: 6 },
  net: amount,
  feeUsd,
  etaSeconds,
  executable: true,
});

type Answer = { index: number; patch: Partial<RouteQuote>; leader: string | null };

/** One snapshot per answer, as race_routes yields them: all asked first, then each venue as it answers. */
function record(kind: RouteRace["kind"], venues: RouteQuote[], answers: Answer[]): RouteRace[] {
  const snapshots: RouteRace[] = [{ kind, rows: venues, best: null, done: false, quotedAt: "2026-10-14T12:00:00.000Z" }];
  let rows = venues;
  answers.forEach(({ index, patch, leader }, step) => {
    rows = rows.map((entry, position) => (position === index ? { ...entry, ...patch } : entry));
    snapshots.push({ kind, rows, best: leader, done: step === answers.length - 1, quotedAt: `2026-10-14T12:00:0${step + 1}.000Z` });
  });
  return snapshots;
}

/** Bring 5 USDC from Base to Arc: every bridge asked at once. */
const bringIn = () =>
  record("bridge", [row("across", "Across"), row("relay", "Relay"), row("lifi", "LI.FI"), row("debridge", "deBridge"), row("cctp", "Circle CCTP")], [
    { index: 1, patch: quoted({ symbol: "USDC", amount: "4991200", feeUsd: 0.01, etaSeconds: 8 }), leader: "relay" },
    { index: 0, patch: quoted({ symbol: "USDC", amount: "4993800", feeUsd: 0.01, etaSeconds: 12 }), leader: "across" },
    { index: 4, patch: quoted({ symbol: "USDC", amount: "4990000", feeUsd: 0.01, etaSeconds: 70 }), leader: "across" },
    { index: 3, patch: { status: "failed", reason: "amount_too_low" }, leader: "across" },
    { index: 2, patch: { status: "failed", reason: "timeout" }, leader: "across" },
  ]);

/** Swap 2 USDC to EURC on Arc testnet. */
const swap = () =>
  record("swap", [row("kyberswap", "KyberSwap"), row("lifi", "LI.FI"), row("uniswap", "Uniswap"), row("zerox", "0x")], [
    { index: 0, patch: quoted({ symbol: "EURC", amount: "1708310", feeUsd: 0.01, etaSeconds: 4 }), leader: "kyberswap" },
    { index: 2, patch: { status: "failed", reason: "not_on_network" }, leader: "kyberswap" },
    { index: 1, patch: quoted({ symbol: "EURC", amount: "1712540", feeUsd: 0.02, etaSeconds: 6 }), leader: "lifi" },
    { index: 3, patch: { status: "failed", reason: "no_route" }, leader: "lifi" },
  ]);

const asOutput = (request: RouteRaceRequest, race: RouteRace): RaceRoutesOutput => ({ status: race.done ? "done" : "racing", request, race });

export function RaceGallery() {
  const snapshots = React.useMemo(bringIn, []);
  const swapped = React.useMemo(() => swap().at(-1)!, []);
  const [step, setStep] = React.useState(-1);
  const [round, setRound] = React.useState(0);
  React.useEffect(() => {
    setStep(-1);
    const timers = [-1, ...snapshots.keys()].map((index, order) => setTimeout(() => setStep(index), order * STEP_MS + STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [snapshots, round]);
  const current = step >= 0 ? snapshots[step]! : null;
  return (
    <View className="gap-4">
      <RaceCard output={current ? asOutput(BRING_IN, current) : null} live={!current?.done} kind="bridge" />
      <Button variant="secondary" onPress={() => setRound((value) => value + 1)}>
        <Text>Replay the race</Text>
      </Button>
      <RaceCard output={asOutput(SWAP, swapped)} live={false} />
      <RaceCard output={{ status: "routes_unavailable", request: BRING_IN, race: null, reason: "failed" }} live={false} />
      <RaceCard output={{ status: "routes_unavailable", request: SWAP, race: null, reason: "not_bound" }} live={false} />
      <ApprovalCard tool="propose_trade" input={{ ...SWAP, venue: "lifi" }} reason="outside_text" onAnswer={() => undefined} />
      <NotDoneCard tool="propose_bridge" input={{ amount: "5", destination: "base" }} />
      <View>
        <InsideBudgetChip />
        <AgentCard eyebrow="Swap · Arc Testnet">
          <Text className="text-foreground text-base">2 USDC → ~1.7125 EURC</Text>
        </AgentCard>
      </View>
      <AgentOffline checking={false} onCheck={() => undefined} />
    </View>
  );
}
