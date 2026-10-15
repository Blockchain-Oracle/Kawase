// The weekly budget (D38, workstream E): "no Face ID after every action" made real. One hero (this week's ring), the
// two caps, what it covers, the venues with their real marks, the worst case in one line, and ONE approval that signs
// the budget, the away pack and the revoke of the old any-recipient allowance (sign-budget.ts). Lowering, pausing and
// revoking never ask. The controls the old Wallet & limits screen had (the risk dial, practice) sit behind one
// disclosure; revoke-all is a hold, with no Face ID: it only ever takes power away.
// Senryo grammar: one hero figure, ≤4 facts at rest, detail behind disclosures, inputs and the CTA fit 375×812.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { EarnVaultView, RiskMode } from "@kawase/api-client";
import { getEntity, getProviderIdentity, tokenKey, venueKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { arcStablecoin, type BudgetCategory } from "@kawase/wallet";

import {
  AmountPad,
  Button,

  DisclosureRow,
  EmptyState,
  ErrorState,
  HoldButton,
  Icon,
  ListRow,
  LoadingState,
  Panel,
  QuietLine,
  SIZE,
  SPACE,
  SectionLabel,
  Segmented,
  StaleTick,
  Switch,
  TYPE,
  WaitingText,
  useHeldLoading,
  useTheme,
} from "@/components/kit";
import { ChevronLeft } from "@/components/kit/icons";
import { Sheet } from "@/components/sheet/Sheet";
import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useSafetyChange, useSafetyView } from "@/safety/use-safety";
import { useSession } from "@/session/session-provider";
import { biometricKind, confirmWithBiometrics, type BiometricKind } from "@/wallet/biometric";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { budgetApi } from "./client";
import { chainIdOf, invalidateGuardContext } from "./silent";
import { isLoosening, revokeAll, signBudget, type BudgetDraft } from "./sign-budget";
import type { BudgetView } from "./types";
import { BudgetRing } from "./budget-ring";
import { defaultDraft, MOVE_VENUES, useAllBudgetVenues } from "./defaults";
import { formatUsd } from "./format";
import { useBudget, useBudgetLedger } from "./use-budget";

const NONE = 0n;
const PERCENT = 100;
const CATEGORY_ORDER: BudgetCategory[] = ["swap", "bridge", "earn", "send", "x402"];
const RISK_MODES: RiskMode[] = ["careful", "balanced", "autonomous"];
const MARK = SIZE.markRow;

type Phase = "idle" | "signing" | "pausing" | "revoking";

function draftOf(view: BudgetView | null, venues: readonly string[]): BudgetDraft {
  if (!view) return defaultDraft(venues);
  return { weeklyCap: BigInt(view.policy.weeklyCap), perActionCap: BigInt(view.policy.perActionCap), categories: [...view.policy.categories], venues: [...view.policy.venues] };
}

const sameDraft = (a: BudgetDraft, b: BudgetDraft) =>
  a.weeklyCap === b.weeklyCap &&
  a.perActionCap === b.perActionCap &&
  [...a.categories].sort().join() === [...b.categories].sort().join() &&
  [...a.venues].map((v) => v.toLowerCase()).sort().join() === [...b.venues].map((v) => v.toLowerCase()).sort().join();

