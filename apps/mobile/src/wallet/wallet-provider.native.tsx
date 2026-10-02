// The polyfill must load before anything that needs random bytes (Turnkey's session keys).
import "react-native-get-random-values";

import { TurnkeyProvider, type TurnkeyCallbacks, type TurnkeyProviderConfig } from "@turnkey/react-native-wallet-kit";
import type { ReactNode } from "react";

import {
  APP_SCHEME,
  APPLE_IOS_BUNDLE_ID,
  APPLE_SERVICES_ID,
  GOOGLE_WEB_CLIENT_ID,
  PASSKEY_RP_ID,
  TURNKEY_AUTH_PROXY_CONFIG_ID,
  TURNKEY_ORGANIZATION_ID,
  isWalletConfigured,
} from "./config";
import { reportClientEvent } from "@/session/client-events";
import { describeError, summarize } from "./error-detail";
import { classifySignInFailure } from "./sign-in-errors";

const config: TurnkeyProviderConfig = {
  organizationId: TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: TURNKEY_AUTH_PROXY_CONFIG_ID,
  ...(PASSKEY_RP_ID ? { passkeyConfig: { rpId: PASSKEY_RP_ID } } : {}),
  auth: {
    otp: { email: true, sms: false },
    passkey: PASSKEY_RP_ID !== "",
    oauth: {
      appScheme: APP_SCHEME,
      ...(GOOGLE_WEB_CLIENT_ID ? { google: { primaryClientId: { webClientId: GOOGLE_WEB_CLIENT_ID } } } : {}),
      apple: { primaryClientId: { iosBundleId: APPLE_IOS_BUNDLE_ID, serviceId: APPLE_SERVICES_ID } },
    },
    autoRefreshSession: true,
  },
};

const callbacks: TurnkeyCallbacks = {
  onError: (error) => {
    const category = classifySignInFailure(error);
    const detail = describeError(error);
    // A string, so the console's depth limit can't fold the cause chain into "[Object]".
    console.warn("[wallet]", { category, code: error.code, error: JSON.stringify(detail) });
    if (category !== "cancelled") reportClientEvent({ stage: "kit", category, ...summarize(detail) });
  },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  // Without the two ids there is no wallet to talk to; the app still runs (guest look-around).
  if (!isWalletConfigured) return <>{children}</>;
  return (
    <TurnkeyProvider config={config} callbacks={callbacks}>
      {children}
    </TurnkeyProvider>
  );
}
