// Borrow (earn-borrow.md "Borrow"; Aave V4's Main Spoke on Arc), on the Senryo kit. The person's position first (what
// they owe and what is in, the health gauge, Repay, Add and Withdraw on each line), then what can be borrowed and at
// what rate. A loan opens the amount: the asset, the amount (the kit's AmountPad on a phone, a typed figure on a
// desktop window), the collateral to put in with it (any held asset the market accepts, inferred from the wallet),
// and the health gauge moving as they type, projected here and recomputed by the api at review. Review is the ticket:
// slide, then Signing → Sent → Confirmed and the receipt in place.
// Phone: overview → amount → review, crossfading under one header. Desktop: two columns, the overview as the stage and
// the ticket beside it, the best loan (the first borrowable reserve) preselected so the ticket is never empty.
// States: guests are asked to sign in; testnet says it runs on mainnet only and offers the switch; loading is the
// overview's shape, held; a failed read says what still works.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { formatUnits } from "viem";

import type { LendAccountView, LendRequest, LendReserveView } from "@kawase/api-client";
import { LEND } from "@kawase/config";
import { Mark } from "@kawase/ui-native/components/mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { BlockedCta } from "@/components/tx";
import { Button, EmptyState, ErrorState, ListRow, LoadingState, Panel, SectionLabel, SPACE, TIMING, TYPE, useHeldLoading, useTheme } from "@/components/kit";
import { LineChart } from "@/components/kit/icons";
import { MainnetConsentSheet } from "@/components/network-pill";
import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen } from "@/intents/use-wallet-intent";
import { useLendFormat } from "@/lend/copy";
import { HealthGauge } from "@/lend/health-gauge";
import { maxBorrow, priceOf, projectHealth, toInput, type LendAction } from "@/lend/health";
import { LendTicket } from "@/lend/lend-ticket";
import { useLendAccount, useLendOrder } from "@/lend/use-lend";
import { marketEntity } from "@/margin/copy";
import { useSession } from "@/session/session-provider";
import { api } from "@/session/api";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { ChoiceChips } from "@/trade/bits";
import { Columns, PageHeader, PhoneScroll } from "@/trade/page-frame";
import { TicketAmount } from "@/trade/ticket-amount";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const PROVIDER_MARK = 28;
const MARK = 36;
const ROW_MARK = 32;
const BPS = 10_000;
const RATE_DIGITS = 2;
/** The pad takes at most this many decimals, whatever the asset carries (WETH has 18). */
const INPUT_DECIMALS = 8;
/** Stable assets show cents; others more. */
const STABLE_DIGITS = 2;
const VOLATILE_DIGITS = 6;
const STABLES = new Set(["USDC", "EURC"]);
/** Shares of a held balance offered as collateral. */
const QUARTER = 0.25;
const HALF = 0.5;
const WHOLE = 1;
const COLLATERAL_SHARES = [QUARTER, HALF, WHOLE] as const;
const PERCENT = 100;
const NO_COLLATERAL = "none";

export type BorrowPrefill = { action?: LendAction | undefined; asset?: string | undefined; amount?: string | undefined; collateral?: string | undefined };

type Step = "overview" | "amount" | "review";
type Collateral = { reserve: LendReserveView; share: number } | undefined;

const digitsFor = (reserve: LendReserveView) => Math.min(STABLES.has(reserve.asset) ? STABLE_DIGITS : VOLATILE_DIGITS, reserve.decimals);
const heldOf = (account: LendAccountView, reserveId: number) => account.held.find((entry) => entry.reserveId === reserveId);
const heldAmount = (account: LendAccountView, reserve: LendReserveView) => {
  const held = heldOf(account, reserve.reserveId);
  return held ? Number(formatUnits(BigInt(held.amount), held.decimals)) : 0;
};

