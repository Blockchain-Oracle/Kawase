// The wallet on each network: the relayed setup, the daily allowance (one Face ID once passkeys exist),
// the balance, and the network switch with the one-time real-money sheet.
import { useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TransactionSerializable, TypedDataDefinition } from "viem";

import type { NetworkId, UnsignedTransaction, WalletNetworkStatus } from "@kawase/api-client";
import { amount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { NetworkChip } from "@kawase/ui-native/components/network-chip";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Card } from "@kawase/ui-native/components/ui/card";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const EDGE_INSET = 24;
const MAINNET_CONSENT_VERSION = "1";
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

function toSerializable(transaction: UnsignedTransaction): TransactionSerializable {
  return {
    type: "eip1559",
    chainId: transaction.chainId,
    nonce: transaction.nonce,
    to: transaction.to,
    data: transaction.data,
    value: BigInt(transaction.value),
    gas: BigInt(transaction.gas),
    maxFeePerGas: BigInt(transaction.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
  };
}

export function WalletScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user, availableNetworks, setNetwork } = useSession();
  const { wallet, refresh } = useWalletStatus();
  const turnkey = useTurnkeyAccount();
  // Passkeys need a real domain; until then the allowance is signed by the session key.
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [busy, setBusy] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [consentNeeded, setConsentNeeded] = React.useState(false);

  const network: NetworkId = user?.activeNetwork ?? "testnet";
  const state: WalletNetworkStatus | undefined = wallet?.networks[network];
  const networkName = network === "testnet" ? t("network.testnet") : t("network.mainnet");
  const format = (baseUnits: string) => formatAmount(amount("USDC", BigInt(baseUnits)), locale);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(undefined);
    try {
      await action();
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("common.error"));
    } finally {
      setBusy(undefined);
    }
  };

  const createWallet = () => run("create", async () => void (await turnkey.ensureWallet()));

  const setUp = () =>
    run("setup", async () => {
      if (!signer) throw new Error(t("common.error"));
      const request = await api.wallet.setupRequest(network);
      if (request.alreadySetUp) return;
      const signed = await signer.signAuthorization(request.authorization);
      await api.wallet.setupSubmit(network, { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity ?? 0 });
    });

  const acceptAllowance = () =>
    run("allowance", async () => {
      if (!signer) throw new Error(t("common.error"));
      const request = await api.wallet.allowanceRequest(network);
      const signature = await signer.signTypedData(request.typedData as unknown as TypedDataDefinition);
      await api.wallet.allowanceSubmit(request.grantId, signature);
    });

  const revokeAllowance = () =>
    run("revoke", async () => {
      if (!signer) throw new Error(t("common.error"));
      const request = await api.wallet.revokeRequest(network);
      const signed = await signer.signTransaction(toSerializable(request.transaction));
      await api.wallet.submitTransaction(request.requestId, signed);
    });

  const switchNetwork = (next: NetworkId) =>
    run("network", async () => {
      if (next === "mainnet") {
        const { consents } = await api.me.consents();
        if (!consents.some((consent) => consent.kind === "mainnet_real_money" && consent.version === MAINNET_CONSENT_VERSION)) {
          setConsentNeeded(true);
          return;
        }
      }
      await setNetwork(next);
    });

  const acceptMainnet = () =>
    run("consent", async () => {
      await api.me.consent({ kind: "mainnet_real_money", version: MAINNET_CONSENT_VERSION, locale });
      setConsentNeeded(false);
      await setNetwork("mainnet");
    });

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-5 px-5"
      contentContainerStyle={{ paddingTop: insets.top + EDGE_INSET, paddingBottom: insets.bottom + EDGE_INSET }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-display text-[32px] font-semibold leading-10">{t("wallet.title")}</Text>
        <NetworkChip label={network === "testnet" ? t("network.arcTestnet") : t("network.arc")} />
      </View>

      {availableNetworks.length > 1 ? (
        <SegmentedControl
          label={t("settings.network")}
          value={network}
          onValueChange={(value) => void switchNetwork(value as NetworkId)}
          options={availableNetworks.map((id) => ({ value: id, label: id === "testnet" ? t("network.testnet") : t("network.mainnet") }))}
        />
      ) : null}

      {consentNeeded ? (
        <Card className="gap-3 p-5">
          <Text className="font-display text-xl font-semibold">{t("wallet.mainnetConsentTitle")}</Text>
          <Text className="text-muted-foreground text-sm">{t("wallet.mainnetConsentBody")}</Text>
          <Button className="bg-network active:bg-network/90 h-12" disabled={busy !== undefined} onPress={() => void acceptMainnet()}>
            <Text className="text-network-foreground font-semibold">{t("wallet.mainnetConsentAccept")}</Text>
          </Button>
          <Button variant="ghost" className="h-11" onPress={() => setConsentNeeded(false)}>
            <Text className="text-muted-foreground">{t("common.cancel")}</Text>
          </Button>
        </Card>
      ) : null}

      {status !== "account" ? (
        <Card className="gap-3 p-5">
          <Text className="text-muted-foreground text-sm">{t("wallet.noWallet")}</Text>
          <Button className="h-12" onPress={() => router.push("/sign-in")}>
            <Text className="font-semibold">{t("signIn.title")}</Text>
          </Button>
        </Card>
      ) : !wallet?.address ? (
        <Card className="gap-3 p-5">
          <Text className="text-muted-foreground text-sm">{busy === "create" ? t("wallet.creating") : t("wallet.noWallet")}</Text>
          <Button className="h-12" disabled={busy !== undefined} onPress={() => void createWallet()}>
            <Text className="font-semibold">{t("common.continue")}</Text>
          </Button>
        </Card>
      ) : (
        <>
          <Card className="gap-2 p-5">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{t("wallet.balance")}</Text>
            <Amount className="text-3xl font-semibold">{state ? format(state.usdcBalance) : "—"}</Amount>
            {network === "testnet" ? <Text className="text-muted-foreground text-xs">{t("wallet.testnetMoney")}</Text> : null}
            <View className="flex-row items-center justify-between pt-2">
              <Text className="text-muted-foreground text-sm">{t("wallet.address")}</Text>
              <Amount className="text-sm">{shortAddress(wallet.address)}</Amount>
            </View>
          </Card>

          {!state?.setUp ? (
            <Card className="gap-3 p-5">
              <Text className="font-display text-xl font-semibold">{t("wallet.setupNeeded", { network: networkName })}</Text>
              <Text className="text-muted-foreground text-sm">{busy === "setup" ? t("wallet.settingUp", { network: networkName }) : t("wallet.ready")}</Text>
              <Button className="bg-network active:bg-network/90 h-12" disabled={busy !== undefined} onPress={() => void setUp()}>
                <Text className="text-network-foreground font-semibold">{t("wallet.setUp")}</Text>
              </Button>
            </Card>
          ) : (
            <Card className="gap-3 p-5">
              <Text className="font-display text-xl font-semibold">{t("wallet.allowanceTitle")}</Text>
              {state.allowance ? (
                <>
                  <Text className="text-success text-sm font-medium">
                    {t("wallet.allowanceActive", { amount: format(state.allowance.receipt.amountPerPeriod ?? "0") })}
                  </Text>
                  <Button variant="secondary" className="h-12" disabled={busy !== undefined} onPress={() => void revokeAllowance()}>
                    <Text>{t("wallet.allowanceRevoke")}</Text>
                  </Button>
                </>
              ) : (
                <>
                  <Text className="text-muted-foreground text-sm">{t("wallet.allowanceOff")}</Text>
                  <Button className="bg-network active:bg-network/90 h-12" disabled={busy !== undefined} onPress={() => void acceptAllowance()}>
                    <Text className="text-network-foreground font-semibold">{PASSKEY_RP_ID ? t("wallet.allowanceAcceptFaceId") : t("wallet.allowanceAccept")}</Text>
                  </Button>
                </>
              )}
            </Card>
          )}
        </>
      )}

      {busy ? <Text className="text-muted-foreground text-sm">{t("common.loading")}</Text> : null}
      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

      <Button variant="ghost" className="h-11" onPress={() => router.back()}>
        <Text className="text-muted-foreground">{t("common.back")}</Text>
      </Button>
    </ScrollView>
  );
}
