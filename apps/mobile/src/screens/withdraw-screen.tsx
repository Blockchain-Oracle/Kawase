// Withdraw (money-out.md "Withdraw (any asset, anywhere)", G7; surfaces.md Withdraw): what (one asset, several, or
// everything — each as itself or as cash), where (My places, an exchange by its logo, my other wallet, my bank via
// an exchange), the route per asset as lines the api plans (transfer / bridge / convert first, what arrives, why a
// line cannot go), then slide → Face ID once → the tracker (21st Process Timeline) → the receipt. The destination is
// saved to My places when it worked, so the next withdrawal is a tap.
import { useRouter } from "expo-router";
import { ArrowRight, ChevronLeft, ExternalLink, Plus, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { ExchangeView, PlaceView, WithdrawalStepView, WithdrawAssetInput, WithdrawLegView, WithdrawPlanInput, WithdrawPlanView } from "@kawase/api-client";
import { WITHDRAW_TEST_AMOUNT } from "@kawase/config";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { ProcessTimeline, type TimelineStep } from "@kawase/ui-native/components/process-timeline";
import { ReceiptCard } from "@kawase/ui-native/components/receipt-card";
import { SlideToConfirm } from "@kawase/ui-native/components/slide-to-confirm";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { confirmedFeedback } from "@/feedback/feedback";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { slideHaptic } from "@/margin/haptics";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { money as fiat, tokenAmount, USD_FX } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useDestinationName, useLegRoute, useStepProblem, useStepTitle, useWithdrawReason } from "@/withdraw/copy";
import { DestinationPicker, type DestinationInput } from "@/withdraw/destination-picker";
import { useWithdrawRun } from "@/withdraw/use-withdraw-run";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 32;
const LINE_MARK = 36;
const PLAN_DEBOUNCE_MS = 350;
const DECIMAL = /^\d*\.?\d*$/;
const USDC_DECIMALS = 6;

export type WithdrawPrefill = { assets: WithdrawAssetInput[]; everything: boolean; destination: DestinationInput; resume?: string | undefined };

type Line = { asset: string; amount: string | null; as: "itself" | "cash" | null };

const sameLines = (a: Line[], b: Line[]) => JSON.stringify(a) === JSON.stringify(b);
const linesFromPlan = (plan: WithdrawPlanView): Line[] => plan.legs.map((leg) => ({ asset: leg.token.address, amount: leg.max ? null : leg.amountText, as: leg.as }));