/** The collateral most likely meant: the held asset the market values most (after the factor), not the loan's own. */
function inferCollateral(account: LendAccountView, loan: LendReserveView, named?: string): Collateral {
  const accepted = account.reserves.filter((reserve) => reserve.collateralFactor > 0 && reserve.reserveId !== loan.reserveId && heldAmount(account, reserve) > 0);
  const chosen = named ? accepted.find((reserve) => reserve.asset.toLowerCase() === named.toLowerCase()) : undefined;
  const best = chosen ?? accepted.sort((a, b) => heldAmount(account, b) * priceOf(b) * b.collateralFactor - heldAmount(account, a) * priceOf(a) * a.collateralFactor)[0];
  // With collateral already in, nothing new is assumed: the person adds some if they want more room.
  if (!best || (!chosen && account.weightedCollateralUsd > 0)) return undefined;
  return { reserve: best, share: COLLATERAL_SHARES[COLLATERAL_SHARES.length - 1]! };
}

export function BorrowScreen({ prefill }: { prefill: BorrowPrefill }) {
  const { t } = useT();
  const router = useRouter();
  const wide = useWide();
  const reduced = useReducedMotion();
  const { status } = useSession();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const account = useLendAccount();
  const controller = useLendOrder();
  const view = account.view;
  const loading = useHeldLoading(status === "account" && !view && !account.failed);

  const [step, setStep] = React.useState<Step>("overview");
  const [action, setAction] = React.useState<LendAction>("borrow");
  const [reserveId, setReserveId] = React.useState<number>();
  const [value, setValue] = React.useState("");
  const [all, setAll] = React.useState(false);
  const [collateral, setCollateral] = React.useState<Collateral>();
  const [creating, setCreating] = React.useState(false);

  const reserve = view?.reserves.find((entry) => entry.reserveId === reserveId);
  const intent = controller.intent;
  const settled = intent && (isIntentMoving(intent) || isIntentFinished(intent));

  const start = React.useCallback(
    (next: LendAction, target: LendReserveView, preset?: { amount?: string | undefined; all?: boolean; collateral?: string | undefined }) => {
      if (!view) return;
      setAction(next);
      setReserveId(target.reserveId);
      setValue(preset?.amount ?? "");
      setAll(Boolean(preset?.all));
      setCollateral(next === "borrow" ? inferCollateral(view, target, preset?.collateral) : undefined);
      setStep("amount");
    },
    [view],
  );

  const request = (): LendRequest | undefined => {
    if (!reserve || !view) return undefined;
    const put = collateral && action === "borrow" ? heldAmount(view, collateral.reserve) * collateral.share : 0;
    return {
      action,
      asset: reserve.asset,
      amount: all ? "all" : value,
      collateralAsset: put > 0 ? collateral!.reserve.asset : null,
      collateralAmount: put > 0 ? toInput(put, Math.min(collateral!.reserve.decimals, INPUT_DECIMALS)) : null,
    };
  };

  const review = async (override?: LendRequest) => {
    const body = override ?? request();
    if (!body) return;
    setCreating(true);
    try {
      if (intent && isIntentOpen(intent)) {
        const next = await controller.revise(body);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.lend.create(body);
        controller.set(fresh);
        setStep("review");
      }
    } catch {
      toast(t("lend.unavailable"));
    } finally {
      setCreating(false);
    }
  };

  // A prefilled action (the yield options, a token page, chat) opens its step once the account is read; with an
  // amount it goes straight to the ticket. On a desktop window with nothing named, the first loan is preselected.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !view?.available) return;
    const named = prefill.asset ? view.reserves.find((entry) => entry.asset.toLowerCase() === prefill.asset!.toLowerCase()) : undefined;
    if (named) {
      prefilled.current = true;
      const next = prefill.action ?? "borrow";
      start(next, named, { amount: prefill.amount, collateral: prefill.collateral });
      if (prefill.amount && next !== "borrow") void review({ action: next, asset: named.asset, amount: prefill.amount });
      return;
    }
    const first = view.reserves.find((entry) => entry.borrowable);
    if (wide && first) {
      prefilled.current = true;
      start("borrow", first);
    }
  }, [view?.available, wide]);

  const finished = intent ? isIntentFinished(intent) : false;
  React.useEffect(() => {
    if (finished) void account.refresh();
  }, [finished]);

  const toOverview = () => {
    controller.reset();
    setStep(wide ? "amount" : "overview");
    void account.refresh();
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (wide) return leave();
    if (settled && intent && !isIntentMoving(intent)) return toOverview();
    if (step === "overview") return leave();
    if (step === "review") return setStep("amount");
    setStep("overview");
  };

  const header = <PageHeader title={t("lend.borrowTitle")} subtitle={t("lend.subtitle")} onBack={back} trailing={<Mark entity="provider:aave" size={PROVIDER_MARK} />} />;
  const consent = <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />;

  let plain: React.ReactNode = null;
  if (status !== "account") plain = <EmptyState size="page" icon={LineChart} why={t("lendPolicy.SIGN_IN_REQUIRED")} action={{ label: t("policy.fixSignIn"), onPress: () => signIn.open() }} />;
  else if (view && !view.available)
    plain = (
      <EmptyState
        size="page"
        icon={LineChart}
        why={t("desktop.mainnetOnlyTitle")}
        detail={t("lend.mainnetOnly")}
        {...(networkSwitch.nextAvailable ? { action: { label: t("margin.switchToMainnet"), onPress: () => void networkSwitch.switchNetwork("mainnet") } } : {})}
      />
    );
  else if (!view) plain = account.failed ? <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void account.refresh()} stillWorks={t("desktop.lendFailedStill")} /> : loading ? <LoadingState shape="list" /> : null;
  if (plain || !view) {
    return (
      <View style={styles.page}>
        {header}
        <View style={styles.plain}>{plain}</View>
        {consent}
      </View>
    );
  }

  const overview = <Overview view={view} onStart={start} onRepay={(target) => void review({ action: "repay", asset: target.asset, amount: "all" }).then(() => setReserveId(target.reserveId))} />;
  const ticket =
    (step === "review" || settled) && intent ? (
      <LendTicket controller={controller} onEdit={() => setStep("amount")} onDone={toOverview} />
    ) : step === "amount" && reserve ? (
      <AmountStep view={view} reserve={reserve} action={action} value={value} all={all} collateral={collateral} busy={creating || controller.busy} onValue={setValue} onAll={setAll} onCollateral={setCollateral} onReview={() => void review()} />
    ) : null;

  if (wide) {
    return (
      <View style={styles.page}>
        {header}
        <Columns stage={overview} ticket={ticket ?? <LoadingState shape="detail" />} />
        {consent}
      </View>
    );
  }
  const visible = settled ? "status" : step;
  return (
    <View style={styles.page}>
      {header}
      <Animated.View key={visible} entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} exiting={reduced ? undefined : FadeOut.duration(TIMING.sheetExit)} style={styles.page}>
        <PhoneScroll>{ticket ?? overview}</PhoneScroll>
      </Animated.View>
      {consent}
    </View>
  );
}

