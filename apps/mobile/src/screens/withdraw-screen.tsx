// Withdraw (money-out.md "Withdraw (any asset, anywhere)", G7; surfaces.md Withdraw), on the Senryo kit: what (one
// asset, several, or everything, each as itself or as cash), where (My places, an exchange by its logo, my other
// wallet, my bank via an exchange), the route per asset as lines the api plans (transfer / bridge / convert first, what
// arrives, why a line cannot go), then the slide → Face ID once → the tracker → the receipt. A first-time destination
// gets a small test first. The destination is saved to My places when it worked, so the next withdrawal is a tap. The
// exit kit (pause, revoke every permission, withdraw everything) sits under it, one place to leave from.
// Phone: one column. Desktop: two columns, what and where (and the exit kit) on the stage, the ticket beside them
// (the total as the one hero, the test, the slide, then the tracker and the receipt in place).
// States: guests sign in; the plan is a named wait while it is drawn; a failed plan says what still works with Retry;
// a stopped withdrawal says whether money moved and offers "Finish it" (nothing is re-sent on its own).
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toast } from "sonner-native";

import type { ExchangeView, PlaceView, WithdrawalStepView, WithdrawAssetInput, WithdrawLegView, WithdrawPlanInput, WithdrawPlanView } from "@kawase/api-client";
import { WITHDRAW_TEST_AMOUNT } from "@kawase/config";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { BlockedCta, TxFailureCard } from "@/components/tx";
import { Button, EmptyState, ErrorState, Icon, KeyValue, LoadingState, Panel, RADIUS, SectionLabel, Segmented, SIZE, SlideToConfirm, SPACE, TYPE, useTheme, WaitingText } from "@/components/kit";
import { ArrowUpRight, X } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { money as fiat, tokenAmount, USD_FX } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { LiveNumber, Note, RealMoney } from "@/trade/bits";
import { openExplorer } from "@/trade/intent-cta";
import { Columns, PageHeader, PhoneScroll } from "@/trade/page-frame";
import { useDestinationName, useLegRoute, useStepProblem, useStepTitle, useWithdrawReason } from "@/withdraw/copy";
import { DestinationPicker, type DestinationInput } from "@/withdraw/destination-picker";
import { ExitKit } from "@/withdraw/exit-kit";
import { WithdrawTracker, type TrackStep } from "@/withdraw/tracker";
import { useWithdrawRun } from "@/withdraw/use-withdraw-run";

const LINE_MARK = 36;
const HERO_H = 44;
const PLAN_DEBOUNCE_MS = 350;
const DECIMAL = /^\d*\.?\d*$/;
const USDC_DECIMALS = 6;

export type WithdrawPrefill = { assets: WithdrawAssetInput[]; everything: boolean; destination: DestinationInput; resume?: string | undefined };

type Line = { asset: string; amount: string | null; as: "itself" | "cash" | null };

const sameLines = (a: Line[], b: Line[]) => JSON.stringify(a) === JSON.stringify(b);
const linesFromPlan = (plan: WithdrawPlanView): Line[] => plan.legs.map((leg) => ({ asset: leg.token.address, amount: leg.max ? null : leg.amountText, as: leg.as }));

/** No browser focus box on a bare field: its plate carries focus. */
const WEB_FIELD = { outlineStyle: "none" } as unknown as object;

