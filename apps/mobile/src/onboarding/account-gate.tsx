// The gate every money entry point goes through (the + fan, the desktop rail, Home's actions): an account runs the
// action at once; a guest gets the sign-in sheet over the page they are on, titled with what they were doing ("Sign in
// to send"), and the action opens by itself once the account exists (`deferred-action.ts`). Other lanes call
// `useAccountGate()(verb)` instead of `router.push` for these five actions.
import { useRouter } from "expo-router";
import * as React from "react";

import { useFund } from "@/fund/fund-provider";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import {
  deferAction,
  type DeferredVerb,
  hydrateDeferredAction,
  takeDeferredAction,
  useDeferredAction,
} from "./deferred-action";

export type { DeferredVerb } from "./deferred-action";

/** Lets the page under the sheet settle (a dismissed setup page, the sheet's own exit) before the action opens. */
const RESUME_DELAY_MS = 360;

/** Opens one money action for someone who has an account. */
export function useRunMoneyAction(): (verb: DeferredVerb) => void {
  const router = useRouter();
  const fund = useFund();
  return React.useCallback(
    (verb: DeferredVerb) => {
      switch (verb) {
        case "send":
          return router.push("/send");
        case "receive":
          return router.push("/wallet/receive");
        case "fund":
          return fund.open();
        case "swap":
          return router.push("/swap");
        case "bridge":
          return router.push("/move");
      }
    },
    [router, fund],
  );
}

/** Runs a money action now, or — for a guest — after signing in, without a second tap. */
export function useAccountGate(): (verb: DeferredVerb) => void {
  const { status } = useSession();
  const signIn = useSignIn();
  const run = useRunMoneyAction();
  return React.useCallback(
    (verb: DeferredVerb) => {
      if (status === "account") return run(verb);
      deferAction(verb);
      signIn.open({ verb });
      return undefined;
    },
    [status, signIn, run],
  );
}

/** Mounted once in the tab shell: opens the action a guest started, as soon as their account is ready. */
export function DeferredActionHost() {
  const pending = useDeferredAction();
  const { status } = useSession();
  const run = useRunMoneyAction();
  const account = status === "account";
  React.useEffect(() => {
    if (status === "account" || status === "guest") void hydrateDeferredAction(status === "account");
  }, [status]);
  React.useEffect(() => {
    if (!pending?.released || !account) return undefined;
    const timer = setTimeout(() => {
      const verb = takeDeferredAction();
      if (verb) run(verb);
    }, RESUME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, account, run]);
  return null;
}
