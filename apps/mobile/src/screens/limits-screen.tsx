// Wallet & limits (cards/automate-safety.md "Stay in control"; surfaces.md): what Kawase may do with this wallet on
// the active network, and every control over it.
// - The authority receipt, from the signed grants (what Arc enforces), with Kawase's own lower caps beside them.
// - The daily allowance per token (+ Add a token): enforced on Arc.
// - What Kawase checks itself: the per-payment cap, the new-recipient cooldown, the allowlist, a temporary raise.
// - Control: pause all, the risk dial (Guard · Balanced · Autonomous, X11), practice mode.
// - The exit kit: pause → one Face ID revokes every grant on Arc → move the money out.
// A lower limit applies at once; a higher one shows Now → After and needs the person's approval (a new grant for an
// allowance, X7). The api decides which is which; this screen only asks.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { RiskMode, SafetyView } from "@kawase/api-client";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { AuthorityReceipt } from "@kawase/ui-native/components/authority-receipt";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { HoldToConfirm } from "@kawase/ui-native/components/hold-to-confirm";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { ApprovalPanel } from "@/safety/approval-panel";
import { useExitRoute } from "@/safety/exit-route";
import { LimitSheet, type Editor } from "@/safety/limit-sheet";
import { useChangeRunner } from "@/safety/use-change-runner";
import { ARC_CHAIN_IDS, useSafetyChange, useSafetyFormat, useSafetyView } from "@/safety/use-safety";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ROW_MARK = 32;
const ART_WIDTH = 140;
const SKELETON_HEIGHT = 220;
/** The exit kit's revoke is irreversible from here, so it is a deliberate hold. */
const REVOKE_HOLD_MS = 1_800;
const MS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;
const RISK_MODES: RiskMode[] = ["careful", "balanced", "autonomous"];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-1">
        <Eyebrow>{title}</Eyebrow>
        {note ? <Text className="text-muted-foreground text-xs">{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function useReceipt(safety: SafetyView | undefined) {
  const { t } = useT();
  const format = useSafetyFormat();
  if (!safety) return undefined;
  const networkName = safety.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  // What Arc enforces is the signed amount (plus a raise while it lasts); Kawase's own lower cap is said beside it.
  const daily = safety.allowances.map((entry) => format.money(BigInt(entry.signedPerDay) + BigInt(entry.boost?.extra ?? "0"), entry.decimals, entry.symbol));
  const can = safety.allowances.map((entry) => t("safety.receiptCanToken", { amount: format.money(entry.perDay, entry.decimals, entry.symbol) }));
  if (safety.grants.automation > 0) can.push(t("safety.receiptCanAutomations"));
  return {
    labels: { can: t("authority.can"), never: t("authority.never"), worst: t("authority.worst") },
    can: can.length > 0 ? can : [t("safety.receiptCanNothing")],
    never: [t("safety.receiptNeverMore"), t("safety.receiptNeverLimits")],
    worst: daily.length > 0 ? t("safety.receiptWorst", { amounts: daily.join(" + ") }) : t("safety.receiptWorstNone"),
    meta: networkName,
  };
}

export function LimitsScreen() {
  const { t } = useT();
  const router = useRouter();
  const exitRoute = useExitRoute();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const format = useSafetyFormat();
  const { status, user } = useSession();
  const { safety, failed, load, set, canLoad } = useSafetyView();
  const control = useChangeRunner(set);
  const { revoke } = useSafetyChange();
  const [editor, setEditor] = React.useState<Editor>();
  const [exitBusy, setExitBusy] = React.useState(false);
  const [exitAttempt, setExitAttempt] = React.useState(0);
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const chainId = ARC_CHAIN_IDS[network];
  const receipt = useReceipt(safety);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const exitKit = async () => {
    setExitBusy(true);
    try {
      const kit = await api.safety.exitKit();
      set(kit.safety);
      if (!kit.revoke) {
        toast(t("safety.exitNothing"));
        return;
      }
      const outcome = await revoke(kit.revoke, t("safety.revokePrompt"), t("common.cancel"));
      toast(outcome === "revoked" ? t("safety.exitRevoked") : t("safety.revokeLater"));
      await load();
    } catch {
      toast(t("safety.failed"));
    } finally {
      setExitBusy(false);
      setExitAttempt((count) => count + 1);
    }
  };

  const riskBody = (mode: RiskMode) => t(mode === "careful" ? "safety.riskGuardBody" : mode === "autonomous" ? "safety.riskAutonomousBody" : "safety.riskBalancedBody");
  const riskLabel = (mode: RiskMode) => t(mode === "careful" ? "safety.riskGuard" : mode === "autonomous" ? "safety.riskAutonomous" : "safety.riskBalanced");
  const grantsOn = safety ? safety.grants.allowance + safety.grants.automation + safety.grants.marketplace : 0;
  const holdSeconds = Math.round(REVOKE_HOLD_MS / MS_PER_TENTH) / TENTHS_PER_SECOND;

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("safety.title")}
        </Text>
      </View>

      {status !== "account" || !canLoad ? (
        <EmptyState
          art={<Koban width={ART_WIDTH} />}
          title={t("receive.noWallet")}
          body={t("receive.noWalletBody")}
          action={
            <Button onPress={() => router.push("/wallet")}>
              <Text>{t("wallet.setUp")}</Text>
            </Button>
          }
        />
      ) : !safety ? (
        <View className="gap-4 px-5 pt-5">
          {failed ? (
            <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("safety.failed")}</Text>
              <Button size="sm" variant="secondary" onPress={() => void load()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </View>
          ) : (
            <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
          )}
        </View>
      ) : !safety.walletAddress || !safety.setUp ? (
        <View className="px-5 pt-5">
          <View className="bg-card border-border gap-3 rounded-3xl border p-5">
            <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("limits.notSetUpBody")}</Text>
            <Button onPress={() => router.push("/wallet")}>
              <Text>{t("wallet.setUp")}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-7 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET }}>
          {safety.pausedAt ? (
            <View accessibilityRole="alert" className="bg-destructive flex-row items-center gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-destructive-foreground flex-1 text-sm font-semibold", TEXT_START)}>{t("safety.pausedSince", { time: format.time(safety.pausedAt) })}</Text>
              <Button size="sm" variant="secondary" disabled={control.busy} onPress={() => void control.submit({ kind: "pause", on: false })}>
                <Text>{t("safety.resume")}</Text>
              </Button>
            </View>
          ) : null}

          {receipt ? <AuthorityReceipt {...receipt} /> : null}

          <Section title={t("safety.allowanceTitle")} note={t("safety.allowanceGuaranteed")}>
            <ListGroup>
              {safety.allowances.map((entry) => (
                <ListRow
                  key={entry.token}
                  leading={<TokenMark token={{ chainId, address: entry.token, symbol: entry.symbol }} size={ROW_MARK} />}
                  title={entry.symbol}
                  subtitle={[
                    t("safety.allowanceRow", { amount: format.money(entry.perDay, entry.decimals, entry.symbol), left: format.money(entry.leftToday, entry.decimals, entry.symbol) }),
                    entry.perDay !== entry.signedPerDay ? t("safety.allowanceCapped", { signed: format.money(entry.signedPerDay, entry.decimals, entry.symbol) }) : null,
                    entry.boost ? t("safety.allowanceRaise", { extra: format.money(entry.boost.extra, entry.decimals, entry.symbol), time: format.time(entry.boost.until) }) : null,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  chevron
                  onPress={() => setEditor({ kind: "allowance", token: entry.token, symbol: entry.symbol, decimals: entry.decimals, perDay: entry.perDay })}
                />
              ))}
              <ListRow leading={<Icon as={Plus} className="text-foreground size-5" />} title={t("safety.addToken")} chevron onPress={() => setEditor({ kind: "add_token" })} />
            </ListGroup>
            {safety.allowances.length === 0 ? <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("safety.allowanceEmpty")}</Text> : null}
          </Section>

          <Section title={t("safety.checkedTitle")}>
            <ListGroup>
              <ListRow
                title={t("safety.perPayment")}
                subtitle={
                  safety.perPayment.temp
                    ? t("safety.perPaymentTemp", { amount: format.usdc(safety.perPayment.temp.value), time: format.time(safety.perPayment.temp.until) })
                    : t("safety.perPaymentRow", { amount: format.usdc(safety.perPayment.value) })
                }
                chevron
                onPress={() => setEditor({ kind: "per_payment" })}
              />
              <ListRow
                title={t("safety.cooldown")}
                subtitle={safety.cooldown.seconds > 0 ? t("safety.cooldownRow", { amount: format.usdc(safety.cooldown.cap), hours: format.hours(safety.cooldown.seconds) }) : t("safety.cooldownOff")}
                chevron
                onPress={() => setEditor({ kind: "cooldown" })}
              />
              <ListRow
                title={t("safety.allowlist")}
                subtitle={safety.allowlist.only ? t("safety.allowlistOnlyRow", { count: safety.allowlist.entries.length }) : t("safety.allowlistAnyRow")}
                chevron
                onPress={() => setEditor({ kind: "allowlist" })}
              />
              <ListRow title={t("safety.raise")} subtitle={t("safety.raiseRow")} chevron onPress={() => setEditor({ kind: "raise" })} />
            </ListGroup>
          </Section>

          <Section title={t("safety.controlTitle")}>
            <ListGroup>
              <ListRow
                title={t("safety.pause")}
                subtitle={t("safety.pauseRow")}
                trailing={<Switch checked={Boolean(safety.pausedAt)} disabled={control.busy} onCheckedChange={(on) => void control.submit({ kind: "pause", on })} accessibilityLabel={t("safety.pause")} />}
              />
              <ListRow
                title={t("safety.practice")}
                subtitle={t("safety.practiceRow")}
                trailing={<Switch checked={safety.practice} disabled={control.busy} onCheckedChange={(on) => void control.submit({ kind: "practice", on })} accessibilityLabel={t("safety.practice")} />}
              />
            </ListGroup>
            <View className="bg-card border-border gap-3 rounded-3xl border p-4">
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("safety.risk")}</Text>
              <SegmentedControl
                label={t("safety.risk")}
                value={safety.riskMode}
                onValueChange={(mode) => void control.submit({ kind: "risk_mode", mode: mode as RiskMode })}
                options={RISK_MODES.map((mode) => ({ value: mode, label: riskLabel(mode), disabled: control.busy }))}
              />
              <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{riskBody(safety.riskMode)}</Text>
            </View>
          </Section>

          <Section title={t("safety.exitTitle")}>
            <View className="bg-card border-border gap-4 rounded-3xl border p-4">
              <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("safety.exitBody")}</Text>
              <Button variant="secondary" disabled={Boolean(safety.pausedAt) || control.busy} onPress={() => void control.submit({ kind: "pause", on: true })}>
                <Text>{safety.pausedAt ? t("safety.exitPaused") : t("safety.exitPause")}</Text>
              </Button>
              {grantsOn > 0 ? (
                <>
                  <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.exitGrants", { count: grantsOn })}</Text>
                  <HoldToConfirm
                    onConfirm={() => void exitKit()}
                    confirmLabel={t("safety.exitRevoking")}
                    done={false}
                    resetKey={exitAttempt}
                    duration={REVOKE_HOLD_MS}
                    hint={t("safety.holdHint", { seconds: holdSeconds })}
                    disabled={exitBusy}
                  >
                    {t("safety.exitRevokeHold")}
                  </HoldToConfirm>
                </>
              ) : (
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.exitNothing")}</Text>
              )}
              <Button onPress={() => router.push(exitRoute)}>
                <Text>{t("safety.exitMove")}</Text>
              </Button>
            </View>
          </Section>
        </ScrollView>
      )}

      <LimitSheet editor={editor} safety={safety} onClose={() => setEditor(undefined)} onSafety={set} />
      <Sheet
        open={Boolean(control.pending)}
        onClose={control.reset}
        colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
        closeLabel={t("common.close")}
        bottomInset={insets.bottom}
      >
        {control.pending ? <ApprovalPanel pending={control.pending} busy={control.busy} onApprove={() => void control.confirm()} /> : null}
      </Sheet>
    </View>
  );
}
