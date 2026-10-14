import { Toaster } from "sonner-native";
import { ELEVATION, SHEET_SHAPE, TYPE, useTheme } from "@/components/kit/theme";

/**
 * One toast at a time, bottom, above the dock: a borderless raised plate with a card's 20 pt corners. It floats over
 * content like the dock, so it carries the dock's shadow instead of an outline.
 */
const VISIBLE_TOASTS = 1;

export function ToastHost() {
  const { name, color } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      visibleToasts={VISIBLE_TOASTS}
      theme={name}
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
