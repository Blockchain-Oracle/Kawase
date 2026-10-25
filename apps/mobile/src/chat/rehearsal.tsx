// The simulation before the signature (Abu, 10-16, after Aomi: "you should be able to simulate your transaction… the
// loading states, simulate transaction, and then you can perform the normal transaction"). Once a version of anything
// that moves money is ready — a send, a swap, a bridge, a move to another chain, a deposit, a loan, a long or a short —
// the api runs its exact calls from the person's own address on the chain as it is now (eth_simulateV1 on Arc) and this
// panel says what will leave and arrive — by the chain's own logs, not the quote — the contracts it touches and the
// block. It runs by itself when the version is ready, and its top-right button runs it again. A simulation that reverts
// stops the confirm before anything is signed, in the chain's own words; one that could not run says so and leaves the
// confirm to the person (the chain still checks the transaction when it is sent).
import { RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { RehearsalView } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Icon, RADIUS, ShimmerText, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { api } from "@/session/api";

const SHORT_HEAD = 6;
const SHORT_TAIL = 4;
const MAX_CONTRACTS = 4;
/** How long a ready version must stand before it is simulated. */
const SETTLE_MS = 400;

export type Rehearsal = { status: "running" } | { status: "error" } | RehearsalView;

/** Every kind of money-moving intent the api can simulate before its approval. */
export type RehearsalKind = "swaps" | "sends" | "bridges" | "earn" | "lend" | "margin" | "crosschain";
type Network = "mainnet" | "testnet";

const SIMULATORS: Record<RehearsalKind, (id: string, version: number) => Promise<{ simulation: RehearsalView }>> = {
  swaps: (id, version) => api.swaps.simulate(id, version),
  sends: (id, version) => api.sends.simulate(id, version),
  bridges: (id, version) => api.bridges.simulate(id, version),
  earn: (id, version) => api.earn.simulate(id, version),
  lend: (id, version) => api.lend.simulate(id, version),
  margin: (id, version) => api.margin.simulate(id, version),
  crosschain: (id, version) => api.crosschain.simulate(id, version),
};

export type RehearsalControl = {
  /** The latest simulation of the ready version (null before it is ready). */
  result: Rehearsal | null;
  /** Run it again on the chain as it is now. */
  run: () => void;
};

/** A simulation the api answered with a newer version (a swap whose route reverted is redrafted on the next best). */
export type RehearsalChanged = Extract<RehearsalView, { status: "changed" }>;

/**
 * Simulates each ready version once by itself (a new quote is a new version, simulated again); `run` repeats it.
 * `onChanged`: the api replaced the version while simulating it; the host reads the new one (it is simulated in turn).
 */
export function useRehearsal(kind: RehearsalKind, intent: { id: string; version: number }, ready: boolean, onChanged?: (result: RehearsalChanged) => void): RehearsalControl {
  const [state, setState] = React.useState<{ key: string; value: Rehearsal } | null>(null);
  const [round, setRound] = React.useState(0);
  const changed = React.useRef(onChanged);
  React.useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  const key = `${intent.id}:${intent.version}`;
  React.useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    setState({ key, value: { status: "running" } });
    // A version that is replaced at once (a leverage being dragged, a quote refreshed) is not simulated.
    const timer = setTimeout(() => {
      SIMULATORS[kind](intent.id, intent.version)
        .then(({ simulation }) => {
          if (!live) return;
          setState({ key, value: simulation });
          if (simulation.status === "changed") changed.current?.(simulation);
        })
        .catch(() => live && setState({ key, value: { status: "error" } }));
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready, kind, key, intent.id, intent.version, round]);
  const run = React.useCallback(() => setRound((value) => value + 1), []);
  return { result: ready && state?.key === key ? state.value : null, run };
}

/**
 * The confirm's own words while the simulation runs ("Simulating…", a named wait) or once it reverted ("Stopped before
 * signing", with the chain's reason), for the tx kit's CTA (IntentCta, TicketCta); null once it may go ahead.
 */
export function rehearsalBlocker(control: RehearsalControl, labels: { running: string; stopped: string }): { label: string; reason?: string; busy?: boolean } | null {
  const result = control.result;
  if (!result) return null;
  if (result.status === "running") return { label: labels.running, busy: true };
  if (result.status === "reverted") return { label: labels.stopped, reason: result.reason };
  return null;
}

/**
 * Whether the person (or the budget) may go ahead: once it has run, anything but a revert, or a route the api benched
 * for reverting (its next best is on its way as a new version).
 */
export const rehearsalAllows = (rehearsal: Rehearsal | null) =>
  rehearsal !== null && rehearsal.status !== "running" && rehearsal.status !== "reverted" && !(rehearsal.status === "changed" && rehearsal.reason === "route_failed");

/** The simulation panel: its state on the left, Simulate again on the right, and what the chain said under them. */
export function RehearsalBlock({ control, network }: { control: RehearsalControl; network: Network }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const rehearsal = control.result;
  if (!rehearsal || rehearsal.status === "changed") return null;

  const running = rehearsal.status === "running";
  const reverted = rehearsal.status === "reverted";
  const ok = rehearsal.status === "ok";
  const tone = reverted ? color.destructive : ok ? color.up : color.text3;
  const title = running
    ? t("feed.run.rehearsing")
    : reverted
      ? t("feed.run.rehearsedStopped")
      : ok
        ? t("feed.run.rehearsed")
        : t("feed.run.rehearsalUnavailable");
  const again = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("feed.run.rehearseAgain")}
      disabled={running}
      hitSlop={SPACE.sm}
      onPress={() => {
        fire("tick");
        control.run();
      }}
      style={({ pressed }) => [styles.again, { backgroundColor: pressed ? color.rowPressed : color.ground }]}
    >
      {running ? <ActivityIndicator size="small" color={color.text3} /> : <Icon icon={RotateCcw} size={SIZE.iconSm} tint={color.text2} />}
      <Text style={[TYPE.micro, { color: color.text2 }]}>{running ? t("feed.run.rehearsingShort") : t("feed.run.rehearseAgain")}</Text>
    </Pressable>
  );

  const head = (
    <View style={styles.line}>
      <Icon icon={reverted ? ShieldAlert : ok ? ShieldCheck : running ? ShieldCheck : ShieldQuestion} size={SIZE.iconSm} tint={tone} />
      {running ? (
        <ShimmerText style={[TYPE.label, styles.grow, { color: color.text2 }]}>{title}</ShimmerText>
      ) : (
        <Text style={[TYPE.label, styles.grow, { color: reverted ? color.destructive : color.ink }]}>{title}</Text>
      )}
      {again}
    </View>
  );

  if (rehearsal.status !== "ok") {
    return (
      <View style={[styles.block, { backgroundColor: reverted ? color.destructiveWash : color.raised2 }]} accessibilityRole={reverted ? "alert" : undefined} accessibilityLiveRegion="polite">
        {head}
        {reverted ? <Text style={[TYPE.caption, { color: color.destructive }]}>{t("feed.run.rehearsedFail", { reason: rehearsal.reason })}</Text> : null}
        {!running && !reverted ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.rehearsalUnavailableBody")}</Text> : null}
      </View>
    );
  }

  const chainId = ARC_CHAIN_IDS[network];
  const named = new Map(rehearsal.changes.map((change) => [change.token.address.toLowerCase(), change.token.symbol]));
  const touched = rehearsal.contracts
    .slice(0, MAX_CONTRACTS)
    .map((address) => named.get(address) ?? `${address.slice(0, SHORT_HEAD)}…${address.slice(-SHORT_TAIL)}`);
  const block = new Intl.NumberFormat(locale).format(Number(rehearsal.block));
  return (
    <View
      style={[styles.block, { backgroundColor: color.raised2 }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t("feed.run.rehearsed")}. ${rehearsal.changes.map((change) => change.display).join(", ")}`}
    >
      {head}
      {rehearsal.changes.map((change) => {
        const out = change.display.startsWith("−");
        return (
          <View key={change.token.address} style={styles.change}>
            <TokenMark token={{ chainId, address: change.token.address, symbol: change.token.symbol }} size={SIZE.markChip} />
            <Text style={[TYPE.rowAmount, { color: out ? color.ink : color.up }]}>{change.display}</Text>
          </View>
        );
      })}
      <Text numberOfLines={1} style={[TYPE.caption, { color: color.text3 }]}>
        {[touched.length > 0 ? t("feed.run.touches", { list: touched.join(" · ") }) : null, t("feed.run.rehearsedBlock", { block })].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.xs + SPACE.xxs, padding: SPACE.md, borderRadius: RADIUS.md },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.xs + SPACE.xxs },
  grow: { flex: 1 },
  change: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingStart: SPACE.xxs },
  again: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs + SPACE.xxs, borderRadius: RADIUS.pill },
});
