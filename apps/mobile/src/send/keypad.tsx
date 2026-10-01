// The amount keypad (revamp journey 10, the amount ticket): three columns of large keys, the locale's decimal
// separator on the key, a backspace. The value it builds is always canonical ("12.5": Latin digits, a dot), so the
// api and the policy never parse a localized number; only the display is localized. Up to the asset's decimals,
// no leading zeros.
import { Delete } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

export const DECIMAL_KEY = "decimal";
export const BACKSPACE_KEY = "backspace";
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** Digits before the separator: more than any balance on Arc needs, few enough to keep the amount on one line. */
const MAX_WHOLE_DIGITS = 9;
const KEY_HEIGHT = 56;
const KEYS_PER_ROW = 3;
const SAMPLE_DECIMAL = 1.5;
const SAMPLE_LENGTH = 3;

/** The canonical value after one key press, or the same value when the key would make it invalid. */
export function applyKey(value: string, key: string, maxDecimals: number): string {
  if (key === BACKSPACE_KEY) return value.slice(0, -1);
  if (key === DECIMAL_KEY) {
    if (value.includes(".") || maxDecimals === 0) return value;
    return value === "" ? "0." : `${value}.`;
  }
  const [whole = "", fraction] = value.split(".");
  if (fraction !== undefined) return fraction.length >= maxDecimals ? value : `${value}${key}`;
  if (whole === "0") return key;
  if (whole.length >= MAX_WHOLE_DIGITS) return value;
  return `${value}${key}`;
}

/** The decimal separator this locale writes ("," in French, "٫" in Arabic). */
export function decimalSeparator(locale: string): string {
  const sample = new Intl.NumberFormat(locale).format(SAMPLE_DECIMAL);
  return sample.length === SAMPLE_LENGTH ? (sample[1] ?? ".") : ".";
}

/** A canonical value for display: the whole part grouped in the locale's digits, the separator, the typed fraction. */
export function displayAmount(value: string, locale: string): string {
  const [whole = "", fraction] = value.split(".");
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format((whole || "0") as unknown as number);
  return fraction === undefined ? grouped : `${grouped}${decimalSeparator(locale)}${fraction}`;
}

function Key({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="active:bg-muted flex-1 items-center justify-center rounded-2xl"
      style={{ height: KEY_HEIGHT }}
    >
      {children}
    </Pressable>
  );
}

export function Keypad({ onKey, decimal, backspaceLabel }: { onKey: (key: string) => void; decimal: string; backspaceLabel: string }) {
  const rows = Array.from({ length: DIGITS.length / KEYS_PER_ROW }, (_, index) =>
    DIGITS.slice(index * KEYS_PER_ROW, (index + 1) * KEYS_PER_ROW),
  );
  const digit = (value: string) => (
    <Key key={value} label={value} onPress={() => onKey(value)}>
      <Text className="font-display text-foreground text-[28px] font-semibold">{value}</Text>
    </Key>
  );
  return (
    // Keypads keep 1-2-3 on the left in every language, like a phone's dial pad.
    <View className="gap-1" style={{ direction: "ltr" }}>
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-1">
          {row.map(digit)}
        </View>
      ))}
      <View className="flex-row gap-1">
        <Key label={decimal} onPress={() => onKey(DECIMAL_KEY)}>
          <Text className="font-display text-foreground text-[28px] font-semibold">{decimal}</Text>
        </Key>
        {digit("0")}
        <Key label={backspaceLabel} onPress={() => onKey(BACKSPACE_KEY)}>
          <Icon as={Delete} className="text-foreground size-6" />
        </Key>
      </View>
    </View>
  );
}
