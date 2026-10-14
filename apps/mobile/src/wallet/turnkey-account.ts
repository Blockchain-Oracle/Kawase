// Web: Turnkey's web kit behind the shared sign-in core. Email code works on any origin the Turnkey auth proxy
// allows; Google opens Turnkey's OAuth popup; Apple on the web needs its Services ID, so it is offered only when set.
import { OtpType, useTurnkey } from "@turnkey/react-wallet-kit";

import { APPLE_SERVICES_ID, GOOGLE_WEB_CLIENT_ID, isTurnkeyConfigured } from "./config";
import { UNCONFIGURED_ACCOUNT, useTurnkeyAccountCore, type SocialProvider, type TurnkeyAccount } from "./turnkey-account-core";

export type { SocialProvider, TurnkeyAccount };

const PROVIDERS: readonly SocialProvider[] = [
  ...(APPLE_SERVICES_ID ? (["apple"] as const) : []),
  ...(GOOGLE_WEB_CLIENT_ID ? (["google"] as const) : []),
];

function useConfiguredAccount(): TurnkeyAccount {
  return useTurnkeyAccountCore(useTurnkey(), { providers: PROVIDERS, emailOtp: OtpType.Email });
}

// Without the Turnkey ids there is no provider above this hook (see turnkey-provider.tsx), so it must not call it.
export const useTurnkeyKitAccount: () => TurnkeyAccount = isTurnkeyConfigured ? useConfiguredAccount : () => UNCONFIGURED_ACCOUNT;
