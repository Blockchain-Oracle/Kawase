// Web, Privy (D41): Google and Apple leave the page and come back to it signed in at Privy. This finishes what the
// sign-in sheet started, in the open: a sheet over the page says "Signing in…" while Privy spends the provider's code
// and the api links the account, then "Creating your wallet…", and closes on success with the same next step the
// sign-in sheet takes (the handle, wallet setup, or nothing). A failure says what failed in the sheet's own words
// (sign-in-sheet.tsx, Codex review R08): an email that belongs to another sign-in method, an outage with a Retry of
// only the step that failed, no connection, or a provider that would not finish (Retry goes back to it). Coming back
// without an answer (the browser's back button) is a cancel and shows nothing. The return marker is cleared only
// once the outcome was shown; failures are reported like every other sign-in stage (auth-stage.ts).
import { usePathname, useRouter, type Href } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError, type ApiUser } from "@kawase/api-client";

import { Button, PixelLoader, SPACE, TYPE, useTheme, WaitingText } from "@/components/kit";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";

import { useT } from "@/i18n";
import { rememberReturnTo, takeDeepLink } from "@/onboarding/continuation";
import { api } from "@/session/api";
import { reportClientEvent } from "@/session/client-events";
import { useSession } from "@/session/session-provider";

import { AuthStageError } from "./auth-stage";
import { describeError, summarize } from "./error-detail";
import { usePrivyAccount } from "./privy-account";
import { browserStorage, OAUTH_RETURN_KEY, takeOAuthReturn, usePrivyOAuth, withoutOAuthParams } from "./privy-oauth";
import { classifySignInFailure } from "./sign-in-errors";
import { RootSheetLayer } from "./root-sheet-layer";

/** How long Privy gets to turn the provider's answer into a login before the sheet calls it failed. */
const PROVIDER_WAIT_MS = 30_000;
/** Pages that are part of signing in: finishing there replaces them (sign-in-provider.tsx). */
const WELCOME_PATH = "/welcome";
const LINK_STAGES = new Set(["session", "proof", "link", "account"]);

type Step = "provider" | "account" | "wallet";
type Phase =
  | { name: "idle" }
  | { name: "working"; step: Step }
  /** `retry` is the step to run again; none when only another sign-in method can help. */
  | { name: "failed"; message: string; retry: Step | undefined; recovery: boolean };

/** What this account still needs after signing in; the same rule as the sign-in sheet's (sign-in-provider.tsx). */
async function nextStep(user: ApiUser): Promise<"handle" | "setup" | "none"> {
  if (!(user.handlePrompted ?? Boolean(user.handle))) return "handle";
  try {
    const status = await api.wallet.status();
    return status.address && status.networks[user.activeNetwork]?.setUp ? "none" : "setup";
  } catch {
    return "setup";
  }
}

