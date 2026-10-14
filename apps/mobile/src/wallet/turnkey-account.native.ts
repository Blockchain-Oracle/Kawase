// Native: the React Native wallet kit behind the shared sign-in core (email code, Apple, Google).
import { OtpType, useTurnkey } from "@turnkey/react-native-wallet-kit";

import { useTurnkeyAccountCore, type SocialProvider, type TurnkeyAccount } from "./turnkey-account-core";

export type { SocialProvider, TurnkeyAccount };

const PROVIDERS: readonly SocialProvider[] = ["apple", "google"];

export function useTurnkeyKitAccount(): TurnkeyAccount {
  return useTurnkeyAccountCore(useTurnkey(), { providers: PROVIDERS, emailOtp: OtpType.Email });
}
