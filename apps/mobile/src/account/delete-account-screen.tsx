// Settings → Sign-in & security → Delete account (cards/access.md, X16) on the Senryo kit, in order:
//  1. what the account still holds, per network (real balances and the agent wallet), with the real marks;
//  2. turn off what Kawase may still do, per network: an on-chain revoke that Kawase's relayer sends, with the full money
//     lifecycle (Signing → Sent → Confirmed, the receipt, a failure that says whether anything moved). D38: revoking is
//     never behind Face ID. Done while the wallet still has USDC for the fee when the relayer has none;
//  3. take the money out (send it, or export the key: the wallet stays the person's either way);
//  4. type the @handle, then hold to delete: the agent wallet's money goes back to the wallet first, then everything
//     Kawase keeps about the person is deleted and the @handle is held for 30 days (21st cnippet-dev/v-form-12 #25081:
//     a typed phrase gates the destructive action).
import { useFocusEffect, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AccountHoldings, NetworkId } from "@kawase/api-client";
import { explorerTxUrl } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { Mark } from "@kawase/ui-native/components/mark";

import {
  Button,
  ErrorState,
  HoldButton,
  Icon,
  ListRow,
  LoadingState,
  NUMERIC_VARIANT,
  Panel,
  RADIUS,
  SIZE,
  SPACE,
  StaleTick,
  TYPE,
  useHeldLoading,
  useTheme,
} from "@/components/kit";
import { diagnose, type Diagnosis } from "@/components/kit/diagnosis";
import { notify } from "@/components/toast/notify";
import { TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";
import { sayIfProofNeeded } from "@/session/device-proof";
import { useSession } from "@/session/session-provider";
import { sayIfRefused } from "@/wallet/refused";
import { signRevoke, submitRevoke } from "@/wallet/sign-revoke";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { Field } from "./fields";
import { Page } from "./kit-page";
import { useLeave } from "./use-leave";

const ZERO = BigInt(0);

type Read = { holdings?: AccountHoldings; at?: number; error?: Diagnosis; loading: boolean };

/** A numbered step: its number (a check once done), its title, then what it holds. */
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.stepMark, { backgroundColor: done ? color.primary : color.raised2 }]}>
          {done ? (
            <Icon icon={Check} size={SIZE.iconSm} tint={color.primaryForeground} />
          ) : (
            <Text style={[TYPE.rowStrong, styles.figure, { color: color.ink }]}>{n}</Text>
          )}
        </View>
        <Text accessibilityRole="header" style={[TYPE.rowTitle, styles.grow, { color: color.ink }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function DeleteAccountScreen() {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const { color } = useTheme();
  const { user } = useSession();
  const leave = useLeave();
  const [read, setRead] = React.useState<Read>({ loading: true });
  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setRead((current) => ({ ...current, loading: true }));
    try {
      setRead({ holdings: await api.account.holdings(), at: Date.now(), loading: false });
    } catch (error) {
      setRead((current) => ({ ...current, error: diagnose(error), loading: false }));
    }
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );
  const skeleton = useHeldLoading(read.loading && !read.holdings);

  const networkName = (network: NetworkId) => (network === "testnet" ? t("network.arcTestnet") : t("network.arc"));
  const money = (asset: "USDC" | "EURC", baseUnits: string) => formatAmount(amount(asset, BigInt(baseUnits)), locale);
  const expected = user?.handle ? `@${user.handle}` : (user?.email ?? "");
  const holdings = read.holdings;
  const grantsLeft = holdings?.networks.some((entry) => entry.activeGrants.length > 0) ?? false;
  const held =
    holdings?.networks.some(
      (entry) =>
        BigInt(entry.balances.USDC) > ZERO || BigInt(entry.balances.EURC) > ZERO || BigInt(entry.agentWallet) > ZERO,
    ) ?? false;
  const typed = Boolean(expected) && confirm.trim().toLowerCase() === expected.toLowerCase();

  const remove = async () => {
    setDeleting(true);
    try {
      await api.account.deleteAccount(confirm.trim());
      notify.success(t("deleteAccount.done"));
      await leave();
    } catch (error) {
      if (!sayIfProofNeeded(error, t)) notify.error(t("deleteAccount.failed"));
      setDeleting(false);
    }
  };

  return (
    <Page
      title={t("deleteAccount.title")}
      footer={
        holdings ? (
          <HoldButton
            label={typed ? t("deleteAccount.holdToDelete") : t("deleteAccount.typeFirst", { handle: expected })}
            holdingLabel={t("deleteAccount.keepHolding")}
            ready={typed}
            busy={deleting}
            onConfirm={() => void remove()}
          />
        ) : undefined
      }
    >
      <Text style={[TYPE.body, { color: color.text2 }]}>{t("deleteAccount.body")}</Text>
      {!holdings ? (
        read.error && !read.loading ? (
          <ErrorState diagnosis={read.error} retry={() => void load()} stillWorks={t("deleteAccount.stillWorks")} />
        ) : skeleton ? (
          <LoadingState shape="detail" label={t("deleteAccount.loading")} />
        ) : null
      ) : (
        <>
          {read.error && read.at ? (
            <StaleTick asOf={read.at} reason={read.error.kind === "offline" ? "offline" : "refresh-failed"} />
          ) : null}
          <Step n={1} title={t("deleteAccount.holdings")} done={!held}>
            {holdings.networks.map((entry) => {
              const ids = arcIdentity(entry.network);
              return (
                <Panel key={entry.network}>
                  {(["USDC", "EURC"] as const).map((asset) => (
                    <ListRow
                      key={asset}
                      leading={
                        <Mark
                          entity={asset === "USDC" ? ids.usdc : ids.eurc}
                          chainBadge={ids.chain}
                          size={SIZE.markRow}
                        />
                      }
                      title={asset}
                      detail={networkName(entry.network)}
                      trailing={
                        <Text style={[TYPE.rowAmount, styles.figure, { color: color.ink }]}>
                          {money(asset, entry.balances[asset])}
                        </Text>
                      }
                    />
                  ))}
                  {BigInt(entry.agentWallet) > ZERO ? (
                    <ListRow
                      title={t("deleteAccount.agentWalletRow")}
                      detail={t("deleteAccount.agentWalletBack")}
                      trailing={
                        <Text style={[TYPE.rowAmount, styles.figure, { color: color.ink }]}>
                          {money("USDC", entry.agentWallet)}
                        </Text>
                      }
                    />
                  ) : null}
                </Panel>
              );
            })}
          </Step>

          <Step n={2} title={t("deleteAccount.revoke")} done={!grantsLeft}>
            {grantsLeft ? (
              holdings.networks
                .filter((entry) => entry.activeGrants.length > 0)
                .map((entry) => (
                  <RevokeOn
                    key={entry.network}
                    network={entry.network}
                    name={networkName(entry.network)}
                    count={entry.activeGrants.length}
                    onDone={() => void load()}
                  />
                ))
            ) : (
              <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("deleteAccount.noGrants")}</Text>
            )}
            {grantsLeft ? (
              <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("deleteAccount.revokeNote")}</Text>
            ) : null}
          </Step>

          <Step n={3} title={t("deleteAccount.takeOut")} done={!held}>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("deleteAccount.takeOutBody")}</Text>
            <View style={styles.pair}>
              <View style={styles.grow}>
                <Button label={t("deleteAccount.send")} variant="secondary" onPress={() => router.push("/send")} />
              </View>
              <View style={styles.grow}>
                <Button
                  label={t("account.export")}
                  variant="secondary"
                  onPress={() => router.push("/account/export")}
                />
              </View>
            </View>
          </Step>

          <Step n={4} title={t("deleteAccount.confirm", { handle: expected })} done={typed}>
            <Field
              value={confirm}
              onChangeText={setConfirm}
              placeholder={expected}
              accessibilityLabel={t("deleteAccount.confirm", { handle: expected })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("deleteAccount.after")}</Text>
          </Step>
        </>
      )}
    </Page>
  );
}

