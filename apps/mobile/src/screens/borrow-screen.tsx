// Borrow (earn-borrow.md "Borrow"; Aave V4's Main Spoke on Arc): the person's position first (what they owe, what is
// in, the health gauge, with Repay, Add and Withdraw on each line), then what can be borrowed and at what rate. A
// loan opens the amount step: the asset, the amount on the keypad, the collateral to put in with it (any asset they
// hold that the market accepts, inferred from their wallet), and the health gauge moving as they type, projected here
// from the account and recomputed by the api when they review. Review is the ticket: slide, Face ID, one batch. On
// testnet it says this runs on mainnet only and offers the switch; guests are asked to sign in.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { formatUnits } from "viem";

import type { LendAccountView, LendRequest, LendReserveView } from "@kawase/api-client";
import { LEND, MOTION } from "@kawase/config";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { MainnetConsentSheet } from "@/components/network-pill";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { isIntentMoving, isIntentOpen, isIntentFinished } from "@/intents/use-wallet-intent";
import { useLendFormat } from "@/lend/copy";
import { HealthGauge } from "@/lend/health-gauge";
import { maxBorrow, priceOf, projectHealth, toInput, type LendAction } from "@/lend/health";
import { LendTicket } from "@/lend/lend-ticket";
import { useLendAccount, useLendOrder } from "@/lend/use-lend";
import { marketEntity } from "@/margin/copy";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const PROVIDER_MARK = 28;
const MARK = 36;
const ROW_MARK = 32;
const ART_WIDTH = 140;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;
const TICKET_SIZE = 48;
const TICKET_LINE_HEIGHT = 56;
const TICKET_MIN_SCALE = 0.5;
const BPS = 10_000;
const RATE_DIGITS = 2;
/** The keypad takes at most this many decimals, whatever the asset carries (WETH has 18). */
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

function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={cn("rounded-full px-3 py-1.5", selected ? "bg-primary" : "bg-muted active:bg-secondary")}
    >
      <Text className={cn("text-sm font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
    </Pressable>
  );
}

