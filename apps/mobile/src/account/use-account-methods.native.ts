// iOS and Android: Turnkey's React Native kit, or Privy's Expo SDK when it is the wallet provider (D41). The Privy half
// is loaded only on a Privy build, so a Turnkey build never evaluates Privy's native modules.
import { OtpType, useTurnkey } from "@turnkey/react-native-wallet-kit";

import { isPrivy, isWalletConfigured } from "@/wallet/config";
import { accountMethodsCore, type AccountMethods, type TurnkeyAccountApi } from "./account-methods-core";
import { UNCONFIGURED_METHODS, type PrivyAccountMethods } from "./use-account-methods-privy-core";

function useTurnkeyAccountMethods(): AccountMethods {
  return accountMethodsCore(useTurnkey() as unknown as TurnkeyAccountApi, OtpType.Email);
}

const privy: typeof import("./use-account-methods-privy.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluated only on a Privy build (see above)
  isPrivy && isWalletConfigured ? require("./use-account-methods-privy.native") : undefined;

export const useAccountMethods: () => AccountMethods | PrivyAccountMethods = !isPrivy
  ? useTurnkeyAccountMethods
  : (privy?.usePrivyAccountMethods ?? (() => UNCONFIGURED_METHODS));
