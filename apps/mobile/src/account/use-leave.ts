// Leaving this device the way Settings → Sign out does (cards/access.md "Sign out"): Privy's session, then Kawase's
// (which clears caches, drafts and the push token), then back to the story.
import { useRouter } from "expo-router";

import { useSession } from "@/session/session-provider";
import { useWalletAccount } from "@/wallet/use-wallet-account";

export function useLeave() {
  const router = useRouter();
  const { signOut } = useSession();
  const account = useWalletAccount();
  return async () => {
    await account.signOutWallet().catch(() => undefined);
    await signOut();
    router.replace("/welcome");
  };
}
