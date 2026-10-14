import { router, useNavigation } from "expo-router";
import { useLayoutEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ChevronLeft, Icon } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { SIZE, SPACE, useTheme } from "@/components/kit/theme";

const SHEET_PREFIX = "(sheets)/";

/**
 * A page opened from a sheet (the Add money hub's routes keep the hub beneath them) is presented over it as a native
 * card, where the stack draws no back button. This gives that page the explicit Back each funding method keeps: one
 * tap returns to the hub with its selection. A page pushed normally keeps the native back and its swipe.
 */
export function useBackOverSheet() {
  const navigation = useNavigation();
  const state = navigation.getState();
  const below = state ? state.routes[state.index - 1] : undefined;
  const overSheet = below?.name.startsWith(SHEET_PREFIX) === true;
  useLayoutEffect(() => {
    if (overSheet) navigation.setOptions({ headerLeft: () => <HeaderBack /> });
  }, [navigation, overSheet]);
}

function HeaderBack() {
  const { color } = useTheme();
  const { t } = useT();
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        router.back();
      }}
      accessibilityRole="button"
      accessibilityLabel={t("shell.kit.back")}
      hitSlop={SPACE.md}
      style={styles.tap}
    >
      <Icon icon={ChevronLeft} size={SIZE.icon} tint={color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ tap: { minWidth: SIZE.touch, minHeight: SIZE.touch, justifyContent: "center" } });
