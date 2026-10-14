// Settings → Account → Export wallet (cards/access.md).
// - Turnkey: what the phrase is and what it can do, Face ID, then the recovery phrase decrypted on this device by
//   Turnkey and shown with screenshots and screen recording blocked. Copy is offered with a warning; leaving the page
//   hides it.
// - Privy (D41): the wallet is a private key, and Privy shows it only in its own secure window, never to Kawase. On the
//   web that window opens here; on a phone the export opens on the web app (the same page), where the person signs in
//   with the same email and Privy's window shows the key.
// Kawase records that an export happened (never the phrase or the key).
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import { useFocusEffect } from "expo-router";
import { Copy, ExternalLink, Eye, KeyRound, ShieldAlert } from "lucide-react-native";
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
import type { PrivyAccountMethods } from "@/account/use-account-methods-privy-core";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const CAPTURE_KEY = "export-wallet";

const isPrivyMethods = (methods: object): methods is PrivyAccountMethods => "exportKey" in methods;

function Warning({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-4">
      <View className="flex-row items-start gap-3">
        <Icon as={ShieldAlert} className="text-destructive mt-0.5 size-5" />
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{title}</Text>
      </View>
      {lines.map((line) => (
        <Text key={line} className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{`• ${line}`}</Text>
      ))}
    </View>
  );
}

/** Privy: the key is shown by Privy's own window (here on the web, or on the web app from a phone). */
function PrivyExport({ account }: { account: PrivyAccountMethods }) {
  const { t } = useT();
  const signer = useWalletSigner();
  const { user } = useSession();
  const signIn = useSignIn();
  const [busy, setBusy] = React.useState(false);
  const onWeb = account.walletExport === "privyWindow";
  // A phone sends the person here to sign in with the same email; a guest gets the sign-in sheet right on this page.
  const guest = !user || user.isGuest;

  const open = async () => {
    setBusy(true);
    try {
      await account.exportKey();
    } catch {
      toast(t("exportWallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("exportWallet.title")}>
      <Warning
        title={t("wallet.exportKeyTitle")}
        lines={[t("wallet.exportKeyWarning1"), t("wallet.exportKeyWarning2"), onWeb ? t("wallet.exportKeyWindow") : t("wallet.exportKeyOnWeb")]}
      />
      {signer ? (
        <Button disabled={busy} onPress={() => void open()}>
          <Icon as={onWeb ? KeyRound : ExternalLink} className="text-primary-foreground size-4" />
          <Text>{busy ? t("common.loading") : onWeb ? t("wallet.exportKeyReveal") : t("wallet.exportKeyOpenWeb")}</Text>
        </Button>
      ) : (
        <>
          {/* No wallet on this session yet: say why; a guest can sign in from here. */}
          <Text className={cn("text-muted-foreground bg-muted rounded-2xl px-4 py-3 text-sm", TEXT_START)}>{t("wallet.noWallet")}</Text>
          {guest ? (
            <Button onPress={signIn.open}>
              <Text>{t("signIn.title")}</Text>
            </Button>
          ) : null}
        </>
      )}
    </Page>
  );
}

function PhraseExport({ exportPhrase }: { exportPhrase: () => Promise<string> }) {
  const { t } = useT();
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
      setPhrase(await exportPhrase());
    } catch {
      toast(t("exportWallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  const words = phrase?.trim().split(/\s+/) ?? [];
  return (
    <Page title={t("exportWallet.title")}>
      <Warning title={t("exportWallet.warningTitle")} lines={[t("exportWallet.warning1"), t("exportWallet.warning2"), t("exportWallet.warning3")]} />
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

export function ExportWalletScreen() {
  const account = useAccountMethods();
  return isPrivyMethods(account) ? <PrivyExport account={account} /> : <PhraseExport exportPhrase={account.exportPhrase} />;
}
