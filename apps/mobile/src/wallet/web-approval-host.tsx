// Web: the owner's check before a signature that binds them (accepting the allowance, a send above it). A browser has
// no Face ID, so a fresh email code to the account's own address stands in: Turnkey's enclave verifies it (`initOtp`
// + `verifyOtp`, which returns a verification token and logs nothing in), and only a verified code resolves
// "approved". Closing the sheet is "cancelled"; nothing is signed either way until then (Codex review R03).
// With Privy (D41) the wallet's session lives in this browser and Privy has no code check outside a login, so the
// sheet is the explicit confirm D38 keeps above the budget: what is being approved, then Confirm or Cancel.
import { OtpType, useTurnkey } from "@turnkey/react-wallet-kit";
import * as React from "react";
import { View } from "react-native";

import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import type { BiometricResult } from "./biometric";
import { isPrivy, isWalletConfigured } from "./config";
import { clearWebApprover, setWebApprover, type WebApprover } from "./web-approver";

const CODE_LENGTH = 6;

type Pending = { prompt: string; resolve: (result: BiometricResult) => void };
type Otp = { otpId: string; otpEncryptionTargetBundle: string };

function ConfiguredHost() {
  const { t } = useT();
  const colors = useThemeColors();
  const { user } = useSession();
  const { initOtp, verifyOtp } = useTurnkey();
  const [pending, setPending] = React.useState<Pending>();
  const [otp, setOtp] = React.useState<Otp>();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const email = user?.email ?? undefined;

  // Registered while mounted; each request opens the sheet and waits for its answer.
  React.useEffect(() => {
    const approver: WebApprover = (prompt) =>
      new Promise<BiometricResult>((resolve) => {
        setOtp(undefined);
        setCode("");
        setError(undefined);
        setPending({ prompt, resolve });
      });
    setWebApprover(approver);
    return () => clearWebApprover(approver);
  }, []);

  const finish = (result: BiometricResult) => {
    pending?.resolve(result);
    setPending(undefined);
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
      const result = await verifyOtp({ otpId: otp.otpId, otpCode: value.trim(), otpEncryptionTargetBundle: otp.otpEncryptionTargetBundle });
      if (result.verificationToken) finish("approved");
      else setError(t("signIn.invalidCode"));
    } catch {
      setError(t("signIn.invalidCode"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={Boolean(pending)}
      onClose={() => finish("cancelled")}
      title={t("approval.title")}
      subtitle={pending?.prompt}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
    >
      <View className="gap-4">
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>
          {otp ? t("signIn.codeSent", { email: email ?? "" }) : t("approval.body", { email: email ?? "" })}
        </Text>
        {otp ? (
          <SheetInput
            value={code}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(digits);
              if (digits.length === CODE_LENGTH) void verify(digits);
            }}
            placeholder={t("signIn.code")}
            accessibilityLabel={t("signIn.code")}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            autoFocus
            maxLength={CODE_LENGTH}
            className="text-center font-mono text-xl tracking-widest"
          />
        ) : null}
        {error ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{error}</Text> : null}
        {otp ? (
          <Button size="lg" disabled={busy || code.length !== CODE_LENGTH} onPress={() => void verify(code)}>
            <Text>{t("approval.confirm")}</Text>
          </Button>
        ) : (
          <Button size="lg" disabled={busy || !email} onPress={() => void send()}>
            <Text>{busy ? t("common.loading") : t("signIn.sendCode")}</Text>
          </Button>
        )}
        <Button variant="ghost" onPress={() => finish("cancelled")}>
          <Text className="text-muted-foreground">{t("common.cancel")}</Text>
        </Button>
      </View>
    </Sheet>
  );
}

/** Privy: the explicit confirm, registered the same way (only "approved" signs). */
function PrivyHost() {
  const { t } = useT();
  const colors = useThemeColors();
  const [pending, setPending] = React.useState<Pending>();

  React.useEffect(() => {
    const approver: WebApprover = (prompt) => new Promise<BiometricResult>((resolve) => setPending({ prompt, resolve }));
    setWebApprover(approver);
    return () => clearWebApprover(approver);
  }, []);

  const finish = (result: BiometricResult) => {
    pending?.resolve(result);
    setPending(undefined);
  };

  return (
    <Sheet
      open={Boolean(pending)}
      onClose={() => finish("cancelled")}
      title={t("approval.title")}
      subtitle={pending?.prompt}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
    >
      <View className="gap-4">
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("wallet.confirmInBrowser")}</Text>
        <Button size="lg" onPress={() => finish("approved")}>
          <Text>{t("approval.confirm")}</Text>
        </Button>
        <Button variant="ghost" onPress={() => finish("cancelled")}>
          <Text className="text-muted-foreground">{t("common.cancel")}</Text>
        </Button>
      </View>
    </Sheet>
  );
}

/** Mounted once inside the sheet and session providers; without the provider's ids there is nothing to verify with. */
export function WebApprovalHost() {
  if (!isWalletConfigured) return null;
  return isPrivy ? <PrivyHost /> : <ConfiguredHost />;
}
