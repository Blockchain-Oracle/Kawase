import "@/global.css";

import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

import { LocaleProvider } from "@/i18n/locale-provider";
import { SessionProvider } from "@/session/session-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { ThemeSync } from "@/theme/theme-sync";
import { WalletProvider } from "@/wallet/wallet-provider";

export default function RootLayout() {
  return (
    <WalletProvider>
      <ThemeProvider>
        <SessionProvider>
          <ThemeSync />
          <LocaleProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <PortalHost />
          </LocaleProvider>
        </SessionProvider>
      </ThemeProvider>
    </WalletProvider>
  );
}
