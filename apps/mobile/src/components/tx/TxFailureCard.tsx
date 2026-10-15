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
import { ExternalLink, RotateCcw, ShieldCheck } from "lucide-react-native";

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
  // Retry only when nothing moved: after a partial or unknown outcome a second try could pay twice.
  const retry = onRetry && diagnosis.retryable && state.moneyMoved === "no" ? onRetry : null;
  // Calm, not alarming: a neutral plate, the alert in a small red disc, and whether money moved as its own chip —
  // a shield when nothing moved, a warning when it is unclear, red only when some did.
  const moved = state.moneyMoved;
  const chip = moved === "no" ? { wash: color.upWash, ink: color.up, icon: ShieldCheck } : moved === "unknown" ? { wash: color.warnWash, ink: color.warn, icon: TriangleAlert } : { wash: color.destructiveWash, ink: color.destructive, icon: TriangleAlert };
  return (
    <View accessibilityRole="alert" style={[styles.card, { backgroundColor: color.raised2 }]}>
      <View style={styles.head}>
        <View style={[styles.disc, { backgroundColor: color.destructiveWash }]}>
          <Icon icon={TriangleAlert} size={SIZE.iconSm} tint={color.destructive} />
        </View>
        <View style={styles.copy}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t(`shell.diagnosis.${diagnosis.kind}.title`)}</Text>
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t(`shell.diagnosis.${diagnosis.kind}.body`)}</Text>
        </View>
      </View>
      <View style={[styles.chip, { backgroundColor: chip.wash }]}>
        <Icon icon={chip.icon} size={SIZE.iconSm} tint={chip.ink} />
        <Text style={[TYPE.chipLabel, { color: chip.ink }]}>{t(`shell.tx.moneyMoved.${moved}`)}</Text>
      </View>
      {detour || retry || explorerUrl ? (
        <View style={styles.actions}>
          {detour ? <Button label={t(`shell.fix.${detour.kind}`)} onPress={() => onFix?.(detour)} size="sm" block={false} /> : null}
          {retry ? (
            <Button
              label={t("shell.tx.tryAgain")}
              leading={<Icon icon={RotateCcw} size={SIZE.iconSm} />}
              onPress={retry}
              size="sm"
              variant={detour ? "ghost" : "secondary"}
              block={false}
            />
          ) : null}
          {explorerUrl ? (
            <Button
              label={t("shell.tx.explorer")}
              leading={<Icon icon={ExternalLink} size={SIZE.iconSm} />}
              onPress={() => void Linking.openURL(explorerUrl)}
              size="sm"
              variant="ghost"
              block={false}
            />
          ) : null}
        </View>
      ) : null}
      {diagnosis.technical || state.txHash ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={SPACE.sm}
            style={styles.technical}
          >
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
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  disc: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: SIZE.touch, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, alignSelf: "flex-start", borderRadius: SIZE.chipHeight, paddingHorizontal: SPACE.md, height: SIZE.chipHeight - SPACE.xs },
  copy: { flex: 1, gap: SPACE.xxs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  technical: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  flip: { transform: [{ rotate: "180deg" }] },
});
