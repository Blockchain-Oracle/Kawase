// Earn (Stage 6c): what the person holds in vaults and what each vault pays → how much in or out → review → moving →
// the ending. The overview leads with their position (or, before they have one, what their USDC could earn), then
// the vaults with their real marks, yield now, curator, Circle's monitoring and liquidity. Choosing a vault opens
// the amount ticket (Deposit, or Withdraw when they hold some there); review says what goes where, the least that
// comes back, the position after and about a year's yield at today's rate; one lime button named after the
// device's real check.
import { useRouter } from "expo-router";
import { ChevronLeft, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { EarnVaultView, PolicyResultView } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { decimalsOf } from "@kawase/money";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useEarnApproveLabel, useEarnPolicyText, useEarnPrompt, usePercent } from "@/earn/copy";
import { EarnReview } from "@/earn/earn-review";
import { EarnStatus } from "@/earn/earn-status";
import { useEarn } from "@/earn/use-earn";
import { AutoSaveCard } from "@/earn/auto-save-card";
import { useEarnOverview } from "@/earn/use-earn-overview";
import { VaultRow } from "@/earn/vault-row";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen } from "@/intents/use-wallet-intent";
import { baseFromCanonical, canonicalFromBase } from "@/send/amount-step";
import { useMoney } from "@/send/copy";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";
import { vaultTitle } from "@/earn/vault-title";
import { useYieldOptions } from "@/lend/use-lend";
import { useChooseYield, YieldOptionRow } from "@/lend/yield-options";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 12;
const ART_WIDTH = 140;
const MARK = 32;
const ZERO = 0n;
const SKELETON_ROWS = 2;
const SKELETON_HEIGHT = 72;
const TICKET_SIZE = 56;
const TICKET_LINE_HEIGHT = 66;
const TICKET_MIN_SCALE = 0.5;

type Step = "overview" | "amount" | "review";
type Action = "deposit" | "withdraw";

/** `/earn?vault=0x…&amount=20` (the yield options card) opens that vault's deposit ticket. */
export type EarnPrefill = { vault?: string | undefined; amount?: string | undefined };

