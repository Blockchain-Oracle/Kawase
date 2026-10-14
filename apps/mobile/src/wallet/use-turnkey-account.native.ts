// iOS and Android: the account behind the sign-in sheet, Settings and sign-out, for this build's wallet provider (D41).
// The name and the `TurnkeyAccount` shape stay, so the screens do not change: Privy (privy-account.native.ts, loaded
// only on a Privy build) or Turnkey (turnkey-account.native.ts, the fallback for one build).
import { isPrivy, isWalletConfigured } from "./config";
import { useTurnkeyKitAccount } from "./turnkey-account.native";
import { UNCONFIGURED_ACCOUNT, type SocialProvider, type TurnkeyAccount } from "./turnkey-account-core";

export type { SocialProvider, TurnkeyAccount };

const privy: typeof import("./privy-account.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluated only on a Privy build (see above)
  isPrivy && isWalletConfigured ? require("./privy-account.native") : undefined;

export const useTurnkeyAccount: () => TurnkeyAccount = !isPrivy
  ? useTurnkeyKitAccount
  : (privy?.usePrivyAccount ?? (() => UNCONFIGURED_ACCOUNT));
