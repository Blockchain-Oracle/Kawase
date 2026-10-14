// One sign-in sheet for the whole app: the story's "Create account" and "I have an account", guest home's first step,
// a guest's money action, Settings and the `/sign-in` deep link all open the same sheet over the page they are on.
//
// After sign-in the route comes from the account's state, not a fixed path (Codex review R07): the optional handle
// step only if this account never answered it (a saved handle or Skip is remembered on the account), wallet setup
// only if the wallet is not set up on the active network, and otherwise nothing — the sheet closes and the person
// is where they were (from the story: home). Onboarding that does run ends back on the page sign-in was opened from
// (`onboarding/continuation.ts`), with that page's state kept and nothing submitted for them. Closing the sheet
// without signing in changes nothing.
//
// Value first, sign last (Senryo's terms gate): opened by a money action a guest started (`useAccountGate`), the sheet
// says so ("Sign in to send"), and that action opens by itself once the account is ready (`deferred-action.ts`).
import { usePathname, useRouter, type Href } from "expo-router";
import * as React from "react";

import type { ApiUser } from "@kawase/api-client";

import { forgetReturnTo, rememberReturnTo, takeDeepLink } from "@/onboarding/continuation";
import {
  DEFERRED_VERBS,
  dropDeferredAction,
  releaseDeferredAction,
  type DeferredVerb,
} from "@/onboarding/deferred-action";
import { api } from "@/session/api";
import { SignInSheet } from "@/sign-in/sign-in-sheet";

/** Why the sheet opened: a money action a guest started, or one of the story's two doors. */
export type SignInOptions = { verb?: DeferredVerb; intent?: "create" | "signIn" };
export type SignInReason = { kind: "verb"; verb: DeferredVerb } | { kind: "create" } | { kind: "signIn" } | undefined;

type SignInContextValue = {
  /** Many callers pass it straight to `onPress`, so anything that is not `SignInOptions` is ignored. */
  open: (options?: SignInOptions | unknown) => void;
  isOpen: boolean;
};

const SignInContext = React.createContext<SignInContextValue | null>(null);

/** Paths outside the signed-in area: leaving them for onboarding replaces them, so back does not return there. */
const ONBOARDING_PATHS = new Set(["/welcome"]);

type Next = "handle" | "setup" | "none";

function reasonOf(options: unknown): SignInReason {
  if (!options || typeof options !== "object") return undefined;
  const { verb, intent } = options as Record<string, unknown>;
  if (typeof verb === "string" && (DEFERRED_VERBS as readonly string[]).includes(verb))
    return { kind: "verb", verb: verb as DeferredVerb };
  if (intent === "create") return { kind: "create" };
  if (intent === "signIn") return { kind: "signIn" };
  return undefined;
}

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
  const [reason, setReason] = React.useState<SignInReason>();
  const currentPath = React.useRef(pathname);
  currentPath.current = pathname;
  const completion = React.useRef(0);

  const value = React.useMemo(
    () => ({
      open: (options?: SignInOptions | unknown) => {
        completion.current += 1;
        rememberReturnTo(pathname);
        setReason(reasonOf(options));
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
      // Nothing to set up: stay on the page (it now shows the account), or leave the story for home. A money action
      // the guest started opens now, without a second tap.
      forgetReturnTo();
      releaseDeferredAction();
      // From the story: where a signed-out link was going, else home (A5-2).
      if (ONBOARDING_PATHS.has(from)) router.replace((takeDeepLink() ?? "/") as Href);
    }
  };

  return (
    <SignInContext.Provider value={value}>
      {children}
      <SignInSheet
        open={isOpen}
        reason={reason}
        onClose={() => {
          // Closed without an account: the action the guest started is not resumed later.
          dropDeferredAction();
          setOpen(false);
        }}
        onSignedIn={(user) => void onSignedIn(user)}
      />
    </SignInContext.Provider>
  );
}

export function useSignIn(): SignInContextValue {
  const context = React.useContext(SignInContext);
  if (!context) throw new Error("useSignIn must be used inside SignInProvider");
  return context;
}
