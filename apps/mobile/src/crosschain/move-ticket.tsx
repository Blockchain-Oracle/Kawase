// The bridge card (surfaces.md "Bridge", plan §C card 9): what moves from where to whom on which chain (any asset; it
// arrives as itself, or as USDC when the route swaps it first), the route options (up to three: provider mark, what
// arrives in its own asset, the fee or a flat fee on top, how long, "via Relay", "Circle burn/mint" or "solver"), the chosen
// one and the person's pick, the least that arrives and the gas paid (none for Bring to Arc), then slide to confirm
// (it resets on any new version) → Face ID → the tracker: Signed → Sent from {chain} → Filling on {chain} → Delivered;
// a refund or failure says what happened to the money and offers "Try again" (the "Finish it" recovery).
import { useRouter } from "expo-router";
import { ArrowRight, Check, Circle, ExternalLink, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, View } from "react-native";

import type { CrossChainAssetView, CrossChainIntent, CrossChainProvider, CrossChainRouteView, PolicyResultView } from "@kawase/api-client";
import { chainKey } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { SlideToConfirm } from "@kawase/ui-native/components/slide-to-confirm";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { confirmedFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMarginFormat } from "@/margin/copy";
import { slideHaptic } from "@/margin/haptics";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";

import type { CrossChainController } from "./use-crosschain";

const CHAIN_MARK = 28;
const ROUTE_MARK = 24;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const SECONDS_PER_MINUTE = 60;
const PROVIDER_ENTITY: Record<CrossChainProvider, string> = { cctp: "provider:circle", across: "venue:across", relay: "venue:relay", lifi: "venue:lifi", debridge: "venue:debridge" };
const USDC_VIEW = { symbol: "USDC", decimals: 6 };
const NATIVE_DECIMALS = 18;
const TOKEN_MARK = 32;
const TRACK_STEPS = ["stepSigned", "stepSent", "stepFilling", "stepDelivered"] as const;
const SENT = 1;
const FILLING = 2;
const DELIVERED = 3;

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

/** Base units of an asset with its symbol; drafts from before any-asset moves are USDC. */
function useAssetMoney() {
  const format = useMarginFormat();
  return (base: string | null | undefined, asset: Pick<CrossChainAssetView, "symbol" | "decimals"> | undefined) => (base ? format.amount(base, (asset ?? USDC_VIEW).decimals, (asset ?? USDC_VIEW).symbol) : "");
}

function MoveTracker({ intent, busy }: { intent: CrossChainIntent; busy: boolean }) {
  const { t } = useT();
  const reached = intent.stage === "delivered" ? DELIVERED : intent.stage === "filling" ? FILLING : intent.stage === "submitted" ? SENT : busy ? 0 : -1;
  const failed = intent.stage === "refunded" || intent.stage === "failed";
  if (reached < 0 && !failed) return null;
  const names = { source: intent.draft?.source.name ?? "", destination: intent.draft?.destination.name ?? "" };
  return (
    <View className="gap-2">
      {TRACK_STEPS.map((step, index) => {
        const done = index < reached || (index === DELIVERED && intent.stage === "delivered");
        const now = index === reached && !done;
        const broken = failed && index === Math.max(reached, SENT);
        return (
          <View key={step} className="flex-row items-center gap-2">
            <Icon as={done ? Check : broken ? X : Circle} className={cn("size-4", done ? "text-success" : broken ? "text-destructive" : now ? "text-foreground" : "text-muted-foreground")} />
            <Text className={cn("text-sm", done || now ? "text-foreground" : "text-muted-foreground", TEXT_START)}>{t(`move.${step}`, { chain: index === SENT ? names.source : names.destination })}</Text>
          </View>
        );
      })}
    </View>
  );
}

function RouteRow({ route, input, chosen, onPick, disabled }: { route: CrossChainRouteView; input: CrossChainAssetView | undefined; chosen: boolean; onPick: () => void; disabled: boolean }) {
  const { t } = useT();
  const money = useAssetMoney();
  const eta = route.etaSeconds === null ? null : route.etaSeconds < SECONDS_PER_MINUTE ? t("move.etaSeconds", { count: route.etaSeconds }) : t("move.etaMinutes", { count: Math.round(route.etaSeconds / SECONDS_PER_MINUTE) });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen, disabled: disabled || !route.executable }}
      disabled={disabled || !route.executable}
      onPress={onPick}
      className={cn("flex-row items-center gap-3 rounded-2xl px-3 py-2", chosen ? "bg-secondary" : "active:bg-muted", !route.executable && "opacity-60")}
    >
      <Mark entity={PROVIDER_ENTITY[route.provider]} size={ROUTE_MARK} />
      <View className="min-w-0 flex-1">
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t(`move.provider_${route.provider}`)}</Text>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {route.executable
            ? [route.via ? t("move.via", { bridge: route.via }) : t(`move.trust_${route.trust}`), route.convertFirst ? t("move.convertFirst", { venue: route.convertFirst.venue }) : null, eta].filter(Boolean).join(" · ")
            : t(`move.reason_${route.reason ?? "no_quote"}`)}
        </Text>
      </View>
      {route.received ? (
        <View className="items-end">
          <Amount className="text-foreground text-sm font-semibold">{money(route.received, route.output)}</Amount>
          {route.nativeFee ? (
            <Amount className="text-muted-foreground text-xs">{t("move.feeOnTop", { amount: money(route.nativeFee, { symbol: "USDC", decimals: NATIVE_DECIMALS }) })}</Amount>
          ) : route.fee ? (
            <Amount className="text-muted-foreground text-xs">{t("move.fee", { amount: money(route.fee, input) })}</Amount>
          ) : null}
        </View>
      ) : null}
      {chosen ? <Icon as={Check} className="text-success size-4" /> : null}
    </Pressable>
  );
}

