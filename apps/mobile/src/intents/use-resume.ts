// Resolve and resume, uniformly (T1, R12, D13): when what stopped an action is fixed elsewhere — signed in, wallet set
// up, a limit changed, money added — the same action is checked again with fresh facts, never restarted and never
// sent by itself. Cards for every kind (send, swap and trade, bridge, earn) call this with their blocking code and
// their own re-check (a new version of the same intent); the fixes themselves stay on the cards.
import { useFocusEffect } from "expo-router";
import * as React from "react";

import { useSession } from "@/session/session-provider";

/** Fixed by signing in (the session becomes an account). */
const SIGN_IN = new Set(["SIGN_IN_REQUIRED", "ACCOUNT_REQUIRED"]);
/** Fixed on another screen the person comes back from: wallet setup, Wallet & limits, adding money. */
const ELSEWHERE = new Set(["WALLET_NOT_READY", "WALLET_NOT_SET_UP", "NO_WALLET", "NO_ALLOWANCE", "INSUFFICIENT_BALANCE", "INSUFFICIENT_GAS"]);
const LIMIT = /^OVER_/;

export const fixedElsewhere = (code: string | undefined) => Boolean(code && (ELSEWHERE.has(code) || LIMIT.test(code)));

export function useResumeWhenFixed(
  code: string | undefined,
  recheck: () => void,
  options: { signIn?: boolean } = {},
) {
  const { status } = useSession();
  const watchSignIn = options.signIn ?? true;
  const latest = React.useRef(recheck);
  latest.current = recheck;

  // Signed in while this was waiting for it: check the same action again.
  const before = React.useRef(status);
  React.useEffect(() => {
    const was = before.current;
    before.current = status;
    if (watchSignIn && was !== "account" && status === "account" && code && SIGN_IN.has(code)) latest.current();
  }, [status, code, watchSignIn]);

  // Back from the screen that fixes it (setup, limits, add money): check again. Not on the first focus — the card
  // was just drawn from fresh facts.
  const focused = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        return;
      }
      if (fixedElsewhere(code)) latest.current();
    }, [code]),
  );
}
