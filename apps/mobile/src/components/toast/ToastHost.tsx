/**
 * One toast at a time, bottom, above the dock: a borderless raised plate with a card's 20 pt corners (21st.dev
 * cnippet-dev/toast #24297 and Sonner as the specs, drawn by sonner-native, which the app's existing `toast(...)` calls
 * already use). It floats over content like the dock, so it carries the dock's shadow instead of an outline, and it
 * clears the dock on a phone. Mounted once at the root, in place of the plain Toaster.
 */
import { useWide } from "@kawase/ui-native/lib/wide";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";

import { DOCK, dockBottom, ELEVATION, SHEET_SHAPE, SPACE, TYPE, useTheme } from "@/components/kit/theme";

const VISIBLE_TOASTS = 1;

export function ToastHost() {
  const { name, color } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <Toaster
      position="bottom-center"
      visibleToasts={VISIBLE_TOASTS}
      theme={name}
      offset={wide ? SPACE.xl : DOCK.height + dockBottom(insets.bottom) + SPACE.sm}
      swipeToDismissDirection="left"
      toastOptions={{
        style: {
          backgroundColor: color.raised2,
          borderRadius: SHEET_SHAPE.rowRadius,
          ...ELEVATION.dock,
        },
        titleStyle: { ...TYPE.rowTitle, color: color.ink },
        descriptionStyle: { ...TYPE.rowDetail, color: color.text2 },
      }}
    />
  );
}
