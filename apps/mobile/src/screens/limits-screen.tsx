// Wallet & limits (journey 12; N1–N5, S10, S11): what Kawase is allowed to do with this wallet on the active
// network, in the authority receipt's plain words, and the switch that takes it away. Turning the allowance off is
// an on-chain revoke the person signs — irreversible from here, so it is hold-to-confirm; turning it back on goes
// through the same Face ID step as setup. The revoke is a sequence with honest endings (Codex review R05): waiting
// for the signature → sent → confirmed by the api; a cancelled or refused signature leaves the allowance on and the
// control usable; a revoke whose answer was lost is checked against the chain (the api reads the DelegationManager)
// before another one is offered, so nobody signs twice blindly. The receipt is decoded from the signed grant, never from a draft. The
// rest of journey 12 (pause all, the risk dial, practice mode, the exit kit's sweep) lands with the executor and
// the agent that obey them (Stages 4/5), so those rows are not shown before they do anything.
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, Copy } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { ApiError } from "@kawase/api-client";
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

/** After a lost answer, the chain is asked this many times, this far apart, before the person is asked to check again. */
const RECONCILE_TRIES = 8;
const RECONCILE_GAP_MS = 3_000;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;
const MS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;
/** The hold that turns the allowance off; long enough to be deliberate. */
const REVOKE_HOLD_MS = 1_800;

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** idle → signing → pending → (done | failed | checking → done | unconfirmed). */
type RevokePhase = "idle" | "signing" | "pending" | "checking" | "unconfirmed" | "failed";

export function LimitsScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const { wallet, refresh } = useWalletStatus();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [phase, setPhase] = React.useState<RevokePhase>("idle");
  const [note, setNote] = React.useState<string>();
  const [attempt, setAttempt] = React.useState(0);
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

  /** The control can be held again: the allowance is still on, and the words say why. */
  const fail = (words: string) => {
    setNote(words);
    setPhase("failed");
    setAttempt((count) => count + 1);
  };

  /** Asks the api (which asks the chain) whether the allowance is off; never sends anything. */
  const reconcile = async (grantId: string | undefined) => {
    setNote(undefined);
    setPhase("checking");
    for (let tries = 0; tries < RECONCILE_TRIES; tries++) {
      const fresh = await api.wallet.status().catch(() => undefined);
      const allowance = fresh?.networks[network]?.allowance;
      if (fresh && (!allowance || allowance.id !== grantId)) {
        await refresh();
        setPhase("idle");
        toast(t("limits.revoked"));
        return;
      }
      await sleep(RECONCILE_GAP_MS);
    }
    await refresh();
    setNote(t("limits.revokeUnconfirmed"));
    setPhase("unconfirmed");
    setAttempt((count) => count + 1);
  };

  const revoke = async () => {
    if (!signer) return;
    const grantId = state?.allowance?.id;
    setNote(undefined);
    setPhase("signing");
    let request;
    try {
      request = await api.wallet.revokeRequest(network);
    } catch {
      fail(t("limits.revokeFailed"));
      return;
    }
    let signed;
    try {
      signed = await signer.signTransaction(toSerializable(request.transaction));
    } catch {
      fail(t("limits.revokeNotSigned"));
      return;
    }
    setPhase("pending");
    try {
      const result = await api.wallet.submitTransaction(request.requestId, signed);
      if (result.status !== "confirmed") {
        await refresh();
        fail(t("limits.revokeReverted"));
        return;
      }
      await refresh();
      setPhase("idle");
      toast(t("limits.revoked"));
    } catch (error) {
      // Refused before it was broadcast (a mismatch, an expired request): nothing reached the chain.
      if (error instanceof ApiError && error.status >= HTTP_CLIENT_ERROR && error.status < HTTP_SERVER_ERROR) {
        fail(t("limits.revokeFailed"));
        return;
      }
      // The signed revoke may be on its way: look before offering another one.
      await reconcile(grantId);
    }
  };

  const busy = phase === "signing" || phase === "pending" || phase === "checking";
  const holdLabel =
    phase === "signing" ? t("limits.revokeSigning") : phase === "checking" ? t("limits.revokeChecking") : t("limits.revoking");
  const holdSeconds = Math.round(REVOKE_HOLD_MS / MS_PER_TENTH) / TENTHS_PER_SECOND;

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
                <HoldToConfirm
                  onConfirm={() => void revoke()}
                  confirmLabel={holdLabel}
                  done={false}
                  resetKey={attempt}
                  duration={REVOKE_HOLD_MS}
                  hint={t("limits.holdHint", { seconds: holdSeconds })}
                  disabled={busy || !signer}
                >
                  {t("limits.holdToRevoke")}
                </HoldToConfirm>
                {note ? (
                  <View accessibilityRole="alert" accessibilityLiveRegion="polite" className="bg-muted gap-3 rounded-2xl px-4 py-3">
                    <Text className={cn("text-base leading-6", phase === "failed" ? "text-destructive" : "text-foreground", TEXT_START)}>{note}</Text>
                    {phase === "unconfirmed" ? (
                      <Button variant="secondary" onPress={() => void reconcile(state?.allowance?.id)}>
                        <Text>{t("limits.checkAgain")}</Text>
                      </Button>
                    ) : null}
                  </View>
                ) : null}
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
