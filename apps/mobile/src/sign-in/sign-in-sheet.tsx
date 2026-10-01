// The sign-in sheet (journey 2; Solflare S07/S08, Phantom P01/P03/P04, Fomo F01): one sheet for signing in and
// signing up, opened over whatever page asked for it (the story keeps moving behind the scrim). Email code is the
// primary method, then "or", then Apple and Google with their real marks. The code is a nested step with a back
// chevron; the email survives going back. While a provider's flow runs its button spins and the others wait; a
// cancelled provider sheet is not an error. After the api knows the account, the wallet is created in the same
// sheet ("Creating your wallet…"), then the caller decides where to go next.
//
// Failures say what failed (Codex review R08): a wrong or expired code, too many codes, no connection, or "you're
// signed in, but the wallet wasn't created" — which keeps the sign-in and retries only the wallet. A sheet closed
// mid-request ignores the late answer instead of navigating, and a new code can be asked for after a short wait.
import * as React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ApiUser } from "@kawase/api-client";
import { OrDivider } from "@kawase/ui-native/components/or-divider";
import { ProviderButton } from "@kawase/ui-native/components/provider-button";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { useT } from "@/i18n";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { classifySignInFailure, type SignInFailure } from "@/wallet/sign-in-errors";
import { useTurnkeyAccount, type SocialProvider } from "@/wallet/use-turnkey-account";

const CODE_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A new code can be asked for this long after the last one was sent. */
const RESEND_COOLDOWN_S = 30;
const MS_PER_SECOND = 1_000;

type Step = { name: "methods" } | { name: "code"; email: string; otpId: string; otpEncryptionTargetBundle: string };
type Pending = "code" | "verify" | "resend" | "continue" | SocialProvider | "wallet" | undefined;

type SignInSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called once the api knows the account and its wallet exists. */
  onSignedIn: (user: ApiUser) => void;
};

