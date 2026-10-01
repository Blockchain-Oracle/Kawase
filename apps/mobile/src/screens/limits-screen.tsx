// Wallet & limits (journey 12; N1–N5, S10, S11): what Kawase is allowed to do with this wallet on the active
// network, in the authority receipt's plain words, and the switch that takes it away. Turning the allowance off is
// an on-chain revoke the person signs — irreversible from here, so it is hold-to-confirm; turning it back on goes
// through the same Face ID step as setup. The receipt is decoded from the signed grant, never from a draft. The
// rest of journey 12 (pause all, the risk dial, practice mode, the exit kit's sweep) lands with the executor and
// the agent that obey them (Stages 4/5), so those rows are not shown before they do anything.
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, Copy } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { arcIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { AuthorityReceipt } from "@kawase/ui-native/components/authority-receipt";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { HoldToConfirm } from "@kawase/ui-native/components/hold-to-confirm";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { authorityText } from "@/wallet/authority";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ROW_MARK = 32;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const ART_WIDTH = 140;

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

export function LimitsScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const { wallet, refresh } = useWalletStatus();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [revoking, setRevoking] = React.useState(false);
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const state = wallet?.networks[network];
  const ids = arcIdentity(network);
  const networkName = testnet ? t("network.arcTestnet") : t("network.arc");

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const revoke = async () => {
    if (!signer) return;
    setRevoking(true);
    try {
      const request = await api.wallet.revokeRequest(network);
      const signed = await signer.signTransaction(toSerializable(request.transaction));
      await api.wallet.submitTransaction(request.requestId, signed);
      await refresh();
      toast(t("limits.revoked"));
    } catch {
      toast(t("setup.failed"));
    } finally {
      setRevoking(false);
    }
  };

  const copy = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    toast(t("home.addressCopied"));
  };

  const authority = state?.allowance ? authorityText(state.allowance.receipt, network, t, locale) : undefined;

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground text-2xl font-bold">{t("limits.title")}</Text>
      </View>

      {status !== "account" || !wallet?.address ? (
        <EmptyState
          art={<Koban width={ART_WIDTH} />}
          title={status === "account" ? t("receive.setUpFirst") : t("receive.noWallet")}
          body={status === "account" ? t("receive.setUpFirstBody") : t("receive.noWalletBody")}
          action={
            <Button onPress={() => router.push("/wallet")}>
              <Text>{t("wallet.setUp")}</Text>
            </Button>
          }
        />
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET }}>
          <ListGroup>
            <ListRow
              leading={<Mark entity={ids.chain} size={ROW_MARK} />}
              title={networkName}
              subtitle={state?.setUp ? t("limits.setUp") : t("limits.notSetUp")}
              trailing={
                <View className="flex-row items-center gap-1.5">
                  <Amount className="text-muted-foreground text-sm">{shortAddress(wallet.address)}</Amount>
                  <Icon as={Copy} className="text-muted-foreground size-4" />
                </View>
              }
              accessibilityLabel={t("home.copyAddress")}
              onPress={() => void copy()}
            />
          </ListGroup>

          <View className="gap-3">
            <Text className={cn("text-muted-foreground px-1 text-xs font-semibold uppercase", TEXT_START)}>{t("wallet.allowanceTitle")}</Text>
            {authority ? (
              <>
                <AuthorityReceipt {...authority} />
                <HoldToConfirm onConfirm={() => void revoke()} confirmLabel={t("limits.revoking")} disabled={revoking || !signer} resetAfter={0}>
                  {t("limits.holdToRevoke")}
                </HoldToConfirm>
                <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("limits.revokeNote")}</Text>
              </>
            ) : (
              <View className="bg-card border-border gap-3 rounded-3xl border p-5">
                <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{state?.setUp ? t("limits.offBody") : t("limits.notSetUpBody")}</Text>
                <Button onPress={() => router.push("/wallet")}>
                  <Text>{state?.setUp ? t("limits.turnOn") : t("wallet.setUp")}</Text>
                </Button>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
