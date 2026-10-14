// Web: Turnkey's web kit provider (email code, Google, and Apple when its Services ID is set). The kit's own modal
// UI is not used: the app drives the same headless methods as on native, through the shared sign-in core.
import { TurnkeyProvider, type TurnkeyCallbacks, type TurnkeyProviderConfig } from "@turnkey/react-wallet-kit";
import type { ReactNode } from "react";

import { reportClientEvent } from "@/session/client-events";
import { describeError, summarize } from "./error-detail";
import { classifySignInFailure } from "./sign-in-errors";
import {
  APPLE_SERVICES_ID,
  GOOGLE_WEB_CLIENT_ID,
  PASSKEY_RP_ID,
  TURNKEY_AUTH_PROXY_CONFIG_ID,
  TURNKEY_ORGANIZATION_ID,
  isTurnkeyConfigured,
} from "./config";

const config: TurnkeyProviderConfig = {
  organizationId: TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: TURNKEY_AUTH_PROXY_CONFIG_ID,
  ...(PASSKEY_RP_ID ? { passkeyConfig: { rpId: PASSKEY_RP_ID } } : {}),
  auth: {
    oauthConfig: {
      ...(GOOGLE_WEB_CLIENT_ID ? { google: { primaryClientId: GOOGLE_WEB_CLIENT_ID } } : {}),
      ...(APPLE_SERVICES_ID ? { apple: { primaryClientId: APPLE_SERVICES_ID } } : {}),
    },
    autoRefreshSession: true,
  },
};

const callbacks: TurnkeyCallbacks = {
  onError: (error) => {
    const category = classifySignInFailure(error);
    const detail = describeError(error);
    console.warn("[wallet]", { category, code: error.code, error: detail });
    if (category !== "cancelled") reportClientEvent({ stage: "kit", category, ...summarize(detail) });
  },
};

export function TurnkeyWalletProvider({ children }: { children: ReactNode }) {
  // Without the two ids there is no wallet to talk to; the app still runs (guest look-around).
  if (!isTurnkeyConfigured) return <>{children}</>;
  return (
    <TurnkeyProvider config={config} callbacks={callbacks}>
      {children}
    </TurnkeyProvider>
  );
}
