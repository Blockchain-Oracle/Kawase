// Web: the account behind the sign-in sheet, Settings and sign-out (account.ts): Privy (D41), the dev key in local
// development, or the guest-only stand-in on a build without the Privy ids.
import type { WalletAccount } from "./account";
import { UNCONFIGURED_ACCOUNT } from "./account";
import { isDev, isWalletConfigured } from "./config";
import { useDevAccount } from "./dev-account";
import { usePrivyAccount } from "./privy-account";

export type { SocialProvider, WalletAccount } from "./account";

export const useWalletAccount: () => WalletAccount = isDev
  ? useDevAccount
  : isWalletConfigured
    ? usePrivyAccount
    : () => UNCONFIGURED_ACCOUNT;