function Overview({ view, onStart, onRepay }: { view: LendAccountView; onStart: (action: LendAction, reserve: LendReserveView) => void; onRepay: (reserve: LendReserveView) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const format = useLendFormat();
  const minHealth = LEND.minBorrowHealthBps / BPS;
  const warnHealth = LEND.warnHealthBps / BPS;
  const hasPosition = view.supplied.length > 0 || view.borrowed.length > 0;
  const borrowable = view.reserves.filter((entry) => entry.borrowable);
  return (
    <>
      {hasPosition ? (
        <Panel style={styles.panel}>
          <SectionLabel>{t("lend.yourPosition")}</SectionLabel>
          {view.borrowed.length > 0 ? <HealthGauge before={view.health} after={view.health} min={minHealth} warn={warnHealth} /> : null}
          {view.borrowed.map((entry) => {
            const target = view.reserves.find((candidate) => candidate.reserveId === entry.reserveId)!;
            return (
              <View key={`debt-${entry.reserveId}`} style={styles.line}>
                <Mark entity={marketEntity(target.address)} size={ROW_MARK} />
                <View style={styles.grow}>
                  <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("lend.youOwe", { amount: format.of(entry) })}</Text>
                  <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("lend.rateValue", { rate: format.percent(target.borrowApr, RATE_DIGITS) })}</Text>
                </View>
                <Button label={t("lend.repay")} size="sm" block={false} onPress={() => onRepay(target)} />
              </View>
            );
          })}
          {view.supplied.map((entry) => {
            const target = view.reserves.find((candidate) => candidate.reserveId === entry.reserveId)!;
            return (
              <View key={`in-${entry.reserveId}`} style={styles.line}>
                <Mark entity={marketEntity(target.address)} size={ROW_MARK} />
                <View style={styles.grow}>
                  <Text style={[TYPE.rowStrong, { color: color.ink }]}>{format.of(entry)}</Text>
                  <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{entry.collateral ? t("lend.asCollateral") : t("lend.earning", { rate: format.percent(target.supplyApr, RATE_DIGITS) })}</Text>
                </View>
                <Button label={t("lend.add")} size="sm" variant="secondary" block={false} disabled={heldAmount(view, target) <= 0} onPress={() => onStart("supply", target)} />
                <Button label={t("lend.withdraw")} size="sm" variant="secondary" block={false} onPress={() => onStart("withdraw", target)} />
              </View>
            );
          })}
          {view.borrowRoomUsd > 0 ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("lend.room", { amount: format.usd(view.borrowRoomUsd) })}</Text> : null}
        </Panel>
      ) : null}

      <View style={styles.group}>
        <SectionLabel>{t("lend.borrowWhat")}</SectionLabel>
        {borrowable.length === 0 ? (
          <EmptyState why={t("desktop.nothingToBorrow")} detail={t("desktop.nothingToBorrowWhy")} />
        ) : (
          <Panel>
            {borrowable.map((entry) => (
              <ListRow
                key={entry.reserveId}
                title={entry.asset}
                detail={entry.collateralFactor > 0 ? t("lend.alsoCollateral", { percent: format.percent(entry.collateralFactor, 0) }) : t("lend.notCollateral")}
                leading={<Mark entity={marketEntity(entry.address)} size={MARK} />}
                trailing={
                  <View style={styles.end}>
                    <Text style={[TYPE.rowAmount, { color: color.ink }]}>{format.percent(entry.borrowApr, RATE_DIGITS)}</Text>
                    <Text style={[TYPE.meta, { color: color.text3 }]}>{t("lend.aYear")}</Text>
                  </View>
                }
                onPress={() => onStart("borrow", entry)}
              />
            ))}
          </Panel>
        )}
        <Text style={[TYPE.caption, { color: color.text3 }]}>{t("lend.howItWorks", { health: format.health(minHealth) })}</Text>
      </View>
    </>
  );
}

