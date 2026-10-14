// Web: the account behind the sign-in sheet, Settings and sign-out, for this build's wallet provider (D41). The name
// and the `TurnkeyAccount` shape stay, so the screens do not change: Privy (privy-account.ts) or Turnkey
// (turnkey-account.ts, the fallback for one build).
import { isDev, isPrivy, isWalletConfigured } from "./config";
import { useDevAccount } from "./dev-account";
import { usePrivyAccount } from "./privy-account";
import { useTurnkeyKitAccount } from "./turnkey-account";
import { UNCONFIGURED_ACCOUNT, type SocialProvider, type TurnkeyAccount } from "./turnkey-account-core";

export type { SocialProvider, TurnkeyAccount };

export const useTurnkeyAccount: () => TurnkeyAccount = isDev
  ? useDevAccount
  : !isPrivy
  ? useTurnkeyKitAccount
  : isWalletConfigured
    ? usePrivyAccount
    : () => UNCONFIGURED_ACCOUNT;
