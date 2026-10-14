// /dev/gallery only: the RouteList replaying races recorded on Arc mainnet (recorded-races.ts), and each of its
// designed states. Internal page; the labels here are the gallery's own (English), like the rest of it.
import type { RouteRace } from "@kawase/api-client";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Text } from "@kawase/ui-native/components/ui/text";
import * as React from "react";
import { Pressable, View } from "react-native";

import { bridgeToBase, gasToBase, swapUsdcEurc } from "./recorded-races";
import { RouteList } from "./route-list";
import { replayRace, useRouteRace } from "./use-route-race";

const RECORDINGS = { swap: swapUsdcEurc, bridge: bridgeToBase, gas: gasToBase } as const;
type Recording = keyof typeof RECORDINGS;
const STATES = ["live", "loading", "empty", "error", "offline"] as const;
type GalleryState = (typeof STATES)[number];

const doneOf = (snapshots: readonly RouteRace[]) => snapshots[snapshots.length - 1]!;

export function RouteListGallery() {
  const [recording, setRecording] = React.useState<Recording>("swap");
  const [view, setView] = React.useState<GalleryState>("live");
  const [round, setRound] = React.useState(0);
  const source = React.useMemo(() => (view === "live" ? replayRace(RECORDINGS[recording]) : null), [recording, view, round]);
  const live = useRouteRace(source);
  const [picked, setPicked] = React.useState<string | null>(null);

  const last = doneOf(RECORDINGS[recording]);
  const empty: RouteRace = { ...last, rows: last.rows.map((row) => ({ ...row, status: "failed", receive: null, net: null, executable: false, reason: "no_route" })), best: null };

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <SegmentedControl
          label="Race"
          value={recording}
          onValueChange={(value) => {
            setPicked(null);
            setRecording(value as Recording);
          }}
          options={[
            { value: "swap", label: "10 USDC → EURC" },
            { value: "bridge", label: "5 USDC → Base" },
            { value: "gas", label: "1 USDC → ETH" },
          ]}
        />
        <SegmentedControl label="State" value={view} onValueChange={(value) => setView(value as GalleryState)} options={STATES.map((value) => ({ value, label: value }))} />
      </View>
      {view === "live" ? <RouteList race={live.race} state={live.state} selected={picked} onSelect={setPicked} onRetry={() => setRound((value) => value + 1)} /> : null}
      {view === "loading" ? <RouteList race={null} /> : null}
      {view === "empty" ? <RouteList race={empty} onRetry={() => setView("live")} /> : null}
      {view === "error" ? <RouteList race={null} state="error" onRetry={() => setView("live")} /> : null}
      {view === "offline" ? <RouteList race={last} state="offline" /> : null}
      {view === "live" ? (
        <Pressable accessibilityRole="button" onPress={() => setRound((value) => value + 1)} className="self-start">
          <Text className="text-muted-foreground text-xs underline">Replay ({picked ?? "best"})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
