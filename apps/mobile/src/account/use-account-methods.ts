// The web: Turnkey's React kit (same methods as the native one).
import { OtpType, useTurnkey } from "@turnkey/react-wallet-kit";

import { accountMethodsCore, type AccountMethods, type TurnkeyAccountApi } from "./account-methods-core";

export function useAccountMethods(): AccountMethods {
  return accountMethodsCore(useTurnkey() as unknown as TurnkeyAccountApi, OtpType.Email);
}
