/**
 * Amount keypad (21st.dev bankkroll/number-pad #3711, re-laid out in Senryo's anatomy): a borderless 3 x 4 grid (1-9,
 * ".", 0, delete) of large Inter figures that fill the entry region, a `tick` per key, pressed keys on the
 * row-pressed surface. Pure input: the owner holds the amount string and its rules (`applyKey`: a decimal cap, a
 * digit cap, no leading zeros). Distinct from the system keyboard a text field uses.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { Delete, Icon } from "./icons";
import { CONTROL_FONT_SCALE, NUMERIC_VARIANT, RADIUS, SIZE, SPACE, TYPE, useTheme } from "./theme";

export type KeypadKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "0" | "del";
const KEYS: readonly KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
const COLUMNS = 3;
/** Whole-unit digits before the point, and the default decimals after it (cents). */
export const AMOUNT_MAX_WHOLE_DIGITS = 9;
export const AMOUNT_DECIMALS = 2;

export type KeyRules = { decimals?: number; maxWhole?: number };

/** Next amount text after a key; unchanged when the key would make it invalid. */
export function applyKey(text: string, key: KeypadKey, rules: KeyRules = {}): string {
  const decimals = rules.decimals ?? AMOUNT_DECIMALS;
  const maxWhole = rules.maxWhole ?? AMOUNT_MAX_WHOLE_DIGITS;
  if (key === "del") return text.slice(0, -1);
  const [whole = "", frac] = text.split(".");
  if (key === ".") return decimals === 0 || frac !== undefined ? text : `${whole === "" ? "0" : whole}.`;
  if (frac !== undefined) return frac.length >= decimals ? text : `${text}${key}`;
  if (whole === "0") return key;
  return whole.length >= maxWhole ? text : `${text}${key}`;
}

export function Keypad({
  onKey,
  disabled,
  allowDecimal = true,
}: {
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
  allowDecimal?: boolean;
}) {
  const { color } = useTheme();
  const { t } = useT();
  const rows = Array.from({ length: KEYS.length / COLUMNS }, (_, r) => KEYS.slice(r * COLUMNS, r * COLUMNS + COLUMNS));
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.join("")} style={styles.row}>
          {row.map((key) => {
            const off = disabled || (key === "." && !allowDecimal);
            return (
              <Pressable
                key={key}
                disabled={off}
                onPress={() => {
                  fire("tick");
                  onKey(key);
                }}
                accessibilityRole="keyboardkey"
                accessibilityLabel={
                  key === "del" ? t("shell.kit.delete") : key === "." ? t("shell.kit.decimalPoint") : key
                }
                style={({ pressed }) => [styles.key, pressed ? { backgroundColor: color.rowPressed } : null]}
              >
                {key === "del" ? (
                  <Icon icon={Delete} size={SIZE.icon} tint={color.ink} />
                ) : (
                  <Text
                    maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                    style={[TYPE.sheetTitle, styles.digit, { color: off ? color.text3 : color.ink }]}
                  >
                    {key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, gap: SPACE.xxs },
  row: { flex: 1, flexDirection: "row", gap: SPACE.xxs },
  key: {
    flex: 1,
    minHeight: SIZE.touch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
  },
  digit: { fontVariant: NUMERIC_VARIANT },
});
