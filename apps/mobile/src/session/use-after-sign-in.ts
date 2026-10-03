// A guest's money action opens the sign-in sheet in place and then resumes (plan §D "Guest Home": "any money action
// opens the sign-in sheet in place and resumes the action afterwards", D13; R13). `guard(action)` runs the action at
// once for an account; for a guest it remembers it and opens the sheet. The action runs when the account exists, the
// sheet has closed and this screen is in front again (after the handle or wallet setup, if those ran). Closing the
// sheet without signing in forgets it.
import { useIsFocused } from "expo-router";
import * as React from "react";

import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

export function useAfterSignIn() {
  const { status } = useSession();
  const signIn = useSignIn();
  const focused = useIsFocused();
  const pending = React.useRef<(() => void) | null>(null);
  const [waiting, setWaiting] = React.useState(false);
  const account = status === "account";
  const wasOpen = React.useRef(false);

  // The sheet closed: signed in, the action waits for this screen; not signed in, it is forgotten.
  React.useEffect(() => {
    if (wasOpen.current && !signIn.isOpen && !account) {
      pending.current = null;
      setWaiting(false);
    }
    wasOpen.current = signIn.isOpen;
  }, [signIn.isOpen, account]);

  React.useEffect(() => {
    if (!waiting || !account || signIn.isOpen || !focused) return;
    const action = pending.current;
    pending.current = null;
    setWaiting(false);
    action?.();
  }, [waiting, account, signIn.isOpen, focused]);

  return React.useCallback(
    (action: () => void) => {
      if (account) {
        action();
        return;
      }
      pending.current = action;
      setWaiting(true);
      signIn.open();
    },
    [account, signIn],
  );
}