export function WithdrawScreen({ prefill }: { prefill: WithdrawPrefill }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const wide = useWide();
  const { locale } = useLocale();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { portfolio } = usePortfolio();
  const destinationName = useDestinationName();
  const legRoute = useLegRoute();
  const reasonText = useWithdrawReason();
  const stepTitle = useStepTitle();
  const stepProblem = useStepProblem();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const account = status === "account";
  const fx = portfolio?.fx ?? USD_FX;

  const [lines, setLines] = React.useState<Line[]>(() => prefill.assets.map((entry) => ({ asset: entry.asset, amount: entry.amount && entry.amount !== "max" ? entry.amount : null, as: entry.as ?? null })));
  const [everything, setEverything] = React.useState(prefill.everything);
  const [destination, setDestination] = React.useState<DestinationInput>(prefill.destination);
  const [plan, setPlan] = React.useState<WithdrawPlanView>();
  const [planning, setPlanning] = React.useState(false);
  const [planFailed, setPlanFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [places, setPlaces] = React.useState<PlaceView[]>([]);
  const [exchanges, setExchanges] = React.useState<ExchangeView[]>([]);
  const [chains, setChains] = React.useState<{ key: string; name: string; chainId: number | null }[]>([]);
  const [picking, setPicking] = React.useState(false);
  const planRun = React.useRef(0);

  // The tables (public) and My places (the person's own), per network.
  React.useEffect(() => {
    void api.withdrawals
      .exchanges()
      .then((result) => setExchanges(result.exchanges))
      .catch(() => undefined);
    void api.withdrawals
      .chains()
      .then((result) => setChains(result.chains))
      .catch(() => undefined);
    if (account)
      void api.places
        .list()
        .then((result) => setPlaces(result.places))
        .catch(() => undefined);
  }, [account, network]);

  const input: WithdrawPlanInput = React.useMemo(
    () => ({
      assets: lines.map((line) => ({ asset: line.asset, amount: line.amount ?? "max", as: line.as })),
      everything: everything || undefined,
      place: destination.place ?? null,
      exchange: destination.exchange ?? null,
      chain: destination.chain ?? null,
      address: destination.address || null,
    }),
    [lines, everything, destination],
  );

  // The plan, again whenever what or where changes (the api decides each line's route and reason).
  React.useEffect(() => {
    if (!account) return undefined;
    const run = ++planRun.current;
    setPlanning(true);
    const timer = setTimeout(() => {
      api.withdrawals
        .plan(input)
        .then(({ plan: next }) => {
          if (run !== planRun.current) return;
          setPlan(next);
          setPlanFailed(false);
          // "Everything" becomes the lines it chose, so each can be edited or removed.
          if (everything) {
            const chosen = linesFromPlan(next);
            setEverything(false);
            setLines((current) => (sameLines(current, chosen) ? current : chosen));
          }
        })
        .catch(() => run === planRun.current && setPlanFailed(true))
        .finally(() => run === planRun.current && setPlanning(false));
    }, PLAN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [account, everything, input, network, attempt]);

  const where = destination.place || destination.exchange || destination.chain ? destinationName(plan?.destination) : "";
  const run = useWithdrawRun();
  const { load } = run;
  // Opened from Activity or a restart ("Finish it"): the server's record of where it stands.
  React.useEffect(() => {
    if (!prefill.resume || !account) return;
    void load(prefill.resume).catch(() => toast(t("withdraw.planFailed")));
  }, [prefill.resume, account, load, t]);
  const [testing, setTesting] = React.useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // A line is found by its token (an address, or the symbol it was asked by), never by position: the plan leaves out
  // what it cannot resolve.
  const lineOf = (leg: WithdrawLegView) => (line: Line) => line.asset.toLowerCase() === leg.token.address.toLowerCase() || line.asset.toLowerCase() === leg.token.symbol.toLowerCase();
  const setLine = (leg: WithdrawLegView, patch: Partial<Line>) => setLines((current) => current.map((line) => (lineOf(leg)(line) ? { ...line, ...patch } : line)));
  const removeLine = (leg: WithdrawLegView) => setLines((current) => current.filter((line) => !lineOf(leg)(line)));

  const legs = plan?.legs ?? [];
  const blockedLine = legs.some((leg) => leg.status === "blocked");
  const ready = Boolean(plan && !plan.blocking && legs.length > 0 && !blockedLine && plan.destination?.address);
  const started = run.phase !== "idle";
  const testAmount = WITHDRAW_TEST_AMOUNT[network];

  const said = (outcome: string) => {
    if (outcome === "declined") toast(t("send.faceIdCancelled"));
    if (outcome === "unavailable") toast(t("send.approvalUnavailable"));
    if (outcome === "failed") toast(t("withdraw.planFailed"));
  };
  const confirm = async () => {
    if (!plan) return;
    setTesting(false);
    const outcome = await run.start(input, t("withdraw.faceId", { count: legs.length, to: where }), t("common.cancel"));
    said(outcome);
  };
  /** A first-time destination: a small USDC test goes first (money-out.md "What if"), then the rest. */
  const sendTest = async () => {
    if (!plan) return;
    setTesting(true);
    const test: WithdrawPlanInput = { ...input, everything: undefined, assets: [{ asset: "USDC", amount: testAmount, as: "itself" }] };
    const outcome = await run.start(test, t("withdraw.testFaceId", { amount: testAmount, to: where }), t("common.cancel"));
    said(outcome);
  };
  const finish = async () => {
    const outcome = await run.resume(t("withdraw.finishFaceId", { to: where }), t("common.cancel"));
    said(outcome);
  };
  const afterTest = () => {
    run.reset();
    setTesting(false);
    // The plan again: the destination is no longer first-time.
    setLines((current) => [...current]);
  };

  const record = run.withdrawal;
  const recordName = record ? destinationName(record.destination) : where;
  // The money cue once per finished withdrawal (its id keeps a remount from replaying it).
  React.useEffect(() => {
    if (run.phase === "done" && record) fire("filled", { sound: "send", identity: `withdraw:${record.id}` });
    if (run.phase === "stopped" && record) fire("fail", { sound: "error", identity: `withdraw:${record.id}:stopped` });
  }, [record, run.phase]);
  const stepAmount = (step: WithdrawalStepView) => {
    const units = step.moved ?? step.amount;
    return units === null ? step.token.symbol : tokenAmount(units, step.token.decimals, step.token.symbol, locale);
  };
  const chainName = record?.destination.chain.name ?? plan?.destination?.chain.name ?? "";
  // Steps signed together (one transaction on Arc): said once under the tracker.
  const batchedCount = (record?.steps ?? []).filter((step) => step.batched).length;
  const track: TrackStep[] = (record?.steps ?? []).map((step) => ({
    id: step.id,
    title: stepTitle(step, stepAmount(step), recordName, chainName),
    description:
      step.state === "failed"
        ? stepProblem(step, network)
        : step.arriving
          ? t("withdraw.arriving", { chain: chainName })
          : step.kind === "swap" && step.received
            ? t("withdraw.converted", { amount: tokenAmount(step.received, USDC_DECIMALS, "USDC", locale) })
            : undefined,
    state: step.state,
    explorerUrl: step.fillUrl ?? step.explorerUrl,
  }));
  const moved = (record?.steps ?? []).some((step) => step.state === "done");

  if (!account) {
    return (
      <View style={styles.page}>
        <PageHeader title={t("withdraw.title")} onBack={leave} />
        <View style={styles.plain}>
          <EmptyState size="page" icon={ArrowUpRight} why={t("withdraw.signInTitle")} detail={t("withdraw.signInBody")} action={{ label: t("signIn.title"), onPress: () => signIn.open() }} />
        </View>
      </View>
    );
  }

  // The run: the tracker, then Finish it, the test's result, or the receipt.
  const runView = started ? (
    <View style={styles.group}>
      <View style={styles.hero}>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{testing ? t("withdraw.testTo") : t("withdraw.toLabel")}</Text>
        <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{recordName}</Text>
      </View>
      {run.phase === "confirming" ? <WaitingText timeoutMs={null}>{t("desktop.confirming")}</WaitingText> : null}
      {track.length > 0 ? <WithdrawTracker steps={track} onOpen={openExplorer} /> : null}
      {batchedCount > 1 ? <Note tone="quiet">{t("withdraw.oneTransaction", { count: batchedCount })}</Note> : null}
      {run.phase === "stopped" && record ? (
        <>
          <TxFailureCard state={{ kind: "failed", diagnosis: { kind: "unknown", retryable: false, technical: record.status }, moneyMoved: moved ? "yes" : "no", txHash: null }} />
          <Button label={t("withdraw.finishIt")} onPress={() => void finish()} />
        </>
      ) : null}
      {run.phase === "done" && testing ? (
        <Panel style={styles.panel}>
          <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("withdraw.testDoneTitle")}</Text>
          <Text style={[TYPE.body, { color: color.text2 }]}>{t("withdraw.testDoneBody", { to: recordName })}</Text>
          <Button label={t("withdraw.testContinue")} onPress={afterTest} />
        </Panel>
      ) : null}
      {run.phase === "done" && !testing ? (
        <Panel style={styles.panel}>
          <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("withdraw.doneTitle")}</Text>
          <KeyValue label={t("withdraw.toLabel")} value={recordName} />
          {(record?.steps ?? []).map((step) => (
            <KeyValue key={step.id} label={stepTitle(step, stepAmount(step), recordName, chainName)} value={t("withdraw.stepDone")} />
          ))}
          {record?.totalUsd ? <KeyValue label={t("withdraw.total")} value={fiat(record.totalUsd, fx, locale)} /> : null}
          <Button label={t("common.done")} onPress={leave} />
        </Panel>
      ) : null}
    </View>
  ) : null;

  // What stops the slide, as one blocker with its fix (or the named wait while the plan is drawn).
  const blocker = planning
    ? { label: t("desktop.planning"), busy: true }
    : planFailed
      ? { label: t("common.retry"), reason: t("withdraw.planFailed"), fix: { kind: "retry" as const } }
      : legs.length === 0
        ? { label: t("desktop.withdrawWhat") }
        : !plan?.destination?.address
          ? { label: t("desktop.withdrawWhere") }
          : blockedLine
            ? { label: t("withdraw.removeBlocked") }
            : plan?.blocking && plan.blocking !== "no_destination"
              ? { label: reasonText(plan.blocking, { exchange: plan.destination?.exchange?.name, chain: plan.destination?.chain.name }) }
              : null;

  const ticket = runView ?? (
    <View style={styles.group}>
      {!testnet ? <RealMoney /> : null}
      <View style={styles.hero}>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{where ? t("desktop.withdrawTotalTo", { to: where }) : t("withdraw.total")}</Text>
        {plan?.totalUsd ? <LiveNumber text={fiat(plan.totalUsd, fx, locale)} value={plan.totalUsd} height={HERO_H} /> : <Text style={[TYPE.displayBalance, { color: color.text3 }]}>{fiat(0, fx, locale)}</Text>}
      </View>
      {ready && plan?.destination?.firstTime ? (
        <Panel style={styles.panel}>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("withdraw.firstTimeTitle")}</Text>
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("withdraw.firstTimeBody", { amount: testAmount })}</Text>
          <Button label={t("withdraw.sendTest", { amount: testAmount })} variant="secondary" onPress={() => void sendTest()} />
        </Panel>
      ) : null}
      {blocker ? (
        <BlockedCta blocker={blocker} {...(planFailed ? { onFix: () => setAttempt((value) => value + 1), fixLabel: t("common.retry") } : {})} />
      ) : (
        <SlideToConfirm label={t("withdraw.slide")} tone="primary" resetKey={JSON.stringify(input)} onConfirm={() => void confirm()} />
      )}
      <Note tone="quiet">{t("withdraw.faceIdNote")}</Note>
    </View>
  );

  const what = (
    <View style={styles.group}>
      <View style={styles.line}>
        <SectionLabel style={styles.grow}>{t("withdraw.what")}</SectionLabel>
        <Button label={t("withdraw.everything")} variant="secondary" size="sm" block={false} onPress={() => setEverything(true)} />
        <Button label={t("withdraw.add")} variant="secondary" size="sm" block={false} leading={<Icon icon={Plus} size={SIZE.iconSm} />} onPress={() => setPicking(true)} />
      </View>
      {legs.length === 0 ? (
        planning ? (
          <LoadingState shape="row" />
        ) : planFailed ? (
          <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => setAttempt((value) => value + 1)} stillWorks={t("withdraw.planFailed")} />
        ) : (
          <EmptyState why={t("withdraw.nothingChosen")} action={{ label: t("withdraw.everything"), onPress: () => setEverything(true) }} secondary={{ label: t("withdraw.add"), onPress: () => setPicking(true) }} size="inline" />
        )
      ) : (
        legs.map((leg) => (
          <LegRow
            key={leg.token.address}
            leg={leg}
            amount={lines.find(lineOf(leg))?.amount ?? null}
            route={legRoute(leg)}
            reason={leg.reason ? reasonText(leg.reason, { exchange: plan?.destination?.exchange?.name, symbol: leg.token.symbol, chain: leg.receive.chain, network: plan?.destination?.exchange?.networkLabel }) : undefined}
            value={leg.valueUsd !== null ? fiat(leg.valueUsd, fx, locale) : undefined}
            locale={locale}
            onAmount={(text) => setLine(leg, { amount: text === "" ? null : text })}
            onAs={(as) => setLine(leg, { as })}
            onRemove={() => removeLine(leg)}
            // To the person's own wallet on another chain, on mainnet: the cross-chain routes take it as itself.
            onMove={
              !testnet && plan?.destination?.address && plan.destination.chain.key !== "arc" && !plan.destination.exchange
                ? () =>
                    router.push({
                      pathname: "/move",
                      params: { direction: "out", chain: plan.destination!.chain.key, asset: leg.token.address, amount: leg.amountText, recipient: plan.destination!.address! },
                    })
                : undefined
            }
          />
        ))
      )}
    </View>
  );

  const whereView = (
    <View style={styles.group}>
      <SectionLabel>{t("withdraw.where")}</SectionLabel>
      <DestinationPicker
        network={network}
        value={destination}
        onChange={setDestination}
        places={places}
        exchanges={exchanges}
        chains={chains}
        chosen={plan?.destination}
        onForget={(place) => {
          setPlaces((current) => current.filter((entry) => entry.id !== place.id));
          void api.places.remove(place.id).catch(() => undefined);
        }}
      />
    </View>
  );

  const exitKit = <ExitKit onEverything={() => setEverything(true)} />;
  const picker = (
    <AssetPickerSheet
      open={picking}
      onClose={() => setPicking(false)}
      title={t("withdraw.addAsset")}
      mode="held"
      onSelect={({ token }) => {
        setPicking(false);
        setLines((current) => {
          const base = everything && plan ? linesFromPlan(plan) : current;
          return base.some((line) => line.asset.toLowerCase() === token.address.toLowerCase()) ? base : [...base, { asset: token.address, amount: null, as: null }];
        });
        setEverything(false);
      }}
      unavailable={(token) => (token.kind === "permissioned" ? t("tokenPage.n_permissioned") : undefined)}
    />
  );

  return (
    <View style={styles.page}>
      <PageHeader title={t("withdraw.title")} onBack={leave} />
      {wide ? (
        <Columns
          stage={
            <>
              {what}
              {whereView}
              {exitKit}
            </>
          }
          ticket={ticket}
        />
      ) : (
        <PhoneScroll>
          {runView ?? (
            <>
              {what}
              {whereView}
              {ticket}
              {exitKit}
            </>
          )}
        </PhoneScroll>
      )}
      {picker}
    </View>
  );
}

