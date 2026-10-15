// iOS and Android: the account behind the sign-in sheet, Settings and sign-out (account.ts): Privy's Expo SDK (D41),
// loaded only when the build has the Privy ids, or the guest-only stand-in without them.
import { UNCONFIGURED_ACCOUNT, type WalletAccount } from "./account";
import { isWalletConfigured } from "./config";

export type { SocialProvider, WalletAccount } from "./account";

const privy: typeof import("./privy-account.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Privy's native modules load only with its ids
  isWalletConfigured ? require("./privy-account.native") : undefined;

export const useWalletAccount: () => WalletAccount = privy?.usePrivyAccount ?? (() => UNCONFIGURED_ACCOUNT);