export function BudgetScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  const { user } = useSession();
  const { state, load, set, network } = useBudget();
  const signer = useWalletSigner();
  const ready = state.status === "ready";
  const view = ready ? state.view : null;
  const { venues: allVenues, vaults, swapVenues } = useAllBudgetVenues(network, ready);
  const ledger = useBudgetLedger(ready && Boolean(view), view?.spentThisWeek ?? "");
  const held = useHeldLoading(state.status === "loading");
  const [kind, setKind] = React.useState<BiometricKind>("none");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);

  const signed = React.useMemo(() => draftOf(view, allVenues), [view, allVenues]);
  const [draft, setDraft] = React.useState<BudgetDraft>(signed);
  // A fresh answer from the api (or the venues arriving) resets the editor to what is signed.
  React.useEffect(() => setDraft(signed), [signed]);
  const [editing, setEditing] = React.useState<"week" | "action" | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const dirty = !view || !sameDraft(draft, signed);
  const loosening = isLoosening(view, draft);
  const usd = React.useCallback((value: bigint) => formatUsd(value, locale), [locale]);

  const method = t(`budget.method.${kind}`);
  const withCheck = kind !== "none" && kind !== "emailCode";
  const ctaLabel = !view
    ? withCheck
      ? t("budget.screen.turnOnWith", { method })
      : t("budget.screen.turnOn")
    : loosening && withCheck
      ? t("budget.screen.saveWith", { method })
      : t("budget.screen.save");

  const save = async () => {
    if (!signer || !user) {
      notify.info(t("budget.screen.walletNeeded"));
      return;
    }
    setPhase("signing");
    try {
      const result = await signBudget({ draft, current: view, signer, network, confirm: () => confirmWithBiometrics(t("budget.screen.confirmPrompt"), t("common.cancel")) });
      if (result.outcome === "saved") {
        set(result.answer.budget as BudgetView | null);
        const moved = result.answer.rotation?.status === "confirmed";
        notify.success(view ? t("budget.screen.saved") : t("budget.screen.turnedOn"), moved ? undefined : { description: t("budget.screen.awayLater") });
      } else if (result.outcome === "refused") {
        notify.error(t("budget.screen.refused"));
      } else if (result.outcome === "unavailable") {
        notify.info(t("send.approvalUnavailable"));
      } else if (result.outcome === "failed") {
        notify.error(t("send.approvalFailed"));
      }
    } catch {
      notify.error(t("budget.screen.saveFailed"));
      void load();
    } finally {
      setPhase("idle");
    }
  };

  const togglePause = async (paused: boolean) => {
    setPhase("pausing");
    try {
      const { budget } = paused ? await budgetApi.pause() : await budgetApi.resume();
      set(budget as BudgetView | null);
      invalidateGuardContext();
      fire("confirm");
    } catch {
      notify.error(t("budget.screen.pauseFailed"));
    } finally {
      setPhase("idle");
    }
  };

  const revoke = async () => {
    if (!signer) {
      notify.info(t("budget.screen.walletNeeded"));
      return;
    }
    setPhase("revoking");
    try {
      const outcome = await revokeAll(signer);
      await load();
      if (outcome.kill?.status === "confirmed") notify.success(t("budget.screen.revoked"));
      else notify.error(t("budget.screen.revokeFailed"));
    } catch {
      notify.error(t("budget.screen.revokeFailed"));
      void load();
    } finally {
      setPhase("idle");
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={SPACE.sm} style={styles.back}>
        <Icon icon={ChevronLeft} tint={color.ink} />
      </Pressable>
      <Text style={[TYPE.pageTitle, { color: color.ink }]} accessibilityRole="header">
        {t("budget.screen.title")}
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (state.status === "guest") {
    body = <EmptyState size="page" why={t("budget.screen.guestWhy")} detail={t("budget.screen.guestDetail")} action={{ label: t("budget.screen.signIn"), onPress: () => router.push("/sign-in") }} />;
  } else if (state.status === "loading" || held) {
    body = <LoadingState shape="detail" label={t("budget.screen.loading")} />;
  } else if (state.status === "error") {
    body = <ErrorState diagnosis={state.error} retry={() => void load()} stillWorks={t("budget.screen.stillWorks")} />;
  } else {
    const spent = view ? BigInt(view.spentThisWeek) : NONE;
    const cap = view ? BigInt(view.policy.weeklyCap) : draft.weeklyCap;
    const left = view ? BigInt(view.leftThisWeek) : draft.weeklyCap;
    const paused = Boolean(view?.paused);
    body = (
      <>
        <View style={styles.hero}>
          <BudgetRing
            spent={spent}
            cap={cap}
            perAction={draft.perActionCap}
            figure={usd(spent)}
            caption={t("budget.screen.ofWeek", { cap: usd(cap) })}
            paused={paused}
            accessibilityLabel={t("budget.ring", { spent: usd(spent), cap: usd(cap) })}
          />
          <Text style={[TYPE.rowDetail, styles.centre, { color: paused ? color.warn : color.text2 }]}>
            {!view ? t("budget.screen.notOn") : paused ? t("budget.screen.paused") : t("budget.screen.leftResets", { left: usd(left) })}
          </Text>
          {state.stale ? <StaleTick asOf={state.asOf} reason="offline" /> : null}
        </View>

        <Panel>
          <ListRow title={t("budget.screen.perWeek")} trailing={<Text style={[TYPE.rowAmount, { color: color.ink }]}>{usd(draft.weeklyCap)}</Text>} onPress={() => setEditing("week")} />
          <ListRow title={t("budget.screen.perAction")} trailing={<Text style={[TYPE.rowAmount, { color: color.ink }]}>{usd(draft.perActionCap)}</Text>} onPress={() => setEditing("action")} />
        </Panel>

        <SectionLabel style={styles.label}>{t("budget.screen.covers")}</SectionLabel>
        <Panel>
          {CATEGORY_ORDER.map((category) => (
            <ListRow
              key={category}
              title={t(`budget.category.${category}`)}
              trailing={
                <Switch
                  value={draft.categories.includes(category)}
                  accessibilityLabel={t(`budget.category.${category}`)}
                  onValueChange={(on) => setDraft((current) => ({ ...current, categories: on ? [...current.categories, category] : current.categories.filter((entry) => entry !== category) }))}
                />
              }
            />
          ))}
        </Panel>

        <Panel style={styles.disclosures}>
          <DisclosureRow title={t("budget.screen.venues")} value={t("budget.screen.venuesOn", { count: draft.venues.length })}>
            <VenueRows
              swapVenues={swapVenues}
              vaults={vaults}
              chainId={chainIdOf(network)}
              usdc={arcStablecoin(network, "USDC")}
              selected={draft.venues}
              onToggle={(venue, on) => setDraft((current) => ({ ...current, venues: on ? [...current.venues, venue] : current.venues.filter((entry) => entry.toLowerCase() !== venue.toLowerCase()) }))}
            />
          </DisclosureRow>
          {view?.away && view.away.state !== "none" ? (
            <DisclosureRow title={t("budget.screen.away")} value={view.away.state === "live" ? t("budget.screen.awayLive") : t("budget.screen.awayPending")}>
              {view.away.contacts > 0 ? <Line text={t("budget.screen.awayContacts", { count: view.away.contacts, cap: usd(BigInt(view.away.perContactPerWeek ?? "0")) })} /> : null}
              {view.away.vaults > 0 ? <Line text={t("budget.screen.awayVaults", { count: view.away.vaults })} /> : null}
              {view.away.moves > 0 ? <Line text={t("budget.screen.awayMoves")} /> : null}
            </DisclosureRow>
          ) : null}
          {view ? (
            <DisclosureRow title={t("budget.screen.thisWeek")} value={ledger === undefined ? "" : t("budget.screen.actions", { count: ledger.filter((row) => row.counts).length })}>
              {ledger === undefined ? (
                <WaitingText>{t("budget.screen.loadingShort")}</WaitingText>
              ) : ledger.length === 0 ? (
                <Line text={t("budget.screen.nothingYet")} />
              ) : (
                ledger.map((row) => (
                  <View key={row.id} style={styles.ledgerRow}>
                    <Text style={[TYPE.row, styles.flex, { color: row.counts ? color.ink : color.text3 }]}>{t(`budget.category.${row.category}`, { defaultValue: row.category })}</Text>
                    <Text style={[TYPE.rowAmount, { color: row.counts ? color.ink : color.text3 }]}>{usd(BigInt(row.amountUsd))}</Text>
                  </View>
                ))
              )}
            </DisclosureRow>
          ) : null}
          <DisclosureRow title={t("budget.screen.controls")} value={paused ? t("budget.screen.pausedShort") : ""}>
            <Controls view={view} paused={paused} busy={phase !== "idle"} onPause={(on) => void togglePause(on)} />
          </DisclosureRow>
        </Panel>

        <QuietLine>{t("budget.screen.worstCase", { week: usd(draft.weeklyCap), action: usd(draft.perActionCap) })}</QuietLine>
        {view && (view.legacyAllowances ?? 0) > 0 ? <Text style={[TYPE.rowDetail, styles.centre, { color: color.warn }]}>{t("budget.screen.legacy")}</Text> : null}

        <View style={styles.cta}>
          {dirty || (view?.legacyAllowances ?? 0) > 0 ? (
            <Button label={phase === "signing" ? t("budget.screen.signing") : ctaLabel} loading={phase === "signing"} disabled={phase !== "idle" || draft.categories.length === 0 || draft.perActionCap === NONE} onPress={() => void save()} />
          ) : null}
          {view ? (
            <HoldButton label={t("budget.screen.revokeAll")} holdingLabel={t("budget.screen.revoking")} ready={phase === "idle"} busy={phase === "revoking"} onConfirm={() => void revoke()} />
          ) : null}
        </View>
      </>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: color.ground, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxxl }]} keyboardShouldPersistTaps="handled">
        {header}
        {body}
      </ScrollView>
      {editing ? (
        <CapSheet
          title={editing === "week" ? t("budget.screen.perWeek") : t("budget.screen.perAction")}
          value={editing === "week" ? draft.weeklyCap : draft.perActionCap}
          limit={editing === "action" ? draft.weeklyCap : undefined}
          onClose={() => setEditing(null)}
          onDone={(value) => {
            setDraft((current) =>
              editing === "week" ? { ...current, weeklyCap: value, perActionCap: current.perActionCap > value ? value : current.perActionCap } : { ...current, perActionCap: value },
            );
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}

function Line({ text }: { text: string }) {
  const { color } = useTheme();
  return <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{text}</Text>;
}

/** The venues a budget can name, each with its real mark: swap venues the phone knows on this network, CCTP, the vaults. */
function VenueRows({
  swapVenues,
  vaults,
  chainId,
  usdc,
  selected,
  onToggle,
}: {
  swapVenues: readonly string[];
  vaults: EarnVaultView[] | undefined;
  chainId: number;
  usdc: string | undefined;
  selected: readonly string[];
  onToggle: (venue: string, on: boolean) => void;
}) {
  const { t } = useT();
  const on = (venue: string) => selected.some((entry) => entry.toLowerCase() === venue.toLowerCase());
  const row = (id: string, title: string, mark: string, detail?: string) => (
    <ListRow key={id} title={title} detail={detail} leading={<Mark entity={mark} size={MARK} />} trailing={<Switch value={on(id)} accessibilityLabel={title} onValueChange={(next) => onToggle(id, next)} />} />
  );
  return (
    <View>
      <SectionLabel style={styles.label}>{t("budget.category.swap")}</SectionLabel>
      {swapVenues.map((venue) => row(venue, getEntity(venueKey(venue))?.name ?? venue, venueKey(venue)))}
      <SectionLabel style={styles.label}>{t("budget.category.bridge")}</SectionLabel>
      {MOVE_VENUES.map((venue) => row(venue, getEntity(venueKey(venue))?.name ?? venue, venueKey(venue)))}
      <SectionLabel style={styles.label}>{t("budget.category.earn")}</SectionLabel>
      {vaults === undefined ? (
        <WaitingText>{t("budget.screen.loadingShort")}</WaitingText>
      ) : vaults.length === 0 ? (
        <Line text={t("budget.screen.noVaults")} />
      ) : (
        vaults.map((vault) =>
          row(vault.address.toLowerCase(), vault.name, getProviderIdentity(vault.protocol.toLowerCase())?.id ?? (usdc ? tokenKey(chainId, usdc) : venueKey("app_kit")), t("budget.screen.vaultApy", { apy: (vault.apy * PERCENT).toFixed(1) })),
        )
      )}
    </View>
  );
}

/** Pause (silent), the risk dial and practice mode: the controls the old Wallet & limits screen carried. */
function Controls({ view, paused, busy, onPause }: { view: BudgetView | null; paused: boolean; busy: boolean; onPause: (on: boolean) => void }) {
  const { t } = useT();
  const { safety, load, set } = useSafetyView();
  const change = useSafetyChange();
  React.useEffect(() => {
    void load();
  }, [load]);
  const apply = async (request: Parameters<typeof change.request>[0]) => {
    try {
      const answer = await change.request(request);
      if (answer.status === "needs_approval") {
        const approved = await change.approve(answer, t("budget.screen.confirmPrompt"), t("common.cancel"));
        if (approved.outcome !== "applied") return;
        if (approved.response && approved.response.status !== "needs_approval") set(approved.response.safety);
      } else set(answer.safety);
      invalidateGuardContext();
      fire("confirm");
    } catch {
      notify.error(t("budget.screen.pauseFailed"));
    }
  };
  return (
    <View style={styles.controls}>
      {view ? <ListRow title={t("budget.screen.pause")} trailing={<Switch value={paused} disabled={busy} accessibilityLabel={t("budget.screen.pause")} onValueChange={onPause} />} /> : null}
      {safety ? (
        <>
          <SectionLabel style={styles.label}>{t("safety.risk")}</SectionLabel>
          <Segmented
            label={t("safety.risk")}
            options={RISK_MODES.map((mode) => ({ value: mode, label: t(mode === "careful" ? "safety.riskGuard" : mode === "balanced" ? "safety.riskBalanced" : "safety.riskAutonomous") }))}
            value={safety.riskMode}
            onChange={(mode) => void apply({ kind: "risk_mode", mode })}
          />
          <ListRow title={t("safety.practice")} trailing={<Switch value={safety.practice} accessibilityLabel={t("safety.practice")} onValueChange={(on) => void apply({ kind: "practice", on })} />} />
        </>
      ) : (
        <WaitingText>{t("budget.screen.loadingShort")}</WaitingText>
      )}
    </View>
  );
}

/** One cap, typed on the AmountPad (dollars); per action can never be more than the week. */
function CapSheet({ title, value, limit, onClose, onDone }: { title: string; value: bigint; limit?: bigint | undefined; onClose: () => void; onDone: (value: bigint) => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const [amount, setAmount] = React.useState(value);
  const problem = amount === NONE ? t("budget.screen.capZero") : limit !== undefined && amount > limit ? t("budget.screen.capOverWeek", { week: formatUsd(limit, locale) }) : null;
  return (
    <Sheet onClose={onClose} closeLabel={t("common.close")}>
      <View style={styles.sheet}>
        <Text style={[TYPE.sheetTitle, styles.centre, { color: color.ink }]}>{title}</Text>
        <AmountPad value={amount} onChange={setAmount} decimals={6} fraction={0} problem={problem} label={title} />
        <Button label={t("budget.screen.done")} disabled={problem !== null} onPress={() => onDone(amount)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingTop: SPACE.sm },
  back: { width: SIZE.touch, height: SIZE.touch, alignItems: "center", justifyContent: "center", marginStart: -SPACE.md },
  hero: { gap: SPACE.sm, alignItems: "center", paddingVertical: SPACE.md },
  centre: { textAlign: "center" },
  label: { paddingHorizontal: SPACE.xs, paddingTop: SPACE.sm },
  disclosures: { paddingHorizontal: SPACE.lg },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: SIZE.touch },
  flex: { flex: 1 },
  controls: { gap: SPACE.sm },
  cta: { gap: SPACE.md },
  sheet: { gap: SPACE.lg, padding: SPACE.lg },
});
