import "@/global.css";

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Toaster } from "sonner-native";

import { LocaleProvider } from "@/i18n/locale-provider";
import { SessionProvider } from "@/session/session-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { ThemeSync } from "@/theme/theme-sync";
import { WalletProvider } from "@/wallet/wallet-provider";

// Sheets, toasts and the overlay host sit inside LocaleProvider so they inherit the reading direction.
export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <KeyboardProvider>
        <WalletProvider>
          <ThemeProvider>
            <SessionProvider>
              <ThemeSync />
              <LocaleProvider>
                <BottomSheetModalProvider>
                  <Stack screenOptions={{ headerShown: false }} />
                  <PortalHost />
                  <Toaster position="top-center" />
                </BottomSheetModalProvider>
              </LocaleProvider>
            </SessionProvider>
          </ThemeProvider>
        </WalletProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
