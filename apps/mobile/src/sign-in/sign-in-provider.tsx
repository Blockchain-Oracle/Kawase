// One sign-in sheet for the whole app: the story's "I already have an account", guest home's first step, a guest's
// money action, Settings and the `/sign-in` deep link all open the same sheet over the page they are on.
//
// After sign-in the route comes from the account's state, not a fixed path (Codex review R07): the optional handle
// step only if this account never answered it (a saved handle or Skip is remembered on the account), wallet setup
// only if the wallet is not set up on the active network, and otherwise nothing — the sheet closes and the person
// is where they were (from the story: home). Onboarding that does run ends back on the page sign-in was opened from
// (`onboarding/continuation.ts`), with that page's state kept and nothing submitted for them. Closing the sheet
// without signing in changes nothing.
import { usePathname, useRouter } from "expo-router";
import * as React from "react";

import type { ApiUser } from "@kawase/api-client";

import { forgetReturnTo, rememberReturnTo } from "@/onboarding/continuation";
import { api } from "@/session/api";
import { SignInSheet } from "@/sign-in/sign-in-sheet";

type SignInContextValue = {
  open: () => void;
  isOpen: boolean;
};

const SignInContext = React.createContext<SignInContextValue | null>(null);

/** Paths outside the signed-in area: leaving them for onboarding replaces them, so back does not return there. */
const ONBOARDING_PATHS = new Set(["/welcome"]);

type Next = "handle" | "setup" | "none";

/** What this account still needs after signing in. A wallet that cannot be read goes to setup, which can retry. */
async function nextStep(user: ApiUser): Promise<Next> {
  if (!(user.handlePrompted ?? Boolean(user.handle))) return "handle";
  try {
    const status = await api.wallet.status();
    const ready = Boolean(status.address && status.networks[user.activeNetwork]?.setUp);
    return ready ? "none" : "setup";
  } catch {
    return "setup";
  }
}

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setOpen] = React.useState(false);
  const currentPath = React.useRef(pathname);
  currentPath.current = pathname;
  const completion = React.useRef(0);

  const value = React.useMemo(
    () => ({
      open: () => {
        completion.current += 1;
        rememberReturnTo(pathname);
        setOpen(true);
      },
      isOpen,
    }),
    [isOpen, pathname],
  );

  const onSignedIn = async (user: ApiUser) => {
    const ticket = ++completion.current;
    setOpen(false);
    const from = pathname;
    const next = await nextStep(user);
    if (completion.current !== ticket || currentPath.current !== from) return;
    const go = (path: "/handle" | "/wallet" | "/") => (ONBOARDING_PATHS.has(from) ? router.replace(path) : router.push(path));
    if (next === "handle") go("/handle");
    else if (next === "setup") go("/wallet");
    else {
      // Nothing to set up: stay on the page (it now shows the account), or leave the story for home.
      forgetReturnTo();
      if (ONBOARDING_PATHS.has(from)) router.replace("/");
    }
  };

  return (
    <SignInContext.Provider value={value}>
      {children}
      <SignInSheet open={isOpen} onClose={() => setOpen(false)} onSignedIn={(user) => void onSignedIn(user)} />
    </SignInContext.Provider>
  );
}

export function useSignIn(): SignInContextValue {
  const context = React.useContext(SignInContext);
  if (!context) throw new Error("useSignIn must be used inside SignInProvider");
  return context;
}
