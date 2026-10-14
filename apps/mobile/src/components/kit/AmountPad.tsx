/**
 * An amount, entered: the figure large (Roboto Condensed Black, tabular), one line under it that names the problem or
 * the limits, quick chips (presets, or 1/4 1/2 3/4 All of a balance), and the kit keypad (21st.dev bankkroll/number-pad
 * #3711). It holds the typed text and reports the value in base units (viem `parseUnits`), so USDC (6), a token with 18
 * decimals or a euro stablecoin all work; the caller owns the rules and the confirm. Send, swap, bridge, earn and buy
 * all build on it.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatUnits, parseUnits } from "viem";

import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { applyKey, Keypad } from "./Keypad";
import { HERO_FONT_SCALE, SIZE, SPACE, TYPE, useTheme } from "./theme";

const CHIP_HEIGHT = SIZE.touch - SPACE.sm;
const DEFAULT_DECIMALS = 6;
const ZERO = 0n;
const HALF = 2;
const DEFAULT_FRACTION = 2;
const SHARES = [
  { key: "quarter", numerator: 1n, denominator: 4n },
  { key: "half", numerator: 1n, denominator: 2n },
  { key: "threeQuarters", numerator: 3n, denominator: 4n },
  { key: "all", numerator: 1n, denominator: 1n },
] as const;

export type AmountChip = { label: string; value: bigint };

/** The text a base-unit value types as, trimmed to `fraction` decimals (no trailing zeros). */
export function amountText(value: bigint, decimals: number, fraction: number): string {
  const full = formatUnits(value, decimals);
  const [whole = "0", frac = ""] = full.split(".");
  const cut = frac.slice(0, fraction).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

export function AmountPad({
  value,
  onChange,
  decimals = DEFAULT_DECIMALS,
  fraction = DEFAULT_FRACTION,
  prefix = "$",
  suffix,
  balance,
  chips,
  note,
  problem,
  label,
}: {
  value: bigint;
  onChange: (next: bigint) => void;
  /** The token's decimals (USDC 6). */
  decimals?: number;
  /** How many decimals the pad lets you type (2 for dollars, more for a volatile token). */
  fraction?: number;
  /** Shown before the figure ("$"); pass "" for a token amount, with `suffix`. */
  prefix?: string;
  suffix?: string;
  /** The spendable balance in base units: adds the 1/4, 1/2, 3/4, All chips. */
  balance?: bigint;
  /** Presets instead of the balance chips. */
  chips?: readonly AmountChip[];
  /** The quiet line under the figure (limits, what it buys); `problem` replaces it in the warning tone. */
  note?: string;
  problem?: string | null;
  label?: string;
}) {
  const { color } = useTheme();
  const { t } = useT();
  const [text, setText] = useState(() => (value > ZERO ? amountText(value, decimals, fraction) : ""));
  const set = (next: string) => {
    setText(next);
    try {
      onChange(next === "" || next === "." ? ZERO : parseUnits(next.endsWith(".") ? next.slice(0, -1) : next, decimals));
    } catch {
      onChange(ZERO);
    }
  };
  const shown =
    balance !== undefined && balance > ZERO
      ? SHARES.map((s) => ({ label: t(`shell.kit.share.${s.key}`), value: (balance * s.numerator) / s.denominator }))
      : (chips ?? []);
  const figure = `${prefix}${text === "" ? "0" : text}${suffix ? ` ${suffix}` : ""}`;
  return (
    <View style={styles.wrap}>
      <Text
        accessibilityRole="text"
        accessibilityLabel={`${label ?? t("shell.kit.amount")} ${text === "" ? t("shell.kit.empty") : figure}`}
        maxFontSizeMultiplier={HERO_FONT_SCALE}
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[TYPE.displayBalance, styles.center, { color: text === "" ? color.text3 : color.ink }]}
      >
        {figure}
      </Text>
      <Text style={[TYPE.caption, styles.center, { color: problem ? color.down : color.inkMuted }]}>{problem ?? note ?? " "}</Text>
      {shown.length > 0 ? (
        <View style={styles.chips}>
          {shown.map((c) => {
            const on = c.value === value && value > ZERO;
            return (
              <Pressable
                key={c.label}
                onPress={() => {
                  fire("tick");
                  set(amountText(c.value, decimals, fraction));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2 }]}
              >
                <Text style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Keypad allowDecimal={fraction > 0} onKey={(k) => set(applyKey(text, k, { decimals: fraction }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  center: { textAlign: "center" },
  chips: { flexDirection: "row", gap: SPACE.sm },
  chip: {
    flex: 1,
    minHeight: CHIP_HEIGHT,
    borderRadius: CHIP_HEIGHT / HALF,
    alignItems: "center",
    justifyContent: "center",
  },
});
