/**
 * The failure card: the diagnosis in human words, whether money moved (always, in its own bold line), the one fix that
 * can help, an explorer link when there is a transaction, and the technical details behind a disclosure. Never a raw
 * technical string as the headline. The fix comes from the diagnosis (`fixForDiagnosis`), so "Add money" has one source;
 * the kit runs no fix itself, the host passes `onFix` (and `onRetry`).
 */
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";

import { Button } from "../kit/Button";
import { type BlockerFix, fixForDiagnosis } from "../kit/diagnosis";
import { ChevronDown, Icon, TriangleAlert } from "../kit/icons";
import { SHEET_SHAPE, SIZE, SPACE, TYPE, useTheme } from "../kit/theme";
import type { TxState } from "./tx-state";

type Failed = Extract<TxState, { kind: "failed" }>;

export function TxFailureCard({
  state,
  onRetry,
  onFix,
  explorerUrl,
}: {
  state: Failed;
  onRetry?: () => void;
  onFix?: (fix: BlockerFix) => void;
  /** The transaction on the explorer, when it has a hash ("don't trust it, click it"). */
  explorerUrl?: string | null;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  const { diagnosis } = state;
  const fix = fixForDiagnosis(diagnosis.kind, diagnosis.retryable);
  const detour = fix && fix.kind !== "retry" && onFix ? fix : null;
  const retry = onRetry && diagnosis.retryable ? onRetry : null;
  return (
    <View accessibilityRole="alert" style={[styles.card, { backgroundColor: color.destructiveWash }]}>
      <View style={styles.head}>
        <Icon icon={TriangleAlert} size={SIZE.icon} tint={color.destructive} />
        <View style={styles.copy}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t(`shell.diagnosis.${diagnosis.kind}.title`)}</Text>
          <Text style={[TYPE.body, { color: color.text2 }]}>{t(`shell.diagnosis.${diagnosis.kind}.body`)}</Text>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t(`shell.tx.moneyMoved.${state.moneyMoved}`)}</Text>
        </View>
      </View>
      {detour || retry || explorerUrl ? (
        <View style={styles.actions}>
          {detour ? <Button label={t(`shell.fix.${detour.kind}`)} onPress={() => onFix?.(detour)} size="sm" block={false} /> : null}
          {retry ? <Button label={t("shell.tx.tryAgain")} onPress={retry} size="sm" variant={detour ? "ghost" : "secondary"} block={false} /> : null}
          {explorerUrl ? <Button label={t("shell.tx.explorer")} onPress={() => void Linking.openURL(explorerUrl)} size="sm" variant="ghost" block={false} /> : null}
        </View>
      ) : null}
      {diagnosis.technical || state.txHash ? (
        <>
          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={SPACE.sm} style={styles.technical}>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("shell.states.technical")}</Text>
            <View style={open ? styles.flip : undefined}>
              <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
            </View>
          </Pressable>
          {open ? (
            <Text selectable style={[TYPE.meta, { color: color.text2 }]}>
              {diagnosis.kind}
              {diagnosis.errorName ? ` · ${diagnosis.errorName}` : ""}
              {state.txHash ? `\n${state.txHash}` : ""}
              {diagnosis.technical ? `\n${diagnosis.technical}` : ""}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: SHEET_SHAPE.rowRadius, padding: SPACE.lg, gap: SPACE.md },
  head: { flexDirection: "row", gap: SPACE.md },
  copy: { flex: 1, gap: SPACE.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  technical: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  flip: { transform: [{ rotate: "180deg" }] },
});
