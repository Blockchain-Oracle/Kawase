import "@/global.css";

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Toaster } from "sonner-native";

import { LocaleProvider } from "@/i18n/locale-provider";
import { FundProvider } from "@/fund/fund-provider";
import { SessionProvider } from "@/session/session-provider";
import { SignInProvider } from "@/sign-in/sign-in-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { ThemeSync } from "@/theme/theme-sync";
import { WalletProvider } from "@/wallet/wallet-provider";
import { WebApprovalHost } from "@/wallet/web-approval-host";

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
                  <SignInProvider>
                    <FundProvider>
                      <Stack screenOptions={{ headerShown: false }} />
                    </FundProvider>
                  </SignInProvider>
                  <PortalHost />
                  <WebApprovalHost />
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
