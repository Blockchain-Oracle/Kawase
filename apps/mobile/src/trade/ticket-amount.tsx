// The amount on a ticket, one control in two shapes (21st.dev bankkroll/number-pad 3711 via the kit's AmountPad, and
// ssychui's Swap Ticket 27122 amount row on a desktop window):
//  - phone: the kit's AmountPad, the figure in the money face with ¼ ½ ¾ All of what can be spent (or presets) and the
//    keypad under it, so the CTA stays in reach without the system keyboard;
//  - desktop: the same figure as a typed field (a keyboard is right there), the caption with what is available, and
//    the same chips. Values cross as decimal text in the token's units ("12.5"), the ticket's own state.
import * as React from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { formatUnits, parseUnits } from "viem";

import { useWide } from "@kawase/ui-native/lib/wide";

import { AmountPad, type AmountChip, HERO_FONT_SCALE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";

import { ChoiceChips } from "./bits";

const ZERO = 0n;
const SHARES = [
  { key: "quarter", numerator: 1n, denominator: 4n },
  { key: "half", numerator: 1n, denominator: 2n },
  { key: "threeQuarters", numerator: 3n, denominator: 4n },
  { key: "all", numerator: 1n, denominator: 1n },
] as const;

const toUnits = (text: string, decimals: number): bigint => {
  const clean = text.replace(",", ".");
  if (!clean || clean === ".") return ZERO;
  try {
    return parseUnits(clean.endsWith(".") ? clean.slice(0, -1) : clean, decimals);
  } catch {
    return ZERO;
  }
};

type Props = {
  /** Decimal text in the token's units ("" for nothing typed). */
  value: string;
  onChange: (text: string) => void;
  decimals: number;
  /** How many decimals can be typed (2 for dollars). */
  fraction?: number;
  /** "$" before a dollar figure; "" with `suffix` for a token amount. */
  prefix?: string;
  suffix?: string;
  /** What can be spent, in base units: adds ¼ ½ ¾ All. */
  balance?: bigint | undefined;
  /** Presets instead of the shares. */
  chips?: readonly AmountChip[];
  /** The caption under the figure ("$84.20 available"); `problem` replaces it in the down tone. */
  note?: string | undefined;
  problem?: string | null;
  label: string;
};

export function TicketAmount({ value, onChange, decimals, fraction = 2, prefix = "$", suffix, balance, chips, note, problem, label }: Props) {
  const wide = useWide();
  const units = toUnits(value, decimals);
  const set = (next: bigint) => onChange(next > ZERO ? formatUnits(next, decimals) : "");
  if (!wide) {
    return (
      <AmountPad
        value={units}
        onChange={set}
        decimals={decimals}
        fraction={fraction}
        prefix={prefix}
        {...(suffix ? { suffix } : {})}
        {...(balance !== undefined && balance > ZERO ? { balance } : chips ? { chips } : {})}
        {...(note ? { note } : {})}
        problem={problem ?? null}
        label={label}
      />
    );
  }
  return <TypedAmount {...{ value, onChange, units, set, prefix, suffix, balance, chips, note, problem, label, fraction }} />;
}

function TypedAmount({
  value,
  onChange,
  units,
  set,
  prefix,
  suffix,
  balance,
  chips,
  note,
  problem,
  label,
  fraction,
}: {
  value: string;
  onChange: (text: string) => void;
  units: bigint;
  set: (next: bigint) => void;
  prefix: string;
  suffix: string | undefined;
  balance: bigint | undefined;
  chips: readonly AmountChip[] | undefined;
  note: string | undefined;
  problem: string | null | undefined;
  label: string;
  fraction: number;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const pattern = React.useMemo(() => new RegExp(`^\\d*(?:[.,]\\d{0,${fraction}})?$`), [fraction]);
  const shown =
    balance !== undefined && balance > ZERO
      ? SHARES.map((share) => ({ label: t(`shell.kit.share.${share.key}`), value: (balance * share.numerator) / share.denominator }))
      : (chips ?? []);
  const chosen = shown.find((chip) => chip.value === units && units > ZERO)?.label ?? null;
  return (
    <View style={styles.wrap}>
      <View style={styles.figure}>
        {prefix ? <Text style={[TYPE.displayBalance, { color: value ? color.ink : color.text3 }]}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={(text) => {
            if (pattern.test(text)) onChange(text.replace(",", "."));
          }}
          placeholder="0"
          placeholderTextColor={color.text3}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxFontSizeMultiplier={HERO_FONT_SCALE}
          style={[TYPE.displayBalance, styles.input, { color: color.ink }, Platform.OS === "web" ? WEB_FIELD : null]}
        />
        {suffix ? <Text style={[TYPE.sectionTitle, { color: color.text3 }]}>{suffix}</Text> : null}
      </View>
      <Text style={[TYPE.caption, { color: problem ? color.down : color.text2 }]}>{problem ?? note ?? " "}</Text>
      {shown.length > 0 ? <ChoiceChips label={label} options={shown.map((chip) => ({ value: chip.label, label: chip.label }))} value={chosen} onChange={(picked) => set(shown.find((chip) => chip.label === picked)!.value)} /> : null}
    </View>
  );
}

/** No browser focus box on the bare figure: the ticket's focus ring is the plate around it. */
const WEB_FIELD = { outlineStyle: "none" } as unknown as object;

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  figure: { flexDirection: "row", alignItems: "baseline", gap: SPACE.xs },
  input: { flex: 1, minWidth: 0, padding: 0 },
});