export function EarnScreen({ prefill = {} }: { prefill?: EarnPrefill }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const { wallet } = useWalletStatus();
  const overview = useEarnOverview();
  const controller = useEarn();
  const money = useMoney();
  const percent = usePercent();
  const policyText = useEarnPolicyText();
  const approveLabel = useEarnApproveLabel();
  const prompt = useEarnPrompt();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const ids = arcIdentity(network);

  const [step, setStep] = React.useState<Step>("overview");
  const [vault, setVault] = React.useState<EarnVaultView>();
  const [action, setAction] = React.useState<Action>("deposit");
  const [value, setValue] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const usdc = wallet?.networks[network] ? BigInt(wallet.networks[network]!.usdcBalance) : undefined;
  // Vaults that could not give a deposit back now are not offered (gaps.md G1); positions in them stay listed above.
  const depositable = (overview.vaults ?? []).filter((entry) => entry.liquidity !== "stuck");
  const stuckCount = (overview.vaults?.length ?? 0) - depositable.length;
  const position = vault ? overview.positions.find((entry) => entry.vault.toLowerCase() === vault.address.toLowerCase()) : undefined;
  const intent = controller.intent;
  const settled = intent && (isIntentMoving(intent) || isIntentFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (settled) {
      void overview.refresh();
      setStep("overview");
      controller.reset();
      return;
    }
    if (step === "overview") leave();
    else setStep(step === "review" ? "amount" : "overview");
  };

  const choose = (next: EarnVaultView, nextAction: Action) => {
    setVault(next);
    setAction(nextAction);
    setValue("");
    setStep("amount");
  };

  // Other places USDC earns (Aave V4, LP campaigns as advanced) beside the vaults; each opens its own ticket.
  const others = useYieldOptions("USDC");
  const chooseYield = useChooseYield();
  const elsewhere = (others.view?.options ?? []).filter((option) => option.kind !== "morpho_vault");

  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !prefill.vault || !overview.vaults) return;
    const wanted = overview.vaults.find((entry) => entry.address.toLowerCase() === prefill.vault!.toLowerCase());
    if (!wanted || wanted.liquidity === "stuck") return;
    prefilled.current = true;
    choose(wanted, "deposit");
    if (prefill.amount) setValue(prefill.amount);
  }, [overview.vaults]);

  const review = async () => {
    if (!vault) return;
    const request = { action, vault: vault.address, amount: value };
    setCreating(true);
    try {
      if (intent && isIntentOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.earn.create(request);
        controller.set(fresh);
        setStep("review");
      }
    } catch {
      toast(t("send.failed"));
    } finally {
      setCreating(false);
    }
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("earn.title")}
        </Text>
      </View>
    </>
  );

  const blockedPage =
    status !== "account"
      ? { title: t("earnPolicy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("earnPolicy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<CoinStack width={ART_WIDTH} id="earn-blocked-stack" />}
            title={blockedPage.title}
            action={
              <Button onPress={blockedPage.onPress}>
                <Text>{blockedPage.action}</Text>
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  const fixFor = (blocking: PolicyResultView): { label: string; onPress: () => void } | undefined => {
    switch (blocking.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "AMOUNT_MISSING":
      case "AMOUNT_INVALID":
      case "OVER_POSITION":
      case "VAULT_LIQUIDITY_SHORT":
        return { label: t("policy.fixEditAmount"), onPress: () => setStep("amount") };
      default:
        return undefined;
    }
  };

  const enter = reduced ? undefined : FadeIn.duration(MOTION.sheetMs);
  const exit = reduced ? undefined : FadeOut.duration(MOTION.sheetMs);
  const visible: Step | "status" = settled ? "status" : step;

  let body: React.ReactNode;
  if (visible === "status" && intent) {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center px-5" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <EarnStatus
          intent={intent}
          connectionLost={controller.connectionLost}
          actions={
            isIntentFinished(intent) ? (
              <Button size="lg" onPress={back}>
                <Text>{t("send.done")}</Text>
              </Button>
            ) : null
          }
        />
      </ScrollView>
    );
  } else if (visible === "review" && intent) {
    const blocking = intent.blocking;
    const fix = blocking ? fixFor(blocking) : undefined;
    const draftAction = intent.draft?.action ?? action;
    body = (
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4 pb-4">
          {!testnet ? <Eyebrow className="text-foreground">{t("network.realMoney")}</Eyebrow> : null}
          <EarnReview intent={intent} />
          {blocking ? (
            <View className="bg-muted gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, intent.network)}</Text>
              {fix ? (
                <Button variant="secondary" onPress={fix.onPress}>
                  <Text>{fix.label}</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Button size="lg" disabled={Boolean(blocking) || !intent.draft || controller.busy} onPress={() => void controller.approve(prompt(intent.draft))}>
            {blocking ? null : <Icon as={ScanFace} className="text-primary-foreground size-5" />}
            <Text numberOfLines={2} className="text-center">
              {blocking ? policyText(blocking, intent.network) : controller.busy ? (draftAction === "deposit" ? t("earn.depositing") : t("earn.withdrawing")) : approveLabel(draftAction)}
            </Text>
          </Button>
          <Button
            variant="ghost"
            disabled={controller.busy}
            onPress={() => {
              void controller.cancel();
              setStep("overview");
            }}
          >
            <Text className="text-muted-foreground">{t("earn.cancel")}</Text>
          </Button>
        </View>
      </View>
    );
  } else if (visible === "amount" && vault) {
    const limit = action === "deposit" ? usdc : position ? BigInt(position.assets) : ZERO;
    const base = baseFromCanonical(value, "USDC");
    const cta =
      base === undefined || base === ZERO
        ? { label: t("send.enterAmount"), enabled: false }
        : limit !== undefined && base > limit
          ? { label: t("send.notEnough", { asset: "USDC" }), enabled: false }
          : { label: t("earn.review"), enabled: true };
    body = (
      <View className="flex-1">
        <View className="flex-1 gap-4 px-5 pt-4">
          {position ? (
            <SegmentedControl
              label={t("earn.title")}
              value={action}
              onValueChange={(next) => {
                setAction(next as Action);
                setValue("");
              }}
              options={[
                { value: "deposit", label: t("earn.deposit") },
                { value: "withdraw", label: t("earn.withdraw") },
              ]}
            />
          ) : null}
          <View className="border-border overflow-hidden rounded-2xl border">
            <VaultRow vault={vault} network={network} />
          </View>
          <View className="bg-card border-border gap-2 rounded-3xl border p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-muted-foreground text-sm">{action === "deposit" ? t("earn.youPutIn") : t("earn.youTakeOut")}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-muted-foreground text-xs">{limit !== undefined ? t("send.available", { amount: money("USDC", limit.toString()) }) : " "}</Text>
                {limit !== undefined && limit > ZERO ? (
                  <Pressable accessibilityRole="button" onPress={() => setValue(canonicalFromBase(limit, "USDC"))} className="bg-muted active:bg-secondary rounded-full px-3 py-1">
                    <Text className="text-foreground text-xs font-semibold">{t("send.max")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
              <Mark entity={ids.usdc} chainBadge={ids.chain} size={MARK} />
              <Text
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${value || "0"} USDC`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={TICKET_MIN_SCALE}
                className={cn("font-display flex-1 font-bold", value ? "text-foreground" : "text-muted-foreground")}
                style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
              >
                {displayAmount(value, locale)}
              </Text>
              <Text className="font-display text-muted-foreground text-xl font-semibold">USDC</Text>
            </View>
          </View>
        </View>
        <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => setValue(applyKey(value, key, decimalsOf("USDC")))} />
          <Button size="lg" disabled={!cta.enabled || creating || controller.busy} onPress={() => void review()}>
            <Text>{creating || controller.busy ? t("common.loading") : cta.label}</Text>
          </Button>
        </View>
      </View>
    );
  } else {
    const held = overview.held;
    body = (
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void overview.refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View className="bg-card border-border items-center gap-2 rounded-3xl border px-5 py-6">
          <CoinStack width={ART_WIDTH} id="earn-hero-stack" />
          {held > ZERO ? (
            <>
              <Text className="text-muted-foreground text-sm">{t("earn.inVaults")}</Text>
              <Text className="font-display text-foreground text-4xl font-bold" style={{ fontVariant: ["tabular-nums"] }}>
                {money("USDC", held.toString())}
              </Text>
            </>
          ) : (
            <Text className="font-display text-foreground text-center text-2xl font-bold">
              {overview.best ? t("earn.heroTitle", { apy: percent(overview.best.apy) }) : t("earn.title")}
            </Text>
          )}
          <Text className="text-muted-foreground text-center text-sm">{t("earn.heroBody")}</Text>
          {testnet ? <Text className="text-muted-foreground text-center text-xs">{t("earn.testnetVaults")}</Text> : null}
        </View>

        <AutoSaveCard />

        {overview.positions.length > 0 ? (
          <View className="gap-2">
            <Eyebrow>{t("earn.yourPosition")}</Eyebrow>
            <ListGroup>
              {overview.positions.map((entry) => {
                const listed = overview.vaults?.find((candidate) => candidate.address.toLowerCase() === entry.vault.toLowerCase());
                return (
                  <Pressable key={entry.vault} accessibilityRole="button" onPress={() => listed && choose(listed, "withdraw")} className="active:bg-muted flex-row items-center justify-between gap-3 px-4 py-3">
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
                        {vaultTitle(entry.name)}
                      </Text>
                      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("earn.earningAbout", { apy: percent(entry.apy) })}</Text>
                    </View>
                    <Text className="font-display text-foreground text-lg font-bold" style={{ fontVariant: ["tabular-nums"] }}>
                      {money("USDC", entry.assets)}
                    </Text>
                  </Pressable>
                );
              })}
            </ListGroup>
          </View>
        ) : null}

        <View className="gap-2">
          <Eyebrow>{t("earn.vaults")}</Eyebrow>
          {overview.failed && !overview.vaults ? (
            <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("earn.loadFailed")}</Text>
              <Button size="sm" variant="secondary" onPress={() => void overview.refresh()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </View>
          ) : !overview.vaults ? (
            <View className="gap-2">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
              ))}
            </View>
          ) : depositable.length === 0 ? (
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("earn.noVaults")}</Text>
          ) : (
            <>
              <ListGroup>
                {depositable.map((entry) => (
                  <VaultRow key={entry.address} vault={entry} network={network} onPress={() => choose(entry, "deposit")} />
                ))}
              </ListGroup>
              {stuckCount > 0 ? <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("earn.stuckHidden", { count: stuckCount })}</Text> : null}
            </>
          )}
        </View>

        {elsewhere.length > 0 ? (
          <View className="gap-2">
            <Eyebrow>{t("yieldOptions.moreWays")}</Eyebrow>
            <ListGroup>
              {elsewhere.map((option) => (
                <YieldOptionRow key={option.id} option={option} best={false} onPress={option.executable ? () => chooseYield(option, null) : undefined} />
              ))}
            </ListGroup>
          </View>
        ) : null}

        {!testnet ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/borrow")} className="bg-card border-border active:bg-muted flex-row items-center gap-3 rounded-2xl border px-4 py-3">
            <Mark entity="provider:aave" size={MARK} />
            <View className="min-w-0 flex-1">
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("lend.borrowTitle")}</Text>
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.borrowEntry")}</Text>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View className="bg-background flex-1">
      {header}
      <Animated.View key={visible} entering={enter} exiting={exit} className="flex-1">
        {body}
      </Animated.View>
    </View>
  );
}
