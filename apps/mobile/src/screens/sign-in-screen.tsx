// Sign in with an email code through Turnkey; the api then knows the same account (spike 16's decision).
import { useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";

const EDGE_INSET = 24;
const CODE_LENGTH = 6;

type Step = { name: "email" } | { name: "code"; email: string; otpId: string; otpEncryptionTargetBundle: string };

export function SignInScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const turnkey = useTurnkeyAccount();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<Step>({ name: "email" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const run = async (action: () => Promise<void>, failure = t("common.error")) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 px-6"
      contentContainerStyle={{ paddingTop: insets.top + EDGE_INSET, paddingBottom: insets.bottom + EDGE_INSET }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="font-display text-[32px] font-semibold leading-10">{t("signIn.title")}</Text>
      <Text className="text-muted-foreground text-base">{t("signIn.subtitle")}</Text>

      {!turnkey.available ? <Text className="text-muted-foreground text-sm">{t("home.comingSoon")}</Text> : null}

      {turnkey.signedIn && turnkey.email ? (
        <Button
          variant="secondary"
          className="h-14"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await turnkey.linkSession();
              await turnkey.ensureWallet();
              router.replace("/wallet");
            })
          }
        >
          <Text className="text-base font-semibold">{t("signIn.continueAs", { email: turnkey.email })}</Text>
        </Button>
      ) : null}

      {step.name === "email" ? (
        <View className="gap-3 pt-4">
          <Text className="text-sm font-medium">{t("signIn.email")}</Text>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder={t("signIn.emailPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            className="h-14 text-base"
          />
          <Button
            className="h-14"
            disabled={busy || !turnkey.available || !email.includes("@")}
            onPress={() =>
              void run(async () => {
                const sent = await turnkey.sendCode(email);
                setStep({ name: "code", email, ...sent });
              })
            }
          >
            <Text className="text-base font-semibold">{t("signIn.sendCode")}</Text>
          </Button>
        </View>
      ) : (
        <View className="gap-3 pt-4">
          <Text className="text-muted-foreground text-sm">{t("signIn.codeSent", { email: step.email })}</Text>
          <Input value={code} onChangeText={setCode} placeholder={t("signIn.code")} keyboardType="number-pad" textContentType="oneTimeCode" className="h-14 text-base" />
          <Button
            className="h-14"
            disabled={busy || code.trim().length !== CODE_LENGTH}
            onPress={() =>
              void run(async () => {
                await turnkey.verifyCode({ email: step.email, code, otpId: step.otpId, otpEncryptionTargetBundle: step.otpEncryptionTargetBundle });
                await turnkey.ensureWallet();
                router.replace("/wallet");
              }, t("signIn.invalidCode"))
            }
          >
            <Text className="text-base font-semibold">{t("signIn.verify")}</Text>
          </Button>
          <Button variant="ghost" className="h-11" disabled={busy} onPress={() => setStep({ name: "email" })}>
            <Text className="text-muted-foreground">{t("common.back")}</Text>
          </Button>
        </View>
      )}

      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
      <Button variant="ghost" className="h-11" onPress={() => router.back()}>
        <Text className="text-muted-foreground">{t("common.cancel")}</Text>
      </Button>
    </ScrollView>
  );
}
