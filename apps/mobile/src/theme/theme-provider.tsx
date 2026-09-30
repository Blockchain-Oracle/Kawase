// The active theme is two choices: light or dark, and mainnet or testnet (testnet is a colour layer, D-series
// design decision in DESIGN.md). Together they select one of the four Uniwind themes.
import { tokens, type ThemeName } from "@kawase/ui-tokens";
import { ThemeProvider as NavigationThemeProvider, type Theme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { Uniwind } from "uniwind";

type Mode = "light" | "dark";
type Network = "mainnet" | "testnet";

type ThemeState = {
  mode: Mode;
  network: Network;
  themeName: ThemeName;
  setMode: (mode: Mode) => void;
  setNetwork: (network: Network) => void;
};

const ThemeContext = React.createContext<ThemeState | null>(null);

function themeNameFor(mode: Mode, network: Network): ThemeName {
  if (network === "testnet") return mode === "dark" ? "testnet-dark" : "testnet";
  return mode;
}

function navigationTheme(themeName: ThemeName, mode: Mode): Theme {
  const colors = tokens.themes[themeName];
  const font = { fontFamily: tokens.fonts.body };
  return {
    dark: mode === "dark",
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
    fonts: {
      regular: { ...font, fontWeight: "400" },
      medium: { ...font, fontWeight: "500" },
      bold: { ...font, fontWeight: "700" },
      heavy: { ...font, fontWeight: "700" },
    },
  };
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>(tokens.defaultMode);
  const [network, setNetwork] = React.useState<Network>("mainnet");
  const themeName = themeNameFor(mode, network);

  React.useEffect(() => {
    Uniwind.setTheme(themeName);
  }, [themeName]);

  return (
    <ThemeContext.Provider value={{ mode, network, themeName, setMode, setNetwork }}>
      <NavigationThemeProvider value={navigationTheme(themeName, mode)}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

function useTheme(): ThemeState {
  const state = React.useContext(ThemeContext);
  if (!state) throw new Error("useTheme must be used inside ThemeProvider");
  return state;
}

export { ThemeProvider, useTheme };
export type { Mode, Network };
