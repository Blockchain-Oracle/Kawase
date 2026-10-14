// Settings → Account → Delete account (cards/access.md, X16), in order:
//  1. what the account still holds, per asset and network (and the agent wallet);
//  2. revoke the grants still on, per network (one Face ID each) — done while the wallet still has USDC for the fee;
//  3. take the money out (send it, or export the wallet: the wallet stays the person's either way);
//  4. type the @handle;
//  5. delete: the agent wallet's money goes back to the wallet first, then everything Kawase keeps about the person is
//     deleted and the @handle is held for 30 days.
import { useFocusEffect, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { AccountHoldings, NetworkId } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page } from "@/account/page";
import { useLeave } from "@/account/use-leave";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { sayIfRefused } from "@/wallet/refused";
import { signRevoke, submitRevoke } from "@/wallet/sign-revoke";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { sayIfProofNeeded } from "@/session/device-proof";

const MARK_SIZE = 24;
const SKELETON_HEIGHT = 140;
const ZERO = BigInt(0);

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-4">
      <View className="flex-row items-center gap-3">
        <View className={cn("size-7 items-center justify-center rounded-full", done ? "bg-success" : "bg-muted")}>
          {done ? <Icon as={Check} className="text-background size-4" /> : <Text className="text-foreground text-sm font-semibold">{n}</Text>}
        </View>
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function DeleteAccountScreen() {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const { user } = useSession();
  const leave = useLeave();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [holdings, setHoldings] = React.useState<AccountHoldings>();
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState<string>();

  const load = React.useCallback(async () => {
    try {
      setHoldings(await api.account.holdings());
    } catch {
      toast(t("common.error"));
    }
  }, [t]);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const networkName = (network: NetworkId) => (network === "testnet" ? t("network.arcTestnet") : t("network.arc"));
  const money = (asset: "USDC" | "EURC", baseUnits: string) => formatAmount(amount(asset, BigInt(baseUnits)), locale);
  const expected = user?.handle ? `@${user.handle}` : (user?.email ?? "");
  const grantsLeft = holdings?.networks.some((entry) => entry.activeGrants.length > 0) ?? false;
  const held = holdings?.networks.some((entry) => BigInt(entry.balances.USDC) > ZERO || BigInt(entry.balances.EURC) > ZERO || BigInt(entry.agentWallet) > ZERO) ?? false;

  const revoke = async (network: NetworkId) => {
    if (!signer) {
      toast(t("send.approvalUnavailable"));
      return;
    }
    const check = await confirmWithBiometrics(t("deleteAccount.revokePrompt"), t("common.cancel"));
    if (check !== "approved") return;
    setBusy(network);
    try {
      const { revoke: request } = await api.account.revokeAllRequest(network);
      if (request) {
        const result = await submitRevoke(request, await signRevoke(signer, request));
        toast(result.status === "confirmed" ? t("deleteAccount.revoked") : t("deleteAccount.revokeFailed"));
      }
      await load();
    } catch (error) {
      if (!sayIfRefused(error, t)) toast(t("deleteAccount.revokeFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.account.deleteAccount(confirm);
      toast(t("deleteAccount.done"));
      await leave();
    } catch (error) {
      if (!sayIfProofNeeded(error, t)) toast(t("deleteAccount.failed"));
      setBusy(undefined);
    }
  };

  return (
    <Page title={t("deleteAccount.title")}>
      <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("deleteAccount.body")}</Text>
      {!holdings ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : (
        <>
          <Step n={1} title={t("deleteAccount.holdings")} done={!held}>
            {holdings.networks.map((entry) => {
              const ids = arcIdentity(entry.network);
              return (
                <View key={entry.network} className="gap-2">
                  <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{networkName(entry.network)}</Text>
                  {(["USDC", "EURC"] as const).map((asset) => (
                    <View key={asset} className="flex-row items-center gap-3">
                      <Mark entity={asset === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={MARK_SIZE} />
                      <Text className="text-foreground flex-1 text-sm">{asset}</Text>
                      <Amount className="text-foreground text-sm">{money(asset, entry.balances[asset])}</Amount>
                    </View>
                  ))}
                  {BigInt(entry.agentWallet) > ZERO ? (
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("deleteAccount.agentWallet", { amount: money("USDC", entry.agentWallet) })}</Text>
                  ) : null}
                </View>
              );
            })}
          </Step>

          <Step n={2} title={t("deleteAccount.revoke")} done={!grantsLeft}>
            {holdings.networks.filter((entry) => entry.activeGrants.length > 0).length === 0 ? (
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("deleteAccount.noGrants")}</Text>
            ) : (
              holdings.networks
                .filter((entry) => entry.activeGrants.length > 0)
                .map((entry) => (
                  <Button key={entry.network} variant="secondary" disabled={Boolean(busy)} onPress={() => void revoke(entry.network)}>
                    <Text>{busy === entry.network ? t("common.loading") : t("deleteAccount.revokeOn", { network: networkName(entry.network), count: String(entry.activeGrants.length) })}</Text>
                  </Button>
                ))
            )}
            <Text className={cn("text-muted-foreground text-xs leading-5", TEXT_START)}>{t("deleteAccount.revokeNote")}</Text>
          </Step>

          <Step n={3} title={t("deleteAccount.takeOut")} done={!held}>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("deleteAccount.takeOutBody")}</Text>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" onPress={() => router.push("/send")}>
                <Text>{t("deleteAccount.send")}</Text>
              </Button>
              <Button className="flex-1" variant="secondary" onPress={() => router.push("/account/export")}>
                <Text>{t("account.export")}</Text>
              </Button>
            </View>
          </Step>

          <Step n={4} title={t("deleteAccount.confirm", { handle: expected })}>
            <Input value={confirm} onChangeText={setConfirm} placeholder={expected} autoCapitalize="none" autoCorrect={false} />
          </Step>

          <Button variant="destructive" disabled={Boolean(busy) || !expected || confirm.trim().toLowerCase() !== expected.toLowerCase()} onPress={() => void remove()}>
            <Text>{busy === "delete" ? t("common.loading") : t("deleteAccount.delete")}</Text>
          </Button>
          <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("deleteAccount.after")}</Text>
        </>
      )}
    </Page>
  );
}

