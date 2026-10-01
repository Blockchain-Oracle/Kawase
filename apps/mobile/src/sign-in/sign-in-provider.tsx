// One sign-in sheet for the whole app: the story's "I already have an account", guest home's first step, a guest's
// money action, Settings and the `/sign-in` deep link all open the same sheet over the page they are on. After
// sign-in the new account goes on to the @handle step and the wallet setup; a returning account whose wallet is
// ready lands on home (the setup page sends it there).
import { usePathname, useRouter } from "expo-router";
import * as React from "react";

import { SignInSheet } from "@/sign-in/sign-in-sheet";

type SignInContextValue = {
  open: () => void;
  isOpen: boolean;
};

const SignInContext = React.createContext<SignInContextValue | null>(null);

/** Paths outside the signed-in area: leaving them for onboarding replaces them, so back does not return there. */
const ONBOARDING_PATHS = new Set(["/welcome"]);

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setOpen] = React.useState(false);

  const value = React.useMemo(() => ({ open: () => setOpen(true), isOpen }), [isOpen]);

  const onSignedIn = () => {
    setOpen(false);
    // The handle page skips itself when the account already has one, and the setup page skips itself when the
    // wallet is ready, so one route serves new and returning accounts alike.
    if (ONBOARDING_PATHS.has(pathname)) router.replace("/handle");
    else router.push("/handle");
  };

  return (
    <SignInContext.Provider value={value}>
      {children}
      <SignInSheet open={isOpen} onClose={() => setOpen(false)} onSignedIn={onSignedIn} />
    </SignInContext.Provider>
  );
}

export function useSignIn(): SignInContextValue {
  const context = React.useContext(SignInContext);
  if (!context) throw new Error("useSignIn must be used inside SignInProvider");
  return context;
}
