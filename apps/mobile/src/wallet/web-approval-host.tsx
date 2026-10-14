// Web: the owner's check before a signature that binds them (accepting the allowance, a send above the budget). Both
// hosts register one approver (web-approver.ts) that `confirmWithBiometrics` reaches on the web, and only "approved"
// signs; closing the sheet is "cancelled" (Codex review R03). Built on the Senryo kit's sheet.
// - Privy (D41, D38): the wallet's session lives in this browser and Privy has no code check outside a login, so the
//   check is the explicit confirm D38 keeps above the budget: what is being approved, then a slide (21st 29304).
// - Turnkey (the fallback build): a browser has no Face ID, so a fresh email code to the account's own address stands
//   in: Turnkey's enclave verifies it (`initOtp` + `verifyOtp`, which logs nothing in).
import { OtpType, useTurnkey } from "@turnkey/react-wallet-kit";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, SlideToConfirm, SPACE, TYPE, useTheme } from "@/components/kit";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { CodeField, CODE_LENGTH } from "@/account/fields";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

import type { BiometricResult } from "./biometric";
import { isDev, isPrivy, isWalletConfigured } from "./config";
import { PrivyOAuthReturn } from "./privy-oauth-return";
import { RootSheetLayer } from "./root-sheet-layer";
import { clearWebApprover, setWebApprover, type WebApprover } from "./web-approver";

type Pending = { prompt: string; resolve: (result: BiometricResult) => void };

/** Registers this host's approver while mounted; each request opens the sheet and waits for its answer. */
function usePendingApproval() {
  const [pending, setPending] = React.useState<Pending>();
  React.useEffect(() => {
    const approver: WebApprover = (prompt) =>
      new Promise<BiometricResult>((resolve) => setPending({ prompt, resolve }));
    setWebApprover(approver);
    return () => clearWebApprover(approver);
  }, []);
  // The answer is given once; the sheet then slides away and the pending request is dropped.
  const answered = React.useRef<BiometricResult | undefined>(undefined);
  const answer = (result: BiometricResult) => {
    if (answered.current) return;
    answered.current = result;
    pending?.resolve(result);
  };
  const closed = () => {
    if (!answered.current) pending?.resolve("cancelled");
    answered.current = undefined;
    setPending(undefined);
  };
  return { pending, answer, closed };
}

/** Privy: the explicit confirm (only "approved" signs). */
function PrivyHost() {
  const { t } = useT();
  const { pending, answer, closed } = usePendingApproval();
  if (!pending) return null;
  return (
    <RootSheetLayer>
      <Sheet onClose={closed} closeLabel={t("shell.kit.closeNamed", { name: t("wallet.approveTitle") })}>
        <SheetHeading title={t("wallet.approveTitle")} body={pending.prompt} />
        <PrivyActions prompt={pending.prompt} onAnswer={answer} />
      </Sheet>
    </RootSheetLayer>
  );
}

function PrivyActions({ prompt, onAnswer }: { prompt: string; onAnswer: (result: BiometricResult) => void }) {
  const { t } = useT();
  const close = useSheetClose();
  return (
    <View style={styles.actions}>
      <SlideToConfirm
        label={t("wallet.slideToApprove")}
        resetKey={prompt}
        onConfirm={() => {
          onAnswer("approved");
          close();
        }}
        onAccessibleActivate={() => {
          onAnswer("approved");
          close();
        }}
      />
      <Button
        label={t("common.cancel")}
        variant="ghost"
        onPress={() => {
          onAnswer("cancelled");
          close();
        }}
      />
    </View>
  );
}

/** Turnkey: a fresh code to the account's email, verified by Turnkey's enclave. */
function TurnkeyHost() {
  const { t } = useT();
  const { pending, answer, closed } = usePendingApproval();
  if (!pending) return null;
  return (
    <RootSheetLayer>
      <Sheet onClose={closed} closeLabel={t("shell.kit.closeNamed", { name: t("approval.title") })}>
        <TurnkeyCode prompt={pending.prompt} onAnswer={answer} />
      </Sheet>
    </RootSheetLayer>
  );
}

type Otp = { otpId: string; otpEncryptionTargetBundle: string };

function TurnkeyCode({ prompt, onAnswer }: { prompt: string; onAnswer: (result: BiometricResult) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const close = useSheetClose();
  const { user } = useSession();
  const { initOtp, verifyOtp } = useTurnkey();
  const [otp, setOtp] = React.useState<Otp>();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const email = user?.email ?? undefined;

  const finish = (result: BiometricResult) => {
    onAnswer(result);
    close();
  };

  const send = async () => {
    if (!email) return finish("unavailable");
    setBusy(true);
    setError(undefined);
    try {
      const sent = await initOtp({ otpType: OtpType.Email, contact: email });
      setOtp({ otpId: sent.otpId, otpEncryptionTargetBundle: sent.otpEncryptionTargetBundle });
    } catch {
      setError(t("errors.rateLimited"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!otp) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await verifyOtp({
        otpId: otp.otpId,
        otpCode: value.trim(),
        otpEncryptionTargetBundle: otp.otpEncryptionTargetBundle,
      });
      if (result.verificationToken) return finish("approved");
      setError(t("signIn.invalidCode"));
    } catch {
      setError(t("signIn.invalidCode"));
    }
    setCode("");
    setBusy(false);
  };

  return (
    <>
      <SheetHeading title={t("approval.title")} body={otp ? t("signIn.codeSent", { email: email ?? "" }) : prompt} />
      <View style={styles.actions}>
        {otp ? (
          <CodeField
            value={code}
            onChange={setCode}
            onFilled={(digits) => void verify(digits)}
            label={t("signIn.code")}
            invalid={Boolean(error)}
            disabled={busy}
          />
        ) : (
          <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>
            {t("approval.body", { email: email ?? "" })}
          </Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={[TYPE.rowDetail, styles.center, { color: color.destructive }]}>
            {error}
          </Text>
        ) : null}
        {otp ? (
          <Button
            label={t("approval.confirm")}
            loading={busy}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => void verify(code)}
          />
        ) : (
          <Button label={t("signIn.sendCode")} loading={busy} disabled={!email} onPress={() => void send()} />
        )}
        <Button label={t("common.cancel")} variant="ghost" onPress={() => finish("cancelled")} />
      </View>
    </>
  );
}

/**
 * Mounted once inside the session provider; without the provider's ids there is nothing to verify with. On Privy it
 * also hosts the Google/Apple return (privy-oauth-return.tsx), which needs the same sheet surface.
 */
/** Dev mode: the key is a throwaway testnet key on this machine, so an approval passes by itself (said in the console). */
function DevHost() {
  React.useEffect(() => {
    const approver: WebApprover = (promptMessage) => {
      console.info(`[dev] approved: ${promptMessage}`);
      return Promise.resolve<BiometricResult>("approved");
    };
    setWebApprover(approver);
    return () => clearWebApprover(approver);
  }, []);
  return null;
}

export function WebApprovalHost() {
  if (!isWalletConfigured) return null;
  if (isDev) return <DevHost />;
  if (!isPrivy) return <TurnkeyHost />;
  return (
    <>
      <PrivyHost />
      <PrivyOAuthReturn />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.md, paddingTop: SPACE.md },
  center: { textAlign: "center" },
});