/**
 * One network's revoke as a money action: the api prepares the `disableDelegation` calls, this wallet signs them
 * silently (D38: turning things off never asks), the relayer sends, and the CTA runs Signing → Sent → Confirmed into
 * its receipt. A failure says whether anything moved and links the transaction when there is one.
 */
function RevokeOn({
  network,
  name,
  count,
  onDone,
}: {
  network: NetworkId;
  name: string;
  count: number;
  onDone: () => void;
}) {
  const { t } = useT();
  const signer = useWalletSigner();
  const tx = useTxLifecycle();
  const explorer = network === "testnet" ? "arcTestnet" : "arc";
  const [hash, setHash] = React.useState<string | null>(null);

  const run = () =>
    void tx
      .run(
        async (progress) => {
          if (!signer) return { status: "refused", diagnosis: { kind: "wallet", retryable: false } };
          const { revoke } = await api.account.revokeAllRequest(network);
          if (!revoke) return { status: "confirmed", txHash: null };
          const signed = await signRevoke(signer, revoke).catch((error: unknown) => {
            // The phone refused: what it was asked to sign is not a revoke of this wallet's own grants (M6).
            sayIfRefused(error, t);
            throw error;
          });
          progress.submitted(null);
          const result = await submitRevoke(revoke, signed);
          setHash(result.tx);
          return result.status === "confirmed"
            ? { status: "confirmed", txHash: result.tx }
            : {
                status: "reverted",
                diagnosis: { kind: "unknown", retryable: true, technical: "reverted" },
                txHash: result.tx,
              };
        },
        { identity: `revoke:${network}:${count}` },
      )
      .then((outcome) => {
        if (outcome.status === "confirmed") onDone();
      });

  if (tx.state.kind === "failed") {
    return (
      <View style={styles.block}>
        <TxFailureCard
          state={tx.state}
          onRetry={() => (tx.reset(), run())}
          explorerUrl={(tx.state.txHash ?? hash) ? explorerTxUrl(explorer, (tx.state.txHash ?? hash)!) : null}
        />
      </View>
    );
  }
  return (
    <TxCta
      state={tx.state}
      action={t("deleteAccount.revokeOn", { network: name, count: String(count) })}
      onConfirm={run}
      receipt={<Receipt label={t("deleteAccount.revoked")} />}
      {...(!signer
        ? { blocker: { label: t("deleteAccount.needsWallet"), fix: { kind: "setup-wallet" as const } } }
        : {})}
    />
  );
}

function Receipt({ label }: { label: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.receipt, { backgroundColor: color.raised2 }]}>
      <Icon icon={Check} size={SIZE.iconSm} tint={color.ink} />
      <Text style={[TYPE.rowStrong, { color: color.ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: SPACE.md },
  stepHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  stepMark: {
    width: SIZE.markRow,
    height: SIZE.markRow,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1 },
  figure: { fontVariant: NUMERIC_VARIANT },
  pair: { flexDirection: "row", gap: SPACE.sm },
  block: { gap: SPACE.sm },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    borderRadius: RADIUS.lg,
    minHeight: SIZE.buttonHeight,
  },
});