export function WithdrawScreen({ prefill }: { prefill: WithdrawPrefill }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { locale, rtl } = useLocale();
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
  const [places, setPlaces] = React.useState<PlaceView[]>([]);
  const [exchanges, setExchanges] = React.useState<ExchangeView[]>([]);
  const [chains, setChains] = React.useState<{ key: string; name: string; chainId: number | null }[]>([]);
  const [picking, setPicking] = React.useState(false);
  const planRun = React.useRef(0);

  // The tables (public) and My places (the person's own), per network.
  React.useEffect(() => {
    void api.withdrawals.exchanges().then((result) => setExchanges(result.exchanges)).catch(() => undefined);
    void api.withdrawals.chains().then((result) => setChains(result.chains)).catch(() => undefined);
    if (account) void api.places.list().then((result) => setPlaces(result.places)).catch(() => undefined);
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
          // "Everything" becomes the lines it chose, so each can be edited or removed.
          if (everything) {
            const chosen = linesFromPlan(next);
            setEverything(false);
            setLines((current) => (sameLines(current, chosen) ? current : chosen));
          }
        })
        .catch(() => run === planRun.current && toast(t("withdraw.planFailed")))
        .finally(() => run === planRun.current && setPlanning(false));
    }, PLAN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [account, everything, input, network, t]);

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
    if (outcome === "done") void confirmedFeedback(`withdraw:${plan.legs.map((leg) => leg.token.address).join(",")}:${Date.now()}`);
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
  const stepAmount = (step: WithdrawalStepView) => {
    const units = step.moved ?? step.amount;
    return units === null ? step.token.symbol : tokenAmount(units, step.token.decimals, step.token.symbol, locale);
  };
  const chainName = record?.destination.chain.name ?? plan?.destination?.chain.name ?? "";
  const timeline: TimelineStep[] = (record?.steps ?? []).map((step) => ({
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
    trailing: step.explorerUrl ? (
      <Pressable accessibilityRole="link" accessibilityLabel={t("withdraw.viewTx")} hitSlop={10} onPress={() => void Linking.openURL(step.fillUrl ?? step.explorerUrl!)}>
        <Icon as={ExternalLink} className="text-muted-foreground size-4" />
      </Pressable>
    ) : undefined,
  }));

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("withdraw.title")}
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }} keyboardShouldPersistTaps="handled">
        {!account ? (
          <View className="bg-card border-border gap-3 rounded-3xl border p-5">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("withdraw.signInTitle")}</Text>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("withdraw.signInBody")}</Text>
            <Button onPress={() => signIn.open()}>
              <Text>{t("signIn.title")}</Text>
            </Button>
          </View>
        ) : started ? (
          <View className="gap-5">
            <View className="gap-1">
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{testing ? t("withdraw.testTo") : t("withdraw.toLabel")}</Text>
              <Text className={cn("text-foreground text-xl font-semibold", TEXT_START)}>{recordName}</Text>
            </View>
            <ProcessTimeline steps={timeline} spinnerColor={colors.foreground} />
            {run.phase === "stopped" && record ? (
              <Button onPress={() => void finish()}>
                <Text>{t("withdraw.finishIt")}</Text>
              </Button>
            ) : null}
            {run.phase === "done" && testing ? (
              <View className="bg-card border-border gap-3 rounded-3xl border p-4">
                <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("withdraw.testDoneTitle")}</Text>
                <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("withdraw.testDoneBody", { to: recordName })}</Text>
                <Button onPress={afterTest}>
                  <Text>{t("withdraw.testContinue")}</Text>
                </Button>
              </View>
            ) : null}
            {run.phase === "done" && !testing ? (
              <ReceiptCard
                title={t("withdraw.doneTitle")}
                badge={testnet ? t("network.arcTestnet") : t("network.arc")}
                details={[
                  { label: t("withdraw.toLabel"), value: recordName, isBold: true },
                  ...(record?.steps ?? []).map((step) => ({ label: stepTitle(step, stepAmount(step), recordName, chainName), value: t("withdraw.stepDone") })),
                  ...(record?.totalUsd ? [{ label: t("withdraw.total"), value: fiat(record.totalUsd, fx, locale), isBold: true }] : []),
                ]}
                buttonText={t("common.done")}
                onAction={leave}
              />
            ) : null}
          </View>
        ) : (
          <>
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className={cn("text-foreground text-lg font-semibold", TEXT_START)}>{t("withdraw.what")}</Text>
                <View className="flex-row gap-2">
                  <Button variant="secondary" size="sm" onPress={() => setEverything(true)}>
                    <Text>{t("withdraw.everything")}</Text>
                  </Button>
                  <Button variant="secondary" size="sm" accessibilityLabel={t("withdraw.addAsset")} onPress={() => setPicking(true)}>
                    <Icon as={Plus} className="size-4" />
                    <Text>{t("withdraw.add")}</Text>
                  </Button>
                </View>
              </View>
              {legs.length === 0 ? (
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{planning ? t("common.loading") : t("withdraw.nothingChosen")}</Text>
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
                  />
                ))
              )}
            </View>

            <View className="gap-3">
              <Text className={cn("text-foreground text-lg font-semibold", TEXT_START)}>{t("withdraw.where")}</Text>
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
              {plan?.blocking && plan.blocking !== "no_destination" ? (
                <Text className={cn("text-destructive text-sm leading-5", TEXT_START)}>{reasonText(plan.blocking, { exchange: plan.destination?.exchange?.name, chain: plan.destination?.chain.name })}</Text>
              ) : null}
            </View>

            {legs.length > 0 ? (
              <View className="gap-3">
                {plan?.totalUsd ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted-foreground text-sm">{t("withdraw.total")}</Text>
                    <Text className="text-foreground font-display text-lg font-bold">{fiat(plan.totalUsd, fx, locale)}</Text>
                  </View>
                ) : null}
                {blockedLine ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("withdraw.removeBlocked")}</Text> : null}
                {ready && plan?.destination?.firstTime ? (
                  <View className="bg-muted gap-2 rounded-3xl p-4">
                    <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("withdraw.firstTimeTitle")}</Text>
                    <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("withdraw.firstTimeBody", { amount: testAmount })}</Text>
                    <Button variant="secondary" onPress={() => void sendTest()}>
                      <Text>{t("withdraw.sendTest", { amount: testAmount })}</Text>
                    </Button>
                  </View>
                ) : null}
                <SlideToConfirm disabled={!ready || planning} resetKey={JSON.stringify(input)} pendingLabel={t("withdraw.sending")} rtl={rtl} onHaptic={slideHaptic} onConfirm={() => void confirm()}>
                  {t("withdraw.slide")}
                </SlideToConfirm>
                <Text className={cn("text-muted-foreground text-xs leading-4", TEXT_START)}>{t("withdraw.faceIdNote")}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
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
};

