/**
 * A search pill (Markets, a picker sheet): the icon, the field and the system clear button, on the muted plate.
 * `onFocus` lets a sheet rise to its full height before the keyboard arrives.
 */
import { StyleSheet, TextInput, View } from "react-native";

import { useT } from "@/i18n";

import { Icon, Search } from "./icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "./theme";

const SEARCH_ICON = 18;

export function SearchField({
  value,
  onChange,
  onFocus,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  placeholder?: string;
}) {
  const { color } = useTheme();
  const { t } = useT();
  const hint = placeholder ?? t("shell.kit.search");
  return (
    <View style={[styles.search, { backgroundColor: color.muted }]}>
      <Icon icon={Search} size={SEARCH_ICON} tint={color.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        {...(onFocus ? { onFocus } : {})}
        placeholder={hint}
        placeholderTextColor={color.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel={hint}
        style={[TYPE.body, styles.input, { color: color.ink }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    minHeight: SIZE.touch,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
  },
  input: { flex: 1, minHeight: SIZE.touch },
});
