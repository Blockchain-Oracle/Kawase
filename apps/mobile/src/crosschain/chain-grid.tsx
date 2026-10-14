// Where the money goes (or, for Bring to Arc, where it is): a grid of chain tiles with their real marks, filtered to the
// chains Kawase has a working route to on the active network (GET /bridges/destinations: the routes engine's own list,
// so a chain shown is a chain that can be picked). For Bring to Arc each tile says what is waiting there; a chain
// holding nothing stays visible but quiet. Designed loading (tiles shaped like the real ones), error (what still works
// and Retry) and empty states. The selected tile takes Senryo's selected-row fill with the accent ring.
import type { BridgeDestinationView, ElsewhereView } from "@kawase/api-client";
import { CHAIN_IDS, chainKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState, ErrorState, Skeleton, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const TILE_RADIUS = 20;
const SKELETON_TILES = 6;
/** Two columns of rows (mark beside the name), so every chain's name is whole at a phone's width. */
const COLUMNS = 2;
const BORDER = 2;
const PERCENT = 100;
const DIM = 0.5;
/** Room the gaps take out of each third (percent). */
const GUTTER_PERCENT = 3;

/** The mainnet chain id a destination's mark is drawn from (testnet destinations share their chain's mark). */
const MARK_CHAIN: Record<string, number> = {
  base: CHAIN_IDS.base,
  ethereum: CHAIN_IDS.ethereum,
  arbitrum: CHAIN_IDS.arbitrum,
  optimism: CHAIN_IDS.optimism,
  polygon: CHAIN_IDS.polygon,
  avalanche: CHAIN_IDS.avalanche,
  unichain: CHAIN_IDS.unichain,
};

export const destinationMark = (destination: Pick<BridgeDestinationView, "id" | "chainId">) => chainKey(MARK_CHAIN[destination.id] ?? destination.chainId);

/** The chain's own name: the test network's suffix ("Sepolia", "Fuji", "Amoy") is the network capsule's to say. */
const CHAIN_NAME: Record<string, string> = {
  base: "Base",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon: "Polygon",
  avalanche: "Avalanche",
  unichain: "Unichain",
};
export const chainName = (destination: Pick<BridgeDestinationView, "id" | "name">) => CHAIN_NAME[destination.id] ?? destination.name;

/** The chains a move can reach from the active network, read once per network. */
export function useDestinations() {
  const { user } = useSession();
  const network = user?.activeNetwork;
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; list: BridgeDestinationView[] }>({ status: "loading", list: [] });
  const [round, setRound] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    setState((current) => ({ status: "loading", list: current.list }));
    api.bridges
      .destinations()
      .then(({ destinations }) => live && setState({ status: "ready", list: destinations }))
      .catch(() => live && setState((current) => ({ status: "error", list: current.list })));
    return () => {
      live = false;
    };
  }, [network, round]);
  return { ...state, retry: () => setRound((value) => value + 1) };
}

export function ChainGrid({
  destinations,
  status,
  onRetry,
  selected,
  onSelect,
  waiting,
  amountOf,
}: {
  destinations: readonly BridgeDestinationView[];
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  selected: string | undefined;
  onSelect: (id: string) => void;
  /** Bring to Arc: what is at the person's address on each chain (absent for a move out). */
  waiting?: ElsewhereView["chains"] | undefined;
  /** "12.5 USDC" for a chain's holding. */
  amountOf?: (row: ElsewhereView["chains"][number]) => string;
}) {
  const { t } = useT();
  const { color } = useTheme();
  if (status === "loading" && destinations.length === 0) {
    return (
      <View style={styles.grid} accessibilityRole="progressbar">
        {Array.from({ length: SKELETON_TILES }, (_, index) => (
          <View key={index} style={[styles.tile, { backgroundColor: color.card }]}>
            <Skeleton width={SIZE.markRow} height={SIZE.markRow} radius={SIZE.markRow} />
            <Skeleton width="55%" height={SIZE.skeletonSmall} />
          </View>
        ))}
      </View>
    );
  }
  if (status === "error" && destinations.length === 0) {
    return <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={onRetry} stillWorks={t("move.chainsStillWorks")} variant="strip" />;
  }
  if (destinations.length === 0) return <EmptyState why={t("move.noChains")} size="inline" />;
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {destinations.map((destination) => {
        const here = waiting?.filter((row) => row.key === destination.id) ?? [];
        const best = here.find((row) => row.asset === "USDC") ?? here[0];
        const quiet = waiting !== undefined && !best;
        const on = selected === destination.id;
        return (
          <Pressable
            key={destination.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={best && amountOf ? `${destination.name}, ${amountOf(best)}` : destination.name}
            onPress={() => {
              fire("tick");
              onSelect(destination.id);
            }}
            style={[styles.tile, { backgroundColor: on ? color.selectedRow : color.card, borderColor: on ? color.accent : color.transparent, opacity: quiet ? DIM : 1 }]}
          >
            <Mark entity={destinationMark(destination)} size={SIZE.markRow} />
            <View style={styles.text}>
              <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
                {chainName(destination)}
              </Text>
              {waiting !== undefined ? (
                <Text numberOfLines={1} style={[TYPE.meta, { color: color.text2 }]}>
                  {best && amountOf ? amountOf(best) : t("move.nothingThere")}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  tile: {
    flexBasis: `${Math.floor(PERCENT / COLUMNS) - GUTTER_PERCENT}%`,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: TILE_RADIUS,
    borderWidth: BORDER,
    borderColor: "transparent",
  },
});
