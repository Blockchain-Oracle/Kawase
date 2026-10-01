// Web: the Turnkey web kit is not wired yet, so sign-in is native-only for now (Stage 3 open item).
import type { SocialProvider, TurnkeyAccount } from "./use-turnkey-account.native";

export type { SocialProvider, TurnkeyAccount };

const unavailable = () => Promise.reject(new Error("Sign in is not available on the web yet"));

export function useTurnkeyAccount(): TurnkeyAccount {
  return {
    available: false,
    providers: [],
    signedIn: false,
    email: undefined,
    sendCode: unavailable,
    verifyCode: unavailable,
    signInWith: unavailable,
    linkSession: unavailable,
    ensureWallet: unavailable,
    signOutTurnkey: () => Promise.resolve(),
  };
}
