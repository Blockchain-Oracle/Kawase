// Settings → Account → Export wallet (cards/access.md): what the phrase is and what it can do, Face ID, then the
// recovery phrase decrypted on this device by Turnkey and shown with screenshots and screen recording blocked. Copy is
// offered with a warning; leaving the page hides it. Kawase records that an export happened (never the phrase).
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import { useFocusEffect } from "expo-router";
import { Copy, Eye, ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { Platform, View } from "react-native";
import { toast } from "sonner-native";

import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useAccountMethods } from "@/account/use-account-methods";
import { useT } from "@/i18n";
import { confirmWithBiometrics } from "@/wallet/biometric";

const CAPTURE_KEY = "export-wallet";

export function ExportWalletScreen() {
  const { t } = useT();
  const account = useAccountMethods();
  const [phrase, setPhrase] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);

  // While the phrase is on screen nothing may capture it; it is gone when the page loses focus.
  React.useEffect(() => {
    if (!phrase || Platform.OS === "web") return undefined;
    void ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    };
  }, [phrase]);
  useFocusEffect(
    React.useCallback(
      () => () => {
        setPhrase(undefined);
      },
      [],
    ),
  );

  const reveal = async () => {
    const check = await confirmWithBiometrics(t("exportWallet.prompt"), t("common.cancel"));
    if (check !== "approved") {
      toast(check === "unavailable" ? t("send.approvalUnavailable") : t("send.faceIdCancelled"));
      return;
    }
    setBusy(true);
    try {
      setPhrase(await account.exportPhrase());
    } catch {
      toast(t("exportWallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  const words = phrase?.trim().split(/\s+/) ?? [];
  return (
    <Page title={t("exportWallet.title")}>
      <View className="bg-card border-border gap-3 rounded-3xl border p-4">
        <View className="flex-row items-start gap-3">
          <Icon as={ShieldAlert} className="text-destructive mt-0.5 size-5" />
          <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{t("exportWallet.warningTitle")}</Text>
        </View>
        {[t("exportWallet.warning1"), t("exportWallet.warning2"), t("exportWallet.warning3")].map((line) => (
          <Text key={line} className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{`• ${line}`}</Text>
        ))}
      </View>
      {!phrase ? (
        <Button disabled={busy} onPress={() => void reveal()}>
          <Icon as={Eye} className="text-primary-foreground size-4" />
          <Text>{busy ? t("common.loading") : t("exportWallet.reveal")}</Text>
        </Button>
      ) : (
        <Section title={t("exportWallet.phrase")}>
          <View className="bg-card border-border flex-row flex-wrap gap-2 rounded-3xl border p-4">
            {words.map((word, index) => (
              <View key={`${index}-${word}`} className="bg-muted flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5">
                <Amount className="text-muted-foreground text-xs">{index + 1}</Amount>
                <Amount className="text-foreground text-sm font-semibold">{word}</Amount>
              </View>
            ))}
          </View>
          <Button
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(phrase).then(() => toast(t("exportWallet.copied")));
            }}
          >
            <Icon as={Copy} className="size-4" />
            <Text>{t("exportWallet.copy")}</Text>
          </Button>
          <Button variant="ghost" onPress={() => setPhrase(undefined)}>
            <Text className="text-muted-foreground">{t("exportWallet.hide")}</Text>
          </Button>
        </Section>
      )}
    </Page>
  );
}