/** One asset's line (21st Asset Card row): mark, amount (Max by default), as itself / as cash, the route, the reason. */
function LegRow({ leg, amount, route, reason, value, locale, onAmount, onAs, onRemove }: LegRowProps) {
  const { t } = useT();
  const colors = useThemeColors();
  const cashable = leg.canGoAsCash || leg.as === "cash";
  const offerCash = leg.canGoAsCash && (leg.reason === "convert_first" || leg.reason === "exchange_not_accepted");
  return (
    <View className={cn("bg-card gap-3 rounded-3xl border p-4", leg.status === "blocked" ? "border-destructive/50" : leg.status === "warning" ? "border-warning/60" : "border-border")}>
      <View className="flex-row items-center gap-3">
        <TokenMark token={leg.token} size={LINE_MARK} />
        <View className="min-w-0 flex-1">
          <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{leg.token.symbol}</Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("withdraw.held", { amount: tokenAmount(leg.balance, leg.token.decimals, leg.token.symbol, locale) })}</Text>
        </View>
        <TextInput
          accessibilityLabel={t("withdraw.amountOf", { symbol: leg.token.symbol })}
          value={amount ?? ""}
          onChangeText={(text) => {
            const next = text.replace(",", ".");
            if (DECIMAL.test(next)) onAmount(next);
          }}
          keyboardType="decimal-pad"
          placeholder={t("withdraw.max")}
          placeholderTextColor={colors["muted-foreground"]}
          className="border-border min-w-20 rounded-xl border px-3 py-2 text-end font-mono text-base"
          style={{ color: colors.foreground }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t("withdraw.removeLine", { symbol: leg.token.symbol })} hitSlop={10} onPress={onRemove}>
          <Icon as={X} className="text-muted-foreground size-4" />
        </Pressable>
      </View>
      {cashable ? (
        <View accessibilityRole="radiogroup" className="bg-muted flex-row rounded-full p-1">
          {(["itself", "cash"] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: leg.as === option }}
              onPress={() => onAs(option)}
              className={cn("flex-1 items-center rounded-full py-1.5", leg.as === option && "bg-background")}
            >
              <Text className={cn("text-sm font-semibold", leg.as === option ? "text-foreground" : "text-muted-foreground")}>{option === "itself" ? t("withdraw.asItself", { symbol: leg.token.symbol }) : t("withdraw.asCash")}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Icon as={ArrowRight} className="text-muted-foreground size-4 rtl:-scale-x-100" />
        <Text className={cn("text-muted-foreground min-w-0 flex-1 text-sm", TEXT_START)}>{route}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-muted-foreground text-sm">{t("withdraw.youReceive")}</Text>
        <Text className="text-foreground text-sm font-semibold">
          {leg.receive.amountText ? `${leg.as === "cash" ? "≈ " : ""}${leg.receive.amountText} ${leg.receive.symbol}` : leg.receive.symbol}
          {value ? <Text className="text-muted-foreground text-sm font-normal">{` · ${value}`}</Text> : null}
        </Text>
      </View>
      {reason ? <Text className={cn("text-sm leading-5", leg.status === "blocked" ? "text-destructive" : "text-warning", TEXT_START)}>{reason}</Text> : null}
      {offerCash ? (
        <Button variant="secondary" size="sm" onPress={() => onAs("cash")}>
          <Text>{t("withdraw.sendAsCash")}</Text>
        </Button>
      ) : null}
    </View>
  );
}