export function SignInSheet({ open, onClose, onSignedIn }: SignInSheetProps) {
  const { t } = useT();
  const { mode } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const turnkey = useTurnkeyAccount();
  const [step, setStep] = React.useState<Step>({ name: "methods" });
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState<Pending>();
  const [error, setError] = React.useState<string>();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  /** Signed in, but the wallet was not created: the account to finish with a retry of the wallet step only. */
  const [walletFor, setWalletFor] = React.useState<ApiUser>();
  const [resendAt, setResendAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  // Every opening and closing starts a new generation; an answer from an older one is ignored.
  const generation = React.useRef(0);

  // A fresh sheet starts at the methods; the email typed last time stays.
  React.useEffect(() => {
    generation.current += 1;
    if (!open) {
      setStep({ name: "methods" });
      setCode("");
      setError(undefined);
      setPending(undefined);
      setWalletFor(undefined);
    }
  }, [open]);

  // The resend countdown ticks only while it runs.
  React.useEffect(() => {
    if (resendAt <= now) return undefined;
    const timer = setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [resendAt, now]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / MS_PER_SECOND));

  const busy = pending !== undefined;

  const message = (failure: SignInFailure, verifying: boolean) => {
    switch (failure) {
      case "invalidCode":
        return t("signIn.invalidCode");
      case "expiredCode":
        return t("errors.expiredCode");
      case "rateLimited":
        return t("errors.rateLimited");
      case "offline":
        return t("errors.offlineAction");
      default:
        return verifying ? t("errors.signInFailed") : t("common.error");
    }
  };

  /** The wallet step on its own: after a sign-in, and again from the Retry when it failed. */
  const createWallet = async (user: ApiUser, started: number) => {
    setPending("wallet");
    setError(undefined);
    try {
      await turnkey.ensureWallet();
      if (started !== generation.current) return;
      setPending(undefined);
      setWalletFor(undefined);
      onSignedIn(user);
    } catch (problem) {
      if (started !== generation.current) return;
      setPending(undefined);
      setWalletFor(user);
      setError(classifySignInFailure(problem) === "offline" ? t("errors.offlineAction") : t("errors.walletFailed"));
    }
  };

  /** Runs one sign-in path: the api account first, then the wallet, then hands over. */
  const finish = async (signIn: () => Promise<ApiUser>, which: Pending) => {
    const started = generation.current;
    setPending(which);
    setError(undefined);
    let user: ApiUser;
    try {
      user = await signIn();
    } catch (problem) {
      if (started !== generation.current) return;
      setPending(undefined);
      const failure = classifySignInFailure(problem);
      if (failure !== "cancelled") setError(message(failure, true));
      return;
    }
    // Signed in, but the sheet was closed meanwhile: the account exists; the person decides where to go.
    if (started !== generation.current) return;
    await createWallet(user, started);
  };

  const sendCode = async (resend = false) => {
    const started = generation.current;
    const address = (step.name === "code" ? step.email : email).trim();
    setPending(resend ? "resend" : "code");
    setError(undefined);
    try {
      const sent = await turnkey.sendCode(address);
      if (started !== generation.current) return;
      setStep({ name: "code", email: address, ...sent });
      setCode("");
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_COOLDOWN_S * MS_PER_SECOND);
    } catch (problem) {
      if (started !== generation.current) return;
      setError(message(classifySignInFailure(problem), false));
    } finally {
      if (started === generation.current) setPending(undefined);
    }
  };

  const verify = (value: string) => {
    if (step.name !== "code" || value.trim().length !== CODE_LENGTH || busy) return;
    void finish(() => turnkey.verifyCode({ email: step.email, code: value, otpId: step.otpId, otpEncryptionTargetBundle: step.otpEncryptionTargetBundle }), "verify");
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    // The sixth digit signs in; no extra tap when the code is complete.
    if (digits.length === CODE_LENGTH) verify(digits);
  };

  const sheetColors = { background: colors.card, handle: colors.muted, scrim: colors.scrim };
  const languagePill = <LanguagePill onPress={() => setLanguageOpen(true)} />;
  const working = pending === "wallet" ? t("wallet.creating") : pending === "verify" || pending === "continue" || pending === "apple" || pending === "google" ? t("signIn.signingIn") : undefined;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={walletFor ? t("setup.stepWallet") : step.name === "methods" ? t("signIn.sheetTitle") : t("signIn.codeTitle")}
        subtitle={walletFor ? undefined : step.name === "methods" ? t("signIn.subtitle") : t("signIn.codeSent", { email: step.email })}
        colors={sheetColors}
        closeLabel={t("common.close")}
        bottomInset={insets.bottom}
        onBack={step.name === "code" && !busy && !walletFor ? () => setStep({ name: "methods" }) : undefined}
        backLabel={t("common.back")}
        headerEnd={languagePill}
        className="gap-3"
      >
        {walletFor ? (
          <Button size="lg" disabled={busy} onPress={() => void createWallet(walletFor, generation.current)}>
            {pending === "wallet" ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
            <Text>{t("common.retry")}</Text>
          </Button>
        ) : step.name === "methods" ? (
          <>
              {!turnkey.available ? <Text className="text-muted-foreground bg-muted rounded-2xl px-4 py-3 text-sm">{t("signIn.webUnavailable")}</Text> : null}

              {turnkey.signedIn && turnkey.email ? (
                <Button size="lg" variant="secondary" disabled={busy} onPress={() => void finish(turnkey.linkSession, "continue")}>
                  {pending === "continue" ? <ActivityIndicator color={colors.foreground} /> : null}
                  <Text numberOfLines={1}>{t("signIn.continueAs", { email: turnkey.email })}</Text>
                </Button>
              ) : null}

              <SheetInput
                value={email}
                onChangeText={setEmail}
                placeholder={t("signIn.emailPlaceholder")}
                placeholderTextColor={colors["muted-foreground"]}
                accessibilityLabel={t("signIn.email")}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="send"
                editable={turnkey.available && !busy}
                onSubmitEditing={() => (EMAIL_PATTERN.test(email.trim()) ? void sendCode() : undefined)}
              />
              <Button size="lg" disabled={busy || !turnkey.available || !EMAIL_PATTERN.test(email.trim())} onPress={() => void sendCode()}>
                {pending === "code" ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
                <Text>{t("signIn.sendCode")}</Text>
              </Button>

              {turnkey.providers.length > 0 ? (
                <>
                  <OrDivider label={t("signIn.or")} />
                  {turnkey.providers
                    // Apple first on Apple platforms (HIG), Google first elsewhere.
                    .slice()
                    .sort((a) => (a === (Platform.OS === "ios" ? "apple" : "google") ? -1 : 1))
                    .map((provider) => (
                      <ProviderButton
                        key={provider}
                        provider={provider}
                        label={provider === "apple" ? t("signIn.apple") : t("signIn.google")}
                        scheme={mode}
                        pending={pending === provider}
                        disabled={busy && pending !== provider}
                        onPress={() => void finish(() => turnkey.signInWith(provider), provider)}
                      />
                    ))}
                </>
              ) : null}

          </>
        ) : (
          <>
              <SheetInput
                value={code}
                onChangeText={onCodeChange}
                placeholder={t("signIn.code")}
                placeholderTextColor={colors["muted-foreground"]}
                accessibilityLabel={t("signIn.code")}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                autoFocus
                editable={!busy}
                className="font-mono text-center text-2xl tracking-[8px]"
              />
              <Button size="lg" disabled={busy || code.length !== CODE_LENGTH} onPress={() => verify(code)}>
                {pending === "verify" ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
                <Text>{t("signIn.verify")}</Text>
              </Button>
              <Button variant="ghost" disabled={busy || resendIn > 0} onPress={() => void sendCode(true)}>
                {pending === "resend" ? <ActivityIndicator color={colors["muted-foreground"]} /> : null}
                <Text className="text-muted-foreground">{resendIn > 0 ? t("errors.resendIn", { seconds: resendIn }) : t("signIn.resend")}</Text>
              </Button>
          </>
        )}
            {working ? <StatusLine label={working} color={colors["muted-foreground"]} /> : null}
            {error ? (
              <Text accessibilityRole="alert" className="text-destructive text-sm">
                {error}
              </Text>
            ) : null}
      </Sheet>
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </>
  );
}

function StatusLine({ label, color }: { label: string; color: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center justify-center gap-2 py-1">
      <ActivityIndicator size="small" color={color} />
      <Text className="text-muted-foreground text-sm">{label}</Text>
    </View>
  );
}