export function BorrowScreen({ prefill }: { prefill: BorrowPrefill }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useLendFormat();
  const account = useLendAccount();
  const controller = useLendOrder();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const view = account.view;

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
  // amount it goes straight to the ticket.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !view?.available || !prefill.asset) return;
    const target = view.reserves.find((entry) => entry.asset.toLowerCase() === prefill.asset!.toLowerCase());
    if (!target) return;
    prefilled.current = true;
    const next = prefill.action ?? "borrow";
    start(next, target, { amount: prefill.amount, collateral: prefill.collateral });
    if (prefill.amount && next !== "borrow") void review({ action: next, asset: target.asset, amount: prefill.amount });
  }, [view?.available]);

  const finished = intent ? isIntentFinished(intent) : false;
  React.useEffect(() => {
    if (finished) void account.refresh();
  }, [finished]);

  const toOverview = () => {
    controller.reset();
    setStep("overview");
    void account.refresh();
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (settled && intent && !isIntentMoving(intent)) return toOverview();
    if (step === "overview") return leave();
    if (step === "review") return setStep("amount");
    setStep("overview");
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <View className="flex-1">
          <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
            {t("lend.borrowTitle")}
          </Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.subtitle")}</Text>
        </View>
        <Mark entity="provider:aave" size={PROVIDER_MARK} />
      </View>
    </>
  );

  let body: React.ReactNode;
  if (status !== "account") {
    body = (
      <EmptyState
        art={<CoinStack width={ART_WIDTH} id="borrow-sign-in" />}
        title={t("lendPolicy.SIGN_IN_REQUIRED")}
        action={
          <Button onPress={() => signIn.open()}>
            <Text>{t("policy.fixSignIn")}</Text>
          </Button>
        }
      />
    );
  } else if (view && !view.available) {
    body = (
      <View className="flex-1 justify-center gap-4 px-5">
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("lend.mainnetOnly")}</Text>
        {networkSwitch.nextAvailable ? (
          <Button disabled={networkSwitch.busy} onPress={() => void networkSwitch.switchNetwork("mainnet")}>
            <Text>{t("margin.switchToMainnet")}</Text>
          </Button>
        ) : null}
      </View>
    );
  } else if (!view) {
    body = account.failed ? (
      <View className="flex-1 justify-center px-5">
        <Button variant="secondary" onPress={() => void account.refresh()}>
          <Text>{t("common.retry")}</Text>
        </Button>
      </View>
    ) : (
      <View className="gap-2 px-5 pt-4">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
        ))}
      </View>
    );
  } else if ((step === "review" || settled) && intent) {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        {!testnet ? <Eyebrow className="text-foreground">{t("network.realMoney")}</Eyebrow> : null}
        <LendTicket controller={controller} onEdit={() => setStep("amount")} onDone={toOverview} />
      </ScrollView>
    );
  } else if (step === "amount" && reserve) {
    body = <AmountStep view={view} reserve={reserve} action={action} value={value} all={all} collateral={collateral} busy={creating || controller.busy} onValue={setValue} onAll={setAll} onCollateral={setCollateral} onReview={() => void review()} locale={locale} />;
  } else {
    const minHealth = LEND.minBorrowHealthBps / BPS;
    const warnHealth = LEND.warnHealthBps / BPS;
    const hasPosition = view.supplied.length > 0 || view.borrowed.length > 0;
    body = (
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        {hasPosition ? (
          <View className="bg-card border-border gap-4 rounded-3xl border p-4">
            <Eyebrow>{t("lend.yourPosition")}</Eyebrow>
            {view.borrowed.length > 0 ? <HealthGauge before={view.health} after={view.health} min={minHealth} warn={warnHealth} /> : null}
            {view.borrowed.map((entry) => {
              const target = view.reserves.find((candidate) => candidate.reserveId === entry.reserveId)!;
              return (
                <View key={`debt-${entry.reserveId}`} className="flex-row items-center gap-3">
                  <Mark entity={marketEntity(target.address)} size={ROW_MARK} />
                  <View className="min-w-0 flex-1">
                    <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("lend.youOwe", { amount: format.of(entry) })}</Text>
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.rateValue", { rate: format.percent(target.borrowApr, RATE_DIGITS) })}</Text>
                  </View>
                  <Button size="sm" onPress={() => void review({ action: "repay", asset: target.asset, amount: "all" }).then(() => setReserveId(target.reserveId))}>
                    <Text>{t("lend.repay")}</Text>
                  </Button>
                </View>
              );
            })}
            {view.supplied.map((entry) => {
              const target = view.reserves.find((candidate) => candidate.reserveId === entry.reserveId)!;
              return (
                <View key={`in-${entry.reserveId}`} className="flex-row items-center gap-3">
                  <Mark entity={marketEntity(target.address)} size={ROW_MARK} />
                  <View className="min-w-0 flex-1">
                    <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{format.of(entry)}</Text>
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
                      {entry.collateral ? t("lend.asCollateral") : t("lend.earning", { rate: format.percent(target.supplyApr, RATE_DIGITS) })}
                    </Text>
                  </View>
                  <Button size="sm" variant="secondary" disabled={heldAmount(view, target) <= 0} onPress={() => start("supply", target)}>
                    <Text>{t("lend.add")}</Text>
                  </Button>
                  <Button size="sm" variant="secondary" onPress={() => start("withdraw", target)}>
                    <Text>{t("lend.withdraw")}</Text>
                  </Button>
                </View>
              );
            })}
            {view.borrowRoomUsd > 0 ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.room", { amount: format.usd(view.borrowRoomUsd) })}</Text> : null}
          </View>
        ) : null}

        <View className="gap-2">
          <Eyebrow>{t("lend.borrowWhat")}</Eyebrow>
          <ListGroup>
            {view.reserves
              .filter((entry) => entry.borrowable)
              .map((entry) => (
                <Pressable key={entry.reserveId} accessibilityRole="button" onPress={() => start("borrow", entry)} className="active:bg-muted flex-row items-center gap-3 px-4 py-3">
                  <Mark entity={marketEntity(entry.address)} size={MARK} />
                  <View className="min-w-0 flex-1">
                    <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{entry.asset}</Text>
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
                      {entry.collateralFactor > 0 ? t("lend.alsoCollateral", { percent: format.percent(entry.collateralFactor, 0) }) : t("lend.notCollateral")}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-display text-foreground text-lg font-bold" style={{ fontVariant: ["tabular-nums"] }}>
                      {format.percent(entry.borrowApr, RATE_DIGITS)}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]">{t("lend.aYear")}</Text>
                  </View>
                </Pressable>
              ))}
          </ListGroup>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.howItWorks", { health: format.health(minHealth) })}</Text>
        </View>
      </ScrollView>
    );
  }

  const visible = status !== "account" || !view ? "plain" : settled ? "status" : step;
  return (
    <View className="bg-background flex-1">
      {header}
      <Animated.View key={visible} entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)} exiting={reduced ? undefined : FadeOut.duration(MOTION.sheetMs)} className="flex-1">
        {body}
      </Animated.View>
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
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
  locale: string;
  onValue: (value: string) => void;
  onAll: (all: boolean) => void;
  onCollateral: (collateral: Collateral) => void;
  onReview: () => void;
}) {
  const { view, reserve, action, value, all, collateral, busy, locale } = props;
  const { t } = useT();
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

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4">
        <View className="bg-card border-border gap-2 rounded-3xl border p-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-muted-foreground text-sm">{t(`lend.title_${action}`, { asset: reserve.asset })}</Text>
            {max ? (
              <Pressable accessibilityRole="button" onPress={max.apply} className={cn("rounded-full px-3 py-1", all ? "bg-primary" : "bg-muted active:bg-secondary")}>
                <Text className={cn("text-xs font-semibold", all ? "text-primary-foreground" : "text-foreground")}>{max.label}</Text>
              </Pressable>
            ) : null}
          </View>
          <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
            <Mark entity={marketEntity(reserve.address)} size={MARK} />
            <Text
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={TICKET_MIN_SCALE}
              className={cn("font-display flex-1 font-bold", value || all ? "text-foreground" : "text-muted-foreground")}
              style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
            >
              {all ? t("lend.all") : displayAmount(value, locale)}
            </Text>
            <Text className="font-display text-muted-foreground text-xl font-semibold">{reserve.asset}</Text>
          </View>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{limitLine}</Text>
        </View>

        {action === "borrow" ? (
          <View className="gap-2">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("lend.against")}</Text>
            {accepted.length === 0 && view.weightedCollateralUsd <= 0 ? (
              <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("lend.noCollateral")}</Text>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {view.weightedCollateralUsd > 0 ? <Chip label={t("lend.alreadyIn")} selected={!collateral} onPress={() => props.onCollateral(undefined)} /> : null}
                  {accepted.map((entry) => (
                    <Chip
                      key={entry.reserveId}
                      label={entry.asset}
                      selected={collateral?.reserve.reserveId === entry.reserveId}
                      onPress={() => props.onCollateral({ reserve: entry, share: collateral?.share ?? COLLATERAL_SHARES[COLLATERAL_SHARES.length - 1]! })}
                    />
                  ))}
                </View>
                {collateral && put ? (
                  <View className="gap-2">
                    <View className="flex-row gap-2">
                      {COLLATERAL_SHARES.map((share) => (
                        <Chip key={share} label={`${Math.round(share * PERCENT)}%`} selected={collateral.share === share} onPress={() => props.onCollateral({ ...collateral, share })} />
                      ))}
                    </View>
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
                      {t("lend.puttingIn", { amount: `${toInput(put.amount, digitsFor(put.reserve))} ${put.reserve.asset}`, usd: format.usd(put.amount * priceOf(put.reserve)) })}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {debtShown ? <HealthGauge before={view.health} after={health} min={minHealth} warn={LEND.warnHealthBps / BPS} compact /> : null}
      </ScrollView>
      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Keypad
          decimal={decimalSeparator(locale)}
          backspaceLabel={t("send.deleteDigit")}
          onKey={(key) => {
            props.onAll(false);
            props.onValue(applyKey(all ? "" : value, key, digits));
          }}
        />
        <Button size="lg" disabled={!ready || busy || (health !== null && health < minHealth && action === "borrow")} onPress={props.onReview}>
          <Text>{busy ? t("common.loading") : !ready ? t("send.enterAmount") : health !== null && health < minHealth && action === "borrow" ? t("lend.tooMuch") : t("lend.review")}</Text>
        </Button>
      </View>
    </View>
  );
}
