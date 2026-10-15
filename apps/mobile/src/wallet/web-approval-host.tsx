// Web: the owner's check before a signature that binds them (accepting the allowance, a send or a swap above it). A
// browser has no Face ID, so a six-digit code emailed to the account's verified address stands in (the buttons say
// "…with an email code"): Kawase's api sends and checks it (account/approval-codes.ts), and only "approved" signs;
// closing the sheet is "cancelled" (Codex review R03). The host registers the one approver (web-approver.ts) that
// `confirmWithBiometrics` reaches on the web. Built on the Senryo kit's sheet. It also hosts Privy's Google/Apple
// return (privy-oauth-return.tsx), which needs the same sheet surface.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "@kawase/api-client";

import { CodeField, CODE_LENGTH } from "@/account/fields";
import { Button, ShimmerText, SPACE, TYPE, useTheme } from "@/components/kit";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import type { BiometricResult } from "./biometric";
import { isDev, isWalletConfigured } from "./config";
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

function EmailCodeHost() {
  const { t } = useT();
  const { pending, answer, closed } = usePendingApproval();
  if (!pending) return null;
  return (
    <RootSheetLayer>
      <Sheet onClose={closed} closeLabel={t("shell.kit.closeNamed", { name: t("approval.title") })}>
        <EmailCode prompt={pending.prompt} onAnswer={answer} />
      </Sheet>
    </RootSheetLayer>
  );
}

type Sent = { sentTo: string };

/** The code goes out as the sheet opens (the button already said "with an email code"); typing six digits checks it. */
function EmailCode({ prompt, onAnswer }: { prompt: string; onAnswer: (result: BiometricResult) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const close = useSheetClose();
  const [sent, setSent] = React.useState<Sent>();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const finish = (result: BiometricResult) => {
    onAnswer(result);
    close();
  };

  const send = React.useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setCode("");
    try {
      setSent(await api.account.sendApprovalCode());
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === "rate_limited" ? t("errors.rateLimited") : t("approval.sendFailed"));
    } finally {
      setBusy(false);
    }
  }, [t]);
  React.useEffect(() => {
    void send();
  }, [send]);

  const verify = async (value: string) => {
    if (!sent) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.account.verifyApprovalCode(value.trim());
      return finish("approved");
    } catch {
      setError(t("signIn.invalidCode"));
    }
    setCode("");
    setBusy(false);
  };

  return (
    <>
      <SheetHeading title={t("approval.title")} body={prompt} />
      <View style={styles.actions}>
        {sent ? (
          <Text style={[TYPE.rowDetail, styles.center, { color: color.text2 }]}>{t("signIn.codeSent", { email: sent.sentTo })}</Text>
        ) : !error ? (
          <ShimmerText style={[TYPE.rowDetail, styles.center, { color: color.text2 }]}>{t("approval.sending")}</ShimmerText>
        ) : null}
        <CodeField
          value={code}
          onChange={setCode}
          onFilled={(digits) => void verify(digits)}
          label={t("signIn.code")}
          invalid={Boolean(error)}
          disabled={busy || !sent}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[TYPE.rowDetail, styles.center, { color: color.destructive }]}>
            {error}
          </Text>
        ) : null}
        <Button
          label={t("approval.confirm")}
          loading={busy}
          disabled={!sent || code.length !== CODE_LENGTH}
          onPress={() => void verify(code)}
        />
        <Button label={t("signIn.resend")} variant="ghost" disabled={busy} onPress={() => void send()} />
        <Button label={t("common.cancel")} variant="ghost" onPress={() => finish("cancelled")} />
      </View>
    </>
  );
}

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

/** Mounted once inside the session provider; without the Privy ids there is nothing to approve with. */
export function WebApprovalHost() {
  if (!isWalletConfigured) return null;
  if (isDev) return <DevHost />;
  return (
    <>
      <EmailCodeHost />
      <PrivyOAuthReturn />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.md, paddingTop: SPACE.md },
  center: { textAlign: "center" },
});
