// The two inputs the account sheets need, on the kit's tokens: a text field on the input plate (an email), and the
// six-cell code field (21st ddoemonn/otp-input #23543 as the spec: one real text input under six cells, so paste, the
// one-time-code autofill and the system keyboard all work; the active cell shows the focus ring).
import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { CONTROL_FONT_SCALE, NUMERIC_VARIANT, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";

export function Field({ style, ...props }: TextInputProps) {
  const { color } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      placeholderTextColor={color.text3}
      maxFontSizeMultiplier={CONTROL_FONT_SCALE}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={[
        TYPE.field,
        styles.field,
        { backgroundColor: color.input, color: color.ink, borderColor: focused ? color.ring : color.transparent },
        style,
      ]}
    />
  );
}

export const CODE_LENGTH = 6;

/** Six cells over one input. `onFilled` fires once the sixth digit lands (the sheet verifies right away). */
export function CodeField({
  value,
  onChange,
  onFilled,
  label,
  invalid = false,
  disabled = false,
}: {
  value: string;
  onChange: (digits: string) => void;
  onFilled?: (digits: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { color } = useTheme();
  const input = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const cells = Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? "");
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.cells}>
      {cells.map((digit, index) => {
        const ring = invalid ? color.destructive : focused && index === active ? color.ring : color.transparent;
        return (
          <View key={index} style={[styles.cell, { backgroundColor: color.input, borderColor: ring }]}>
            <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.numMd, styles.digit, { color: color.ink }]}>
              {digit}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        editable={!disabled}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
          onChange(digits);
          if (digits.length === CODE_LENGTH && digits !== value) onFilled?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={CODE_LENGTH}
        accessibilityLabel={label}
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    height: SIZE.fieldHeight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    borderWidth: 2,
  },
  cells: { flexDirection: "row", gap: SPACE.sm, justifyContent: "center" },
  cell: {
    flex: 1,
    maxWidth: SIZE.fieldHeight,
    height: SIZE.fieldHeight,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: { fontVariant: NUMERIC_VARIANT, textAlign: "center" },
  // The real input stays focusable and readable by assistive tech, drawn invisibly over the cells.
  hidden: { ...StyleSheet.absoluteFill, opacity: 0, color: "transparent" },
});
