// The rehearsal before the signature (Abu, 10-16, after Aomi: "you should be able to simulate your transaction" so the
// person can trust what the agent is about to run): once a swap's version is ready, the api runs its exact calls from
// the person's own address on Arc's latest state (eth_simulateV1) and the card shows what will leave and arrive — by
// the chain's own logs, not the quote — the contracts it touches, and the block it was rehearsed on. A rehearsal that
// reverts stops the swap before anything is signed, in Arc's own words; when the simulator can't be reached the card
// says so and the chain still checks the transaction when it is sent.
import { ShieldAlert, ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RehearsalView, SwapIntent } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Icon, RADIUS, ShimmerText, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { api } from "@/session/api";

const SHORT_HEAD = 6;
const SHORT_TAIL = 4;
const MAX_CONTRACTS = 4;

export type Rehearsal = { status: "running" } | { status: "error" } | RehearsalView;

/** Rehearses each ready version of a swap once (a new quote is a new version, rehearsed again). */
export function useSwapRehearsal(intent: SwapIntent, ready: boolean): Rehearsal | null {
  const [result, setResult] = React.useState<{ key: string; value: Rehearsal } | null>(null);
  const key = `${intent.id}:${intent.version}`;
  React.useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    setResult({ key, value: { status: "running" } });
    api.swaps
      .simulate(intent.id, intent.version)
      .then(({ simulation }) => live && setResult({ key, value: simulation }))
      .catch(() => live && setResult({ key, value: { status: "error" } }));
    return () => {
      live = false;
    };
  }, [ready, key, intent.id, intent.version]);
  return result?.key === key ? result.value : null;
}

/** Whether the person (or the budget) may go ahead: anything but a revert. */
export const rehearsalAllows = (rehearsal: Rehearsal | null) => rehearsal !== null && rehearsal.status !== "running" && rehearsal.status !== "reverted";

export function RehearsalBlock({ rehearsal, network }: { rehearsal: Rehearsal | null; network: SwapIntent["network"] }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  if (!rehearsal || rehearsal.status === "changed") return null;
  if (rehearsal.status === "running")
    return (
      <View style={styles.line}>
        <Icon icon={ShieldCheck} size={SIZE.iconSm} tint={color.text3} />
        <ShimmerText style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.rehearsing")}</ShimmerText>
      </View>
    );
  if (rehearsal.status === "reverted")
    return (
      <View style={[styles.block, { backgroundColor: color.destructiveWash }]} accessibilityRole="alert">
        <View style={styles.line}>
          <Icon icon={ShieldAlert} size={SIZE.iconSm} tint={color.destructive} />
          <Text style={[TYPE.label, { color: color.destructive }]}>{t("feed.run.rehearsedFail", { reason: rehearsal.reason })}</Text>
        </View>
      </View>
    );
  if (rehearsal.status === "unavailable" || rehearsal.status === "error")
    return <Text style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.rehearsalUnavailable")}</Text>;

  const chainId = ARC_CHAIN_IDS[network];
  const named = new Map(rehearsal.changes.map((change) => [change.token.address.toLowerCase(), change.token.symbol]));
  const touched = rehearsal.contracts
    .slice(0, MAX_CONTRACTS)
    .map((address) => named.get(address) ?? `${address.slice(0, SHORT_HEAD)}…${address.slice(-SHORT_TAIL)}`);
  const block = new Intl.NumberFormat(locale).format(Number(rehearsal.block));
  return (
    <View style={[styles.block, { backgroundColor: color.raised2 }]} accessible accessibilityLabel={`${t("feed.run.rehearsed")}. ${rehearsal.changes.map((change) => change.display).join(", ")}`}>
      <View style={styles.line}>
        <Icon icon={ShieldCheck} size={SIZE.iconSm} tint={color.up} />
        <Text style={[TYPE.label, styles.grow, { color: color.ink }]}>{t("feed.run.rehearsed")}</Text>
        <Text style={[TYPE.micro, { color: color.text3 }]}>{t("feed.run.rehearsedBlock", { block })}</Text>
      </View>
      {rehearsal.changes.map((change) => {
        const out = change.display.startsWith("−");
        return (
          <View key={change.token.address} style={styles.change}>
            <TokenMark token={{ chainId, address: change.token.address, symbol: change.token.symbol }} size={SIZE.markChip} />
            <Text style={[TYPE.rowAmount, { color: out ? color.ink : color.up }]}>{change.display}</Text>
          </View>
        );
      })}
      {touched.length > 0 ? (
        <Text numberOfLines={1} style={[TYPE.caption, { color: color.text3 }]}>
          {t("feed.run.touches", { list: touched.join(" · ") })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.xs + SPACE.xxs, padding: SPACE.md, borderRadius: RADIUS.md },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.xs + SPACE.xxs },
  grow: { flex: 1 },
  change: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingStart: SPACE.xxs },
});
