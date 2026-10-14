// Pieces shared by the Agent wallet page, the marketplace and the marketplace chat cards, on the Senryo kit: a seller's
// real mark, a purchase row, a move row, the top-up presets and a selectable chip. Prices keep their sub-cent digits;
// times are in the person's locale. A seller without a mark in the registry gets its initials, never another logo.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AgentWalletMove, PurchaseView } from "@kawase/api-client";
import { getEntity, providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import { ArrowDownLeft, ArrowUpRight, Icon } from "@/components/kit/icons";
import { DISABLED_OPACITY, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

import { usePrice } from "./use-agent-wallet";

const INITIALS = 2;

/** "BlockRun" → provider:blockrun, "AIsa API" → provider:aisa, "Kawase Demo Seller" → provider:kawase. */
export const sellerEntity = (name: string) => providerKey((name.split(/\s+/)[0] ?? name).toLowerCase().replace(/[^a-z0-9]/g, ""));

export function SellerMark({ name, size = SIZE.markRow }: { name: string; size?: number }) {
  const { color } = useTheme();
  const entity = sellerEntity(name);
  if (getEntity(entity)) return <Mark entity={entity} size={size} />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return (
    <View style={[styles.disc, { width: size, height: size, backgroundColor: color.raised2 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[TYPE.chipLabel, { color: color.text2 }]}>{initials}</Text>
    </View>
  );
}

export function useWhen() {
  const { locale } = useLocale();
  return (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** A selectable chip (the kit's chip shape): ink when chosen, the quiet plate otherwise. */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.chip, { backgroundColor: selected ? color.ink : pressed ? color.rowPressed : color.raised2 }, disabled ? styles.faded : null]}
    >
      <Text style={[TYPE.chipLabel, { color: selected ? color.ground : color.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ leading, title, detail, trailing, onPress }: { leading: React.ReactNode; title: string; detail: string; trailing: React.ReactNode; onPress?: (() => void) | undefined }) {
  const { color } = useTheme();
  const body = (
    <>
      {leading}
      <View style={styles.grow}>
        <Text numberOfLines={1} style={[TYPE.row, { color: color.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={2} style={[TYPE.rowDetail, { color: color.text3 }]}>
          {detail}
        </Text>
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: color.rowPressed } : null]}
    >
      {body}
    </Pressable>
  );
}

export function PurchaseRow({ purchase, onPress }: { purchase: PurchaseView; onPress?: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const price = usePrice();
  const when = useWhen();
  const settled = purchase.status === "paid" || purchase.status === "failed_after_payment";
  const detail = `${purchase.provider} · ${when(purchase.createdAt)}${purchase.status === "paid" ? "" : ` · ${t(`agentWallet.status.${purchase.status}`)}`}${purchase.refund === "none" ? ` · ${t("agentWallet.refundNone")}` : purchase.refund === "not_charged" ? ` · ${t("agentWallet.refundNotCharged")}` : ""}`;
  return (
    <Row
      leading={<SellerMark name={purchase.provider} />}
      title={purchase.description ?? purchase.provider}
      detail={detail}
      trailing={<Text style={[TYPE.rowAmount, { color: settled ? color.ink : color.text3 }]}>{`−${price(purchase.amount)}`}</Text>}
      onPress={onPress}
    />
  );
}

export function MoveRow({ move }: { move: AgentWalletMove }) {
  const { t } = useT();
  const { color } = useTheme();
  const price = usePrice();
  const when = useWhen();
  const glyph = move.kind === "return" ? ArrowUpRight : ArrowDownLeft;
  const title = { top_up: t("agentWallet.moveTopUp"), return: t("agentWallet.moveReturn"), deposit: t("agentWallet.moveDeposit"), refill: t("agentWallet.moveRefill") }[move.kind];
  const state = move.status === "confirmed" ? "" : ` · ${move.status === "pending" ? t("agentWallet.pending") : t("agentWallet.failedRow")}`;
  return (
    <Row
      leading={
        <View style={[styles.disc, { width: SIZE.markRow, height: SIZE.markRow, backgroundColor: color.raised2 }]}>
          <Icon icon={glyph} size={SIZE.iconSm} tint={color.text2} />
        </View>
      }
      title={title}
      detail={`${when(move.createdAt)}${state}`}
      trailing={
        <Text style={[TYPE.rowAmount, { color: move.kind === "top_up" ? color.up : color.ink }]}>
          {`${move.kind === "top_up" ? "+" : move.kind === "return" ? "−" : ""}${price(move.amount)}`}
        </Text>
      }
    />
  );
}

/** The top-up presets as chips; the chosen one is highlighted. */
export function TopUpPresets({ presets, value, onChange, disabled }: { presets: string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const price = usePrice();
  return (
    <View style={styles.wrap}>
      {presets.map((preset) => (
        <Chip key={preset} label={price(preset)} selected={preset === value} onPress={() => onChange(preset)} {...(disabled !== undefined ? { disabled } : {})} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: SPACE.xxs },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  disc: { borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  chip: { height: SIZE.chipHeight, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  faded: { opacity: DISABLED_OPACITY },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: SIZE.rowMinHeight, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
});
