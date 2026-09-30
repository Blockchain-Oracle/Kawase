// The polyfill must load before anything that needs random bytes (Turnkey's session keys).
import 'react-native-get-random-values';

import { TurnkeyProvider, type TurnkeyCallbacks, type TurnkeyProviderConfig } from '@turnkey/react-native-wallet-kit';
import type { ReactNode } from 'react';

import { APP_SCHEME, PASSKEY_RP_ID, TURNKEY_AUTH_PROXY_CONFIG_ID, TURNKEY_ORGANIZATION_ID, isWalletConfigured } from './config';

const config: TurnkeyProviderConfig = {
  organizationId: TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: TURNKEY_AUTH_PROXY_CONFIG_ID,
  ...(PASSKEY_RP_ID ? { passkeyConfig: { rpId: PASSKEY_RP_ID } } : {}),
  auth: {
    otp: { email: true, sms: false },
    passkey: PASSKEY_RP_ID !== '',
    oauth: { appScheme: APP_SCHEME },
    autoRefreshSession: true,
  },
};

const callbacks: TurnkeyCallbacks = {
  onError: (error) => console.warn('[wallet]', error),
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
