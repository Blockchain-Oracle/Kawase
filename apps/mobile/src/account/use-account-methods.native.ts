// iOS and Android: Settings → Account over Privy's Expo SDK (use-account-methods-privy.native.ts, D41), loaded only
// when the build has the Privy ids; without them there is nothing to manage.
import { isWalletConfigured } from "@/wallet/config";

import { UNCONFIGURED_METHODS, type AccountMethods } from "./account-methods";

const privy: typeof import("./use-account-methods-privy.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Privy's native modules load only with its ids
  isWalletConfigured ? require("./use-account-methods-privy.native") : undefined;

export const useAccountMethods: () => AccountMethods = privy?.usePrivyAccountMethods ?? (() => UNCONFIGURED_METHODS);