export function PrivyOAuthReturn() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const account = usePrivyAccount();
  const oauth = usePrivyOAuth();
  const [provider] = React.useState(takeOAuthReturn);
  const [deadline] = React.useState(() => Date.now() + PROVIDER_WAIT_MS);
  const [phase, setPhase] = React.useState<Phase>(() =>
    provider ? { name: "working", step: "provider" } : { name: "idle" },
  );
  /** Closed by the person while a step runs: hidden until the outcome, which reopens it on a failure. */
  const [hidden, setHidden] = React.useState(false);

  // The steps' continuations read the latest account, user and page through this ref.
  const latest = React.useRef({ account, user, pathname });
  latest.current = { account, user, pathname };
  const linked = React.useRef<ApiUser | undefined>(undefined);

  const clearReturn = () => browserStorage()?.removeItem(OAUTH_RETURN_KEY);

  const fail = React.useCallback(
    (problem: unknown, step: Step) => {
      setHidden(false);
      if (
        problem instanceof AuthStageError &&
        problem.cause instanceof ApiError &&
        problem.cause.code === "account_recovery_required"
      ) {
        setPhase({ name: "failed", message: t("signIn.recoveryRequired"), retry: undefined, recovery: true });
        return;
      }
      const category = classifySignInFailure(problem);
      if (step === "provider") {
        // Privy's own failure has no stage around it; report it here like the stages report theirs.
        if (category === "cancelled") {
          clearReturn();
          setPhase({ name: "idle" });
          return;
        }
        reportClientEvent({ stage: "provider", category, ...summarize(describeError(problem)) });
      }
      const message =
        category === "offline"
          ? t("errors.offlineAction")
          : category === "rateLimited"
            ? t("errors.rateLimited")
            : problem instanceof AuthStageError && problem.stage === "wallet"
              ? t("errors.walletFailed")
              : problem instanceof AuthStageError && LINK_STAGES.has(problem.stage)
                ? t(problem.stage === "account" ? "signIn.accountFailed" : "signIn.linkFailed")
                : t("errors.signInFailed");
      const retry: Step = problem instanceof AuthStageError && problem.stage === "wallet" ? "wallet" : step;
      setPhase({ name: "failed", message, retry, recovery: false });
    },
    [t],
  );

  const finish = React.useCallback(
    async (signedIn: ApiUser) => {
      clearReturn();
      setPhase({ name: "idle" });
      const from = latest.current.pathname;
      const next = await nextStep(signedIn);
      if (latest.current.pathname !== from) return;
      if (next === "none") {
        if (from === WELCOME_PATH) {
          // The link remembered by the signed-out redirect carries Privy's spent one-time parameters: drop them.
          const link = takeDeepLink();
          router.replace((link ? withoutOAuthParams(link) : "/") as Href);
        }
        return;
      }
      // Onboarding ends back on the page the person signed in from (onboarding/continuation.ts).
      rememberReturnTo(from);
      const path = next === "handle" ? "/handle" : "/wallet";
      if (from === WELCOME_PATH) router.replace(path);
      else router.push(path);
    },
    [router],
  );

  /** The Kawase account, then the wallet; a retry starts again at the step that failed. */
  const run = React.useCallback(
    async (from: "account" | "wallet") => {
      const current = latest.current.account;
      let step: Step = from;
      try {
        if (from === "account") {
          setPhase({ name: "working", step: "account" });
          linked.current = await current.linkSession();
        }
        step = "wallet";
        setPhase({ name: "working", step: "wallet" });
        await current.ensureWallet();
        const signedIn = linked.current ?? latest.current.user;
        if (signedIn) await finish(signedIn);
        else setPhase({ name: "idle" });
      } catch (problem) {
        fail(problem, step);
      }
    },
    [fail, finish],
  );

  // Waiting on Privy: the login lands (then the account), Privy reports the code failed, or the wait runs out.
  const waitingOnProvider = phase.name === "working" && phase.step === "provider";
  const signedInAtPrivy = account.signedIn;
  const sessionUser = user;
  const oauthState = oauth.state;
  React.useEffect(() => {
    if (!waitingOnProvider) return undefined;
    if (signedInAtPrivy && sessionUser) {
      // An account session already (a reload after the account step): only the wallet is left.
      if (!sessionUser.isGuest) linked.current = sessionUser;
      void run(sessionUser.isGuest ? "account" : "wallet");
      return undefined;
    }
    if (oauthState.status === "error" && !signedInAtPrivy) {
      fail(oauthState.error ?? new Error("Privy: the provider's sign-in failed"), "provider");
      return undefined;
    }
    const timer = setTimeout(
      () => fail(new Error("Privy: the provider's sign-in did not finish"), "provider"),
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [waitingOnProvider, signedInAtPrivy, sessionUser, oauthState, deadline, run, fail]);

  const retry = async (step: Step) => {
    setHidden(false);
    if (step !== "provider") return void run(step);
    if (!provider) return;
    setPhase({ name: "working", step: "provider" });
    try {
      await oauth.start(provider);
    } catch (problem) {
      fail(problem, "provider");
    }
  };

  const close = () => {
    if (phase.name === "working") {
      setHidden(true);
      return;
    }
    clearReturn();
    // The email belongs to another sign-in method: this Privy login cannot be used, so it is ended.
    if (phase.name === "failed" && phase.recovery) void latest.current.account.signOutTurnkey().catch(() => undefined);
    setPhase({ name: "idle" });
  };

  if (!provider) return null;
  const working = phase.name === "working" ? phase.step : undefined;
  if (phase.name === "idle" || (hidden && working)) return null;
  const failedRetry = phase.name === "failed" ? phase.retry : undefined;
  const title = failedRetry === "wallet" ? t("setup.stepWallet") : t("wallet.oauthReturnTitle");

  return (
    <RootSheetLayer>
      <Sheet onClose={close} closeLabel={t("shell.kit.closeNamed", { name: title })}>
        <SheetHeading
          title={title}
          body={provider === "apple" ? t("wallet.oauthReturnApple") : t("wallet.oauthReturnGoogle")}
        />
        <View style={styles.body}>
          {working ? (
            <View accessibilityLiveRegion="polite" style={styles.wait}>
              <PixelLoader />
              {/* Each step is its own named wait; the provider's own deadline turns a stuck one into a failure with Retry. */}
              <WaitingText key={working} size="body" timeoutMs={null}>
                {working === "wallet" ? t("wallet.creatingVerb") : t("wallet.signingInVerb")}
              </WaitingText>
            </View>
          ) : null}
          {phase.name === "failed" ? (
            <FailedActions message={phase.message} retry={failedRetry} onRetry={(step) => void retry(step)} />
          ) : null}
        </View>
      </Sheet>
    </RootSheetLayer>
  );
}

function FailedActions({
  message,
  retry,
  onRetry,
}: {
  message: string;
  retry: Step | undefined;
  onRetry: (step: Step) => void;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const closeSheet = useSheetClose();
  return (
    <>
      <Text accessibilityRole="alert" style={[TYPE.body, styles.center, { color: color.destructive }]}>
        {message}
      </Text>
      {retry ? <Button label={t("common.retry")} onPress={() => onRetry(retry)} /> : null}
      <Button label={t("common.close")} variant="ghost" onPress={() => closeSheet()} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.md, paddingTop: SPACE.md },
  wait: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.md,
  },
  center: { textAlign: "center" },
});
