// iOS and Android: Turnkey's React Native kit.
import { OtpType, useTurnkey } from "@turnkey/react-native-wallet-kit";

import { accountMethodsCore, type AccountMethods, type TurnkeyAccountApi } from "./account-methods-core";

export function useAccountMethods(): AccountMethods {
  return accountMethodsCore(useTurnkey() as unknown as TurnkeyAccountApi, OtpType.Email);
}
