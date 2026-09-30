import "@/global.css";

import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

import { ThemeProvider } from "@/theme/theme-provider";
import { WalletProvider } from "@/wallet/wallet-provider";

export default function RootLayout() {
  return (
    <WalletProvider>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <PortalHost />
      </ThemeProvider>
    </WalletProvider>
  );
}
