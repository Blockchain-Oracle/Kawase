// The live race beside a ticket (the desktop's right column; plan F "desktop swap and move layouts"): as the person
// types, every venue is asked again (POST /routes/race, streamed) and the RouteList lights up row by row. The ask is
// debounced so a keypad run is one race, not one per digit. A pick here becomes the ticket's venue. Before there is
// anything to race, the column says what it will show (never an empty frame).
import type { RouteRaceRequest } from "@kawase/api-client";
import * as React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, SPACE } from "@/components/kit";
import { useT } from "@/i18n";

import { liveRace, RaceStartError } from "./race-source";
import { RouteList } from "./route-list";
import { useRouteRace } from "./use-route-race";

/** One race per pause in typing (the venues' keyless budgets are shared by everyone). */
const DEBOUNCE_MS = 900;

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function LiveRace({ request, selected, onSelect, idleTitle, idleBody }: { request: RouteRaceRequest | null; selected?: string | null; onSelect?: (venue: string) => void; idleTitle: string; idleBody: string }) {
  const { t } = useT();
  const key = request ? JSON.stringify(request) : null;
  const settled = useDebounced(key, DEBOUNCE_MS);
  const source = React.useMemo(() => (settled ? liveRace(JSON.parse(settled) as RouteRaceRequest) : null), [settled]);
  const { race, state, retry } = useRouteRace(source);
  if (!request) {
    return (
      <View style={styles.idle}>
        <EmptyState why={idleTitle} detail={idleBody} size="panel" />
      </View>
    );
  }
  // An ask the api cannot race (the same token both sides, a token it does not know) is said once, quietly.
  if (state === "error" && !race) {
    return <EmptyState why={t("routes.errorTitle")} detail={t("routes.errorBody")} size="panel" action={{ label: t("routes.retry"), onPress: retry }} />;
  }
  return <RouteList race={key === settled ? race : null} state={state} selected={selected ?? null} {...(onSelect ? { onSelect } : {})} onRetry={retry} />;
}

export { RaceStartError };

const styles = StyleSheet.create({
  idle: { paddingTop: SPACE.xl },
});