type LegRowProps = {
  leg: WithdrawLegView;
  amount: string | null;
  route: string;
  reason: string | undefined;
  value: string | undefined;
  locale: string;
  onAmount: (text: string) => void;
  onAs: (as: "itself" | "cash") => void;
  onRemove: () => void;
  /** The batch can't bridge this token, but the cross-chain routes carry it as itself (mainnet): Move, prefilled. */
  onMove?: (() => void) | undefined;
};

/** One asset's line (21st ravikatiyar162 "Asset Card" 7945): mark, amount (Max by default), as itself or as cash, the route, why. */
function LegRow({ leg, amount, route, reason, value, locale, onAmount, onAs, onRemove, onMove }: LegRowProps) {
  const { t } = useT();
  const { color } = useTheme();
  const cashable = leg.canGoAsCash || leg.as === "cash";
  const offerCash = leg.canGoAsCash && (leg.reason === "convert_first" || leg.reason === "exchange_not_accepted");
  return (
    <Panel style={[styles.panel, leg.status === "blocked" ? { backgroundColor: color.destructiveWash } : leg.status === "warning" ? { backgroundColor: color.warnWash } : null]}>
      <View style={styles.line}>
        <TokenMark token={leg.token} size={LINE_MARK} />
        <View style={styles.grow}>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{leg.token.symbol}</Text>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("withdraw.held", { amount: tokenAmount(leg.balance, leg.token.decimals, leg.token.symbol, locale) })}</Text>
        </View>
        <TextInput
          accessibilityLabel={t("withdraw.amountOf", { symbol: leg.token.symbol })}
          value={amount ?? ""}
          onChangeText={(text) => {
            const next = text.replace(",", ".");
            if (DECIMAL.test(next)) onAmount(next);
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={t("withdraw.max")}
          placeholderTextColor={color.text3}
          style={[TYPE.rowAmount, styles.amount, { color: color.ink, backgroundColor: color.input }, Platform.OS === "web" ? WEB_FIELD : null]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t("withdraw.removeLine", { symbol: leg.token.symbol })} hitSlop={SPACE.md} onPress={onRemove}>
          <Icon icon={X} size={SIZE.iconSm} tint={color.text3} />
        </Pressable>
      </View>
      {cashable ? (
        <Segmented<"itself" | "cash">
          label={t("withdraw.youReceive")}
          value={leg.as}
          onChange={onAs}
          options={[
            { value: "itself", label: t("withdraw.asItself", { symbol: leg.token.symbol }) },
            { value: "cash", label: t("withdraw.asCash") },
          ]}
        />
      ) : null}
      <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{route}</Text>
      <KeyValue
        label={t("withdraw.youReceive")}
        value={`${leg.receive.amountText ? `${leg.as === "cash" ? "≈ " : ""}${leg.receive.amountText} ${leg.receive.symbol}` : leg.receive.symbol}${value ? ` · ${value}` : ""}`}
      />
      {reason ? <Note tone={leg.status === "blocked" || leg.status === "warning" ? "warn" : "quiet"}>{reason}</Note> : null}
      {onMove && leg.reason === "convert_first" ? <Button label={t("withdraw.moveAsItself", { symbol: leg.token.symbol })} variant="secondary" size="sm" onPress={onMove} /> : null}
      {offerCash ? <Button label={t("withdraw.sendAsCash")} variant="secondary" size="sm" onPress={() => onAs("cash")} /> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  plain: { flex: 1, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
  group: { gap: SPACE.md },
  hero: { gap: SPACE.xxs },
  panel: { gap: SPACE.md, padding: SPACE.lg },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  amount: { minWidth: 88, minHeight: SIZE.chipHeight, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, textAlign: "right" },
});
