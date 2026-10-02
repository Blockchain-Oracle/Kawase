// Leaving this device the way Settings → Sign out does (cards/access.md "Sign out"): Turnkey's session, then Kawase's
// (which clears caches, drafts and the push token), then back to the story.
import { useRouter } from "expo-router";

import { useSession } from "@/session/session-provider";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";

export function useLeave() {
  const router = useRouter();
  const { signOut } = useSession();
  const turnkey = useTurnkeyAccount();
  return async () => {
    await turnkey.signOutTurnkey().catch(() => undefined);
    await signOut();
    router.replace("/welcome");
  };
}
