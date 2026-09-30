// The internal screens take ?mode=light|dark&network=mainnet|testnet&lang=en|ar&scroll=<points>, so every
// state can be opened by link (and captured by the screenshot scripts).
import { useLocalSearchParams } from "expo-router";
import * as React from "react";

import type { SampleLocale } from "@/gallery/sample";
import { useTheme } from "@/theme/theme-provider";

export function usePreviewParams(): { locale: SampleLocale; scroll: number } {
  const { mode, network, lang, scroll } = useLocalSearchParams<{
    mode?: string;
    network?: string;
    lang?: string;
    scroll?: string;
  }>();
  const { setMode, setNetwork } = useTheme();

  React.useEffect(() => {
    if (mode === "light" || mode === "dark") setMode(mode);
    if (network === "mainnet" || network === "testnet") setNetwork(network);
  }, [mode, network, setMode, setNetwork]);

  return { locale: lang === "ar" ? "ar" : "en", scroll: Number(scroll) || 0 };
}
