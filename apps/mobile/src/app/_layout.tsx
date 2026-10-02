import "@/global.css";
import "@/voice/register";
import { LogBox } from "react-native";

// Leaving a voice room closes LiveKit's signal stream; the SDK logs that expected close as an error.
LogBox.ignoreLogs(["error reading from signal stream"]);

import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Toaster } from "sonner-native";

import { LocaleProvider } from "@/i18n/locale-provider";
import { PushSync } from "@/notifications/push-sync";
import { FundProvider } from "@/fund/fund-provider";
import { BuyProvider } from "@/onramp/buy-provider";
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
              <PushSync />
              <LocaleProvider>
                <BottomSheetModalProvider>
                  <SignInProvider>
                    <BuyProvider>
                      <FundProvider>
                        <Stack screenOptions={{ headerShown: false }} />
                      </FundProvider>
                    </BuyProvider>
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
