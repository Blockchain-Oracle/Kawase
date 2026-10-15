// Settings → Sign-in & security → Private key (cards/access.md) on the Senryo kit. The wallet is a Privy private key
// (D41), and Privy shows it only in its own secure window, never to Kawase: on the web a deliberate hold opens that
// window here; on a phone the export opens on the web app (this same page), where the person signs in with the same
// email and Privy's window shows the key. Kawase records that an export happened (never the key). What the key can do is said first, in the
// three lines that matter, never as a wall of text.
import { useRouter } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  EmptyState,
  HoldButton,
  Icon,
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
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { Page } from "./kit-page";
import type { AccountMethods } from "./account-methods";
import { useAccountMethods } from "./use-account-methods";

/** What the key can do, in at most three short lines, under one warning mark. */
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

/** The key is shown by Privy's own window (here on the web, or on the web app from a phone). */
function KeyExport({ account }: { account: AccountMethods }) {
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

export function ExportWalletScreen() {
  return <KeyExport account={useAccountMethods()} />;
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
});