export function MoveTicket({ controller, onRetry }: { controller: CrossChainController; onRetry?: () => void }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const money = useMoney();
  const assetMoney = useAssetMoney();
  const intent = controller.intent;
  const deliveredId = intent?.stage === "delivered" ? intent.id : undefined;
  React.useEffect(() => {
    if (deliveredId) void confirmedFeedback(`move:${deliveredId}`);
  }, [deliveredId]);
  if (!intent) return null;
  const draft = intent.draft;
  const blocking = intent.blocking;
  const open = ["submitted", "working", "input_required", "auth_required", "ready_for_approval"].includes(intent.state);
  const ready = !blocking && Boolean(draft) && intent.state === "ready_for_approval";
  // Amounts in the asset the reason names (its own decimals), USDC otherwise.
  const policyText = (result: PolicyResultView) => {
    const p = result.params ?? {};
    const asset = p.asset ? { symbol: p.asset, decimals: Number(p.decimals ?? USDC_VIEW.decimals) } : USDC_VIEW;
    return t(`movePolicy.${result.code}`, { ...p, balance: assetMoney(p.balance, asset), needed: assetMoney(p.needed, asset), defaultValue: t(`policy.${result.code}`, { ...p, defaultValue: result.code }) });
  };
  const fix =
    blocking?.code === "SIGN_IN_REQUIRED"
      ? { label: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : blocking?.code === "INSUFFICIENT_BALANCE" || blocking?.code === "INSUFFICIENT_GAS"
        ? { label: t("policy.fixAddMoney"), onPress: fund.open }
        : blocking?.code === "WALLET_NOT_READY" || blocking?.code === "WALLET_NOT_SET_UP"
          ? { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
          : blocking?.code === "QUOTE_UNAVAILABLE"
            ? { label: t("move.tryAgain"), onPress: () => void controller.revise({}) }
            : undefined;

  return (
    <View className="gap-4">
      {draft ? (
        <>
          <View className="flex-row items-center gap-2">
            <Mark entity={chainKey(draft.source.chainId)} size={CHAIN_MARK} />
            <Icon as={ArrowRight} className="text-muted-foreground size-4 rtl:-scale-x-100" />
            <Mark entity={chainKey(draft.destination.chainId)} size={CHAIN_MARK} />
            <Amount className={cn("font-display text-foreground flex-1 text-xl font-bold", TEXT_START)}>{assetMoney(draft.amount, draft.input)}</Amount>
            {draft.input ? <TokenMark token={draft.input} size={TOKEN_MARK} /> : null}
          </View>
          {draft.output && draft.input && draft.output.symbol !== draft.input.symbol ? (
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("move.arrivesAs", { asset: draft.output.symbol })}</Text>
          ) : null}
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
            {draft.direction === "in"
              ? t("move.bringLine", { source: draft.source.name })
              : t("move.outLine", { who: draft.recipient.own ? t("move.you") : (draft.recipient.label ?? short(draft.recipient.address)), chain: draft.destination.name })}
          </Text>
          <View className="gap-1">
            {draft.routes.map((route) => (
              <RouteRow key={route.provider} route={route} input={draft.input} chosen={route.provider === draft.chosen} disabled={!open || controller.busy} onPick={() => void controller.revise({ route: route.provider })} />
            ))}
          </View>
          <View className="border-border gap-1 rounded-2xl border px-4 py-3">
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground text-sm">{t("move.atLeast")}</Text>
              <Amount className="text-foreground text-sm font-semibold">{assetMoney(draft.minReceived, draft.output)}</Amount>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground text-sm">{t("move.networkFee")}</Text>
              <Amount className="text-foreground text-sm">
                {draft.networkFee !== "0" ? money("USDC", draft.networkFee) : draft.direction === "in" && draft.chosen === "lifi" ? t("move.gasThere", { chain: draft.source.name }) : t("move.noGas")}
              </Amount>
            </View>
          </View>
        </>
      ) : null}

      {blocking && open ? (
        <View className="bg-muted gap-3 rounded-2xl px-4 py-3">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking)}</Text>
          {fix ? (
            <Button variant="secondary" onPress={fix.onPress}>
              <Text>{fix.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      <MoveTracker intent={intent} busy={controller.busy} />

      {intent.stage === "refunded" || intent.stage === "failed" ? (
        <View className="gap-2">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{intent.stage === "refunded" ? t("move.refunded") : t("move.failed")}</Text>
          {onRetry ? (
            <Button onPress={onRetry}>
              <Text>{t("move.finishIt")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      {intent.tx || intent.fillTx ? (
        <View className="flex-row gap-2">
          {[intent.tx, intent.fillTx].filter(Boolean).map((link) => (
            <Button key={link!.hash} variant="secondary" size="sm" onPress={() => void Linking.openURL(link!.explorerUrl)}>
              <Icon as={ExternalLink} className="size-4" />
              <Text>{link === intent.tx ? draft?.source.name : draft?.destination.name}</Text>
            </Button>
          ))}
        </View>
      ) : null}

      {open ? (
        <View className="gap-2">
          <SlideToConfirm
            disabled={!ready || controller.busy}
            resetKey={`${intent.id}:${intent.version}:${intent.state}`}
            pendingLabel={t("move.moving")}
            rtl={rtl}
            onHaptic={slideHaptic}
            onConfirm={() => void controller.approve(draft ? t("move.signPrompt", { amount: assetMoney(draft.amount, draft.input), chain: draft.destination.name }) : t("move.title"))}
          >
            {draft?.direction === "in" ? t("move.slideBring") : t("move.slideSend")}
          </SlideToConfirm>
          <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
            <Text className="text-muted-foreground">{t("move.cancel")}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