function AmountStep(props: {
  view: LendAccountView;
  reserve: LendReserveView;
  action: LendAction;
  value: string;
  all: boolean;
  collateral: Collateral;
  busy: boolean;
  onValue: (value: string) => void;
  onAll: (all: boolean) => void;
  onCollateral: (collateral: Collateral) => void;
  onReview: () => void;
}) {
  const { view, reserve, action, value, all, collateral, busy } = props;
  const { t } = useT();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const format = useLendFormat();
  const amount = Number(value || 0);
  const put = collateral ? { reserve: collateral.reserve, amount: heldAmount(view, collateral.reserve) * collateral.share } : undefined;
  const owed = view.borrowed.find((entry) => entry.reserveId === reserve.reserveId);
  const inThere = view.supplied.find((entry) => entry.reserveId === reserve.reserveId);
  const health = projectHealth(view, { action, reserve, amount, all, collateral: put });
  const minHealth = LEND.minBorrowHealthBps / BPS;
  const debtShown = action === "borrow" || action === "repay" || view.debtUsd > 0;
  const accepted = view.reserves.filter((entry) => entry.collateralFactor > 0 && entry.reserveId !== reserve.reserveId && heldAmount(view, entry) > 0);
  const digits = Math.min(reserve.decimals, INPUT_DECIMALS);

  // What "Max" means here: the most that keeps health at the floor (borrow), the wallet's balance (supply), or
  // everything (repay, withdraw), sent as "all" so the interest to the block is included.
  const max =
    action === "borrow"
      ? { label: t("lend.max"), apply: () => props.onValue(toInput(maxBorrow(view, reserve, put), digitsFor(reserve))) }
      : action === "supply"
        ? heldAmount(view, reserve) > 0
          ? { label: t("lend.max"), apply: () => props.onValue(toInput(heldAmount(view, reserve), digits)) }
          : undefined
        : (action === "repay" ? owed : inThere)
          ? { label: t("lend.all"), apply: () => props.onAll(true) }
          : undefined;
  const limitLine =
    action === "repay" && owed
      ? t("lend.owedLine", { amount: format.of(owed) })
      : action === "withdraw" && inThere
        ? t("lend.inLine", { amount: format.of(inThere) })
        : action === "supply" || action === "repay"
          ? t("lend.walletLine", { amount: heldOf(view, reserve.reserveId) ? format.of(heldOf(view, reserve.reserveId)!) : `0 ${reserve.asset}` })
          : t("lend.rateLine", { rate: format.percent(reserve.borrowApr, RATE_DIGITS) });
  const ready = all || amount > 0;
  const tooMuch = health !== null && health < minHealth && action === "borrow";

  return (
    <View style={[styles.group, { paddingBottom: insets.bottom }]}>
      <View style={styles.line}>
        <Mark entity={marketEntity(reserve.address)} size={MARK} />
        <Text style={[TYPE.rowTitle, styles.grow, { color: color.ink }]}>{t(`lend.title_${action}`, { asset: reserve.asset })}</Text>
        {max ? <Button label={max.label} size="sm" variant={all ? "primary" : "secondary"} block={false} onPress={max.apply} /> : null}
      </View>
      {all ? (
        <Text style={[TYPE.displayBalance, { color: color.ink }]}>{t("lend.all")}</Text>
      ) : (
        <TicketAmount
          label={t(`lend.title_${action}`, { asset: reserve.asset })}
          value={value}
          onChange={(next) => {
            props.onAll(false);
            props.onValue(next);
          }}
          decimals={reserve.decimals}
          fraction={digits}
          prefix=""
          suffix={reserve.asset}
          note={limitLine}
        />
      )}

      {action === "borrow" ? (
        <View style={styles.group}>
          <SectionLabel>{t("lend.against")}</SectionLabel>
          {accepted.length === 0 && view.weightedCollateralUsd <= 0 ? (
            <Text style={[TYPE.body, { color: color.ink }]}>{t("lend.noCollateral")}</Text>
          ) : (
            <>
              <ChoiceChips<string>
                label={t("lend.against")}
                value={collateral ? String(collateral.reserve.reserveId) : NO_COLLATERAL}
                onChange={(picked) => {
                  const entry = accepted.find((candidate) => String(candidate.reserveId) === picked);
                  props.onCollateral(entry ? { reserve: entry, share: collateral?.share ?? COLLATERAL_SHARES[COLLATERAL_SHARES.length - 1]! } : undefined);
                }}
                options={[...(view.weightedCollateralUsd > 0 ? [{ value: NO_COLLATERAL, label: t("lend.alreadyIn") }] : []), ...accepted.map((entry) => ({ value: String(entry.reserveId), label: entry.asset }))]}
              />
              {collateral && put ? (
                <>
                  <ChoiceChips<number>
                    label={t("lend.against")}
                    value={collateral.share}
                    onChange={(share) => props.onCollateral({ ...collateral, share })}
                    options={COLLATERAL_SHARES.map((share) => ({ value: share, label: `${Math.round(share * PERCENT)}%` }))}
                  />
                  <Text style={[TYPE.caption, { color: color.text3 }]}>
                    {t("lend.puttingIn", { amount: `${toInput(put.amount, digitsFor(put.reserve))} ${put.reserve.asset}`, usd: format.usd(put.amount * priceOf(put.reserve)) })}
                  </Text>
                </>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {debtShown ? <HealthGauge before={view.health} after={health} min={minHealth} warn={LEND.warnHealthBps / BPS} compact /> : null}

      {!ready ? (
        <BlockedCta blocker={{ label: t("send.enterAmount") }} />
      ) : tooMuch ? (
        <BlockedCta blocker={{ label: t("lend.tooMuch"), reason: t("lend.howItWorks", { health: format.health(minHealth) }) }} />
      ) : (
        <Button label={busy ? t("common.loading") : t("lend.review")} loading={busy} onPress={props.onReview} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  plain: { flex: 1, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
  panel: { gap: SPACE.lg, padding: SPACE.lg },
  group: { gap: SPACE.md },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  end: { alignItems: "flex-end" },
});
