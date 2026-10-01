// The active theme's tokens as hex, for the parts that cannot take class names (gorhom sheets, blur tints, the
// textured card's lines, the orb). Everything else uses the Uniwind classes.
import { tokens, type ThemeName } from "@kawase/ui-tokens";

import { useTheme } from "@/theme/theme-provider";

type ThemeColors = (typeof tokens.themes)[ThemeName];

export function useThemeColors(): ThemeColors {
  const { themeName } = useTheme();
  return tokens.themes[themeName];
}
