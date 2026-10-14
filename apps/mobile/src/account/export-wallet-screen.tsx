// Settings → Sign-in & security → Private key (cards/access.md) on the Senryo kit.
// - Privy (D41): the wallet is a private key, and Privy shows it only in its own secure window, never to Kawase. On the
//   web a deliberate hold opens that window here; on a phone the export opens on the web app (this same page), where
//   the person signs in with the same email and Privy's window shows the key.
// - Turnkey (the fallback build): the recovery phrase, after the device's own check, decrypted on this device and shown
//   with screenshots and screen recording blocked; leaving the page hides it.
// Kawase records that an export happened (never the phrase or the key). What the key can do is said first, in the
// three lines that matter, never as a wall of text.
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import { useFocusEffect, useRouter } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  Button,
  EmptyState,
  HoldButton,
  Icon,
  NUMERIC_VARIANT,
  Panel,
  RADIUS,
  SIZE,
  SPACE,
  TYPE,
  useTheme,
} from "@/components/kit";
import { diagnose } from "@/components/kit/diagnosis";
import { notify } from "@/components/toast/notify";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { Page } from "./kit-page";
import { useAccountMethods } from "./use-account-methods";
import type { PrivyAccountMethods } from "./use-account-methods-privy-core";

const CAPTURE_KEY = "export-wallet";

const isPrivyMethods = (methods: object): methods is PrivyAccountMethods => "exportKey" in methods;

/** What the key or phrase can do, in at most three short lines, under one warning mark. */
function Warning({ title, lines }: { title: string; lines: string[] }) {
  const { color } = useTheme();
  return (
    <Panel>
      <View style={styles.warning}>
        <View style={[styles.mark, { backgroundColor: color.destructiveWash }]}>
          <Icon icon={ShieldAlert} size={SIZE.icon} tint={color.destructive} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>
          {title}
        </Text>
        {lines.map((line) => (
          <Text key={line} style={[TYPE.body, { color: color.text2 }]}>
            {line}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

/** Nothing to export yet: the reason, and the one step that fixes it. */
function NoWallet() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const signIn = useSignIn();
  const guest = !user || user.isGuest;
  return (
    <EmptyState
      size="page"
      why={guest ? t("exportWallet.guestTitle") : t("exportWallet.noWalletTitle")}
      detail={guest ? t("exportWallet.guestDetail") : t("exportWallet.noWalletDetail")}
      action={
        guest
          ? { label: t("signIn.title"), onPress: signIn.open }
          : { label: t("exportWallet.setUpWallet"), onPress: () => router.push("/wallet") }
      }
    />
  );
}

/** Privy: the key is shown by Privy's own window (here on the web, or on the web app from a phone). */
function PrivyExport({ account }: { account: PrivyAccountMethods }) {
  const { t } = useT();
  const signer = useWalletSigner();
  const signIn = useSignIn();
  const { user } = useSession();
  const [busy, setBusy] = React.useState(false);
  const onWeb = account.walletExport === "privyWindow";

  const open = async () => {
    setBusy(true);
    try {
      await account.exportKey();
    } catch (error) {
      notify.error(diagnose(error).kind === "offline" ? t("errors.offlineAction") : t("exportWallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  const guest = !user || user.isGuest;
  if (guest)
    return (
      <Page title={t("exportWallet.keyTitle")}>
        <NoWallet />
      </Page>
    );
  // Signed in to Kawase, but Privy's session is not on this device: the key can't be reached until it is.
  if (!account.manageable) {
    return (
      <Page title={t("exportWallet.keyTitle")}>
        <EmptyState
          size="page"
          why={t("account.reconnectTitle")}
          detail={t("exportWallet.reconnectDetail")}
          action={{ label: t("signIn.title"), onPress: signIn.open }}
        />
      </Page>
    );
  }
  if (!signer)
    return (
      <Page title={t("exportWallet.keyTitle")}>
        <NoWallet />
      </Page>
    );
  return (
    <Page
      title={t("exportWallet.keyTitle")}
      footer={
        onWeb ? (
          <HoldButton
            label={t("exportWallet.holdToReveal")}
            holdingLabel={t("exportWallet.keepHolding")}
            ready
            busy={busy}
            onConfirm={() => void open()}
          />
        ) : (
          <Button label={t("wallet.exportKeyOpenWeb")} loading={busy} onPress={() => void open()} />
        )
      }
    >
      <Warning
        title={t("wallet.exportKeyTitle")}
        lines={[
          t("wallet.exportKeyWarning1"),
          t("wallet.exportKeyWarning2"),
          onWeb ? t("wallet.exportKeyWindow") : t("wallet.exportKeyOnWeb"),
        ]}
      />
    </Page>
  );
}

function PhraseExport({ exportPhrase }: { exportPhrase: () => Promise<string> }) {
  const { t } = useT();
  const { color } = useTheme();
  const signer = useWalletSigner();
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
      if (check === "unavailable") notify.error(t("send.approvalUnavailable"));
      return;
    }
    setBusy(true);
    try {
      setPhrase(await exportPhrase());
    } catch {
      notify.error(t("exportWallet.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!signer)
    return (
      <Page title={t("exportWallet.title")}>
        <NoWallet />
      </Page>
    );
  const words = phrase?.trim().split(/\s+/) ?? [];
  return (
    <Page
      title={t("exportWallet.title")}
      footer={
        phrase ? (
          <>
            <Button
              label={t("exportWallet.copy")}
              variant="secondary"
              onPress={() => void Clipboard.setStringAsync(phrase).then(() => notify.info(t("exportWallet.copied")))}
            />
            <Button label={t("exportWallet.hide")} variant="ghost" onPress={() => setPhrase(undefined)} />
          </>
        ) : (
          <HoldButton
            label={t("exportWallet.holdToRevealPhrase")}
            holdingLabel={t("exportWallet.keepHolding")}
            ready
            busy={busy}
            onConfirm={() => void reveal()}
          />
        )
      }
    >
      <Warning
        title={t("exportWallet.warningTitle")}
        lines={[t("exportWallet.warning1"), t("exportWallet.warning2"), t("exportWallet.warning3")]}
      />
      {phrase ? (
        <Panel>
          <View style={styles.words} accessibilityLabel={t("exportWallet.phrase")}>
            {words.map((word, index) => (
              <View key={`${index}-${word}`} style={[styles.word, { backgroundColor: color.raised2 }]}>
                <Text style={[TYPE.meta, styles.figure, { color: color.text3 }]}>{index + 1}</Text>
                <Text selectable style={[TYPE.rowStrong, { color: color.ink }]}>
                  {word}
                </Text>
              </View>
            ))}
          </View>
        </Panel>
      ) : null}
    </Page>
  );
}

export function ExportWalletScreen() {
  const account = useAccountMethods();
  return isPrivyMethods(account) ? (
    <PrivyExport account={account} />
  ) : (
    <PhraseExport exportPhrase={account.exportPhrase} />
  );
}

const styles = StyleSheet.create({
  warning: { padding: SPACE.lg, gap: SPACE.sm },
  mark: {
    width: SIZE.touch,
    height: SIZE.touch,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACE.xs,
  },
  words: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, padding: SPACE.lg },
  word: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACE.xs,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  figure: { fontVariant: NUMERIC_VARIANT },
});
