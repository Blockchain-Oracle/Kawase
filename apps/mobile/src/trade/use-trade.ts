// One ticket's state on the device: the market and side, the amount (typed, or a share of the USDC the wallet can
// spend), leverage (off by default: "No leverage" is 1×, Senryo D-344; the device remembers an explicit choice), and
// take-profit / stop-loss as steps from the price. Every change drafts the order on the api (debounced, one request
// in flight, the newest wins), so the ticket shows the venue's own numbers, never local maths, and a quote older than
// QUOTE_FRESH_MS is priced again while the ticket is shown. Approval, polling and the receipt are the wallet-intent
// controller's (the same guarantees as swaps). After an open completes, the chosen targets are saved on the position;
// switching Kawase's permission to close it on is one more yes on the position page.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { formatUnits } from "viem";

import type { MarginIntent, MarginMarketView, MarginRequest, MarginSide } from "@kawase/api-client";
import { GAS_FLOAT_USDC_BASE_UNITS, MARGIN, MARGIN_PROTECTION } from "@kawase/config";

import { PRICE_DECIMALS } from "@/margin/copy";
import { isMarginFinished, isMarginOpen, useMarginOrder } from "@/margin/use-margin";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const LEVERAGE_KEY = "kawase.trade.leverage";
const DRAFT_DEBOUNCE_MS = 350;
/** A quote is shown as fresh this long, then priced again (the ring on the ticket drains over it). */
export const QUOTE_FRESH_MS = 30_000;
const USDC_DECIMALS = 6;
const CENTS = 2;
const NO_LEVERAGE = 1;
const AMOUNT_PATTERN = /^\d*(?:[.,]\d{0,6})?$/;
const ZERO = 0n;
/** One cent of USDC in base units (6 decimals): shares round down to it. */
const CENT_UNITS = 10_000n;
const PERCENT = 100;

export type TargetStep = number | null;
export type TradeTargets = { takeProfit: TargetStep; stopLoss: TargetStep };

const usd = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : null);

/** The price a take-profit or stop-loss step lands on, from the price now (up for a long's take-profit). */
export function targetPrice(mark: number, side: MarginSide, target: keyof TradeTargets, step: number) {
  const sign = (target === "takeProfit") === (side === "long") ? 1 : -1;
  return Number((mark * (1 + sign * step)).toFixed(CENTS));
}

/** Steps the ticket offers: a stop-loss never at or past the liquidation price. */
export function targetSteps(target: keyof TradeTargets, side: MarginSide, mark: number | null, liquidation: number | null) {
  const steps: readonly number[] = target === "takeProfit" ? MARGIN_PROTECTION.takeProfitSteps : MARGIN_PROTECTION.stopLossSteps;
  if (target === "takeProfit" || mark === null || liquidation === null) return [...steps];
  return steps.filter((step) => {
    const price = targetPrice(mark, side, target, step);
    return side === "long" ? price > liquidation : price < liquidation;
  });
}

const normalise = (text: string) => text.replace(",", ".").replace(/^\./, "0.");

export function useTrade(markets: readonly MarginMarketView[] | undefined, prefill: { market?: string | undefined; side?: MarginSide | undefined }) {
  const { status } = useSession();
  const { wallet, refresh: refreshWallet } = useWalletStatus();
  const controller = useMarginOrder();
  const [market, setMarket] = React.useState<string | undefined>(prefill.market);
  const [side, setSide] = React.useState<MarginSide>(prefill.side ?? "long");
  const [amount, setAmountText] = React.useState("");
  const [leverageOn, setLeverageOn] = React.useState(false);
  const [leverage, setLeverageValue] = React.useState<number>(MARGIN.defaultLeverage);
  const [targets, setTargets] = React.useState<TradeTargets>({ takeProfit: null, stopLoss: null });
  const [drafting, setDrafting] = React.useState(false);
  const [draftFailed, setDraftFailed] = React.useState(false);
  const [targetsSaved, setTargetsSaved] = React.useState<{ positionId: string; needsGrant: boolean } | "failed">();

  // The market named by a link ("btc", "cirBTC") or the first one with a side open; the side follows what it allows.
  const view = React.useMemo(() => {
    if (!markets || markets.length === 0) return undefined;
    const wanted = market?.toLowerCase();
    return (
      markets.find((entry) => entry.market.toLowerCase() === wanted || entry.asset.toLowerCase() === wanted) ??
      markets.find((entry) => wanted !== undefined && entry.market.toLowerCase().includes(wanted)) ??
      markets.find((entry) => entry.long.available) ??
      markets[0]
    );
  }, [market, markets]);
  React.useEffect(() => {
    if (view && view.market !== market) setMarket(view.market);
  }, [market, view]);
  React.useEffect(() => {
    if (view && !view[side].available && view[side === "long" ? "short" : "long"].available) setSide(side === "long" ? "short" : "long");
  }, [side, view]);

  // An explicit leverage choice is remembered on this device (D-344); a failed read just starts at "No leverage".
  React.useEffect(() => {
    void AsyncStorage.getItem(LEVERAGE_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { on?: boolean; value?: number }) : undefined;
        if (saved?.on) setLeverageOn(true);
        if (typeof saved?.value === "number") setLeverageValue(saved.value);
      })
      .catch(() => undefined);
  }, []);
  const remember = (on: boolean, value: number) => void AsyncStorage.setItem(LEVERAGE_KEY, JSON.stringify({ on, value })).catch(() => undefined);

  const sideView = view?.[side];
  const maxLeverage = Math.max(NO_LEVERAGE, Math.floor((sideView?.maxLeverage ?? MARGIN.maxLeverage) / MARGIN.leverageStep) * MARGIN.leverageStep);
  const chosenLeverage = leverageOn ? Math.min(leverage, maxLeverage) : NO_LEVERAGE;
  const leverageAvailable = maxLeverage > NO_LEVERAGE;

  const usdc = wallet?.networks.mainnet?.usdcBalance;
  const spendable = usdc !== undefined ? BigInt(usdc) - GAS_FLOAT_USDC_BASE_UNITS : undefined;
  const available = spendable !== undefined && spendable > ZERO ? Number(formatUnits(spendable, USDC_DECIMALS)) : spendable !== undefined ? 0 : undefined;
  const marginValue = Number(normalise(amount) || "0");
  const signedIn = status === "account";

  const request = React.useMemo<MarginRequest | undefined>(
    () => (view && marginValue > 0 && sideView?.available ? { action: "open", market: view.market, side, margin: normalise(amount), leverage: chosenLeverage } : undefined),
    [amount, chosenLeverage, marginValue, side, sideView?.available, view],
  );
  const requestKey = request ? `${request.market}:${request.side}:${request.margin}:${request.leverage}` : "";

  // Drafting: the newest request wins; one call in flight; a revise that the api refuses (the order went final or
  // expired) starts a fresh order instead.
  const intentRef = React.useRef<MarginIntent | undefined>(undefined);
  intentRef.current = controller.intent;
  const wanted = React.useRef<MarginRequest | undefined>(undefined);
  const running = React.useRef(false);
  const pump = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setDrafting(true);
    try {
      let sent: MarginRequest | undefined;
      while (wanted.current && wanted.current !== sent) {
        sent = wanted.current;
        const current = intentRef.current;
        try {
          const next =
            current && isMarginOpen(current)
              ? await api.margin.revise(current.id, sent).catch(() => api.margin.create(sent!))
              : await api.margin.create(sent);
          intentRef.current = next.intent;
          controller.set(next.intent);
          setDraftFailed(false);
        } catch {
          setDraftFailed(true);
        }
      }
    } finally {
      running.current = false;
      setDrafting(false);
    }
  }, [controller]);

  React.useEffect(() => {
    if (!request || !signedIn) return undefined;
    const current = intentRef.current;
    // An order on its way, or its receipt, is never redrafted underneath the person.
    if (current && !isMarginOpen(current) && !isMarginFinished(current)) return undefined;
    if (current && isMarginFinished(current) && current.state === "completed") return undefined;
    const timer = setTimeout(() => {
      wanted.current = request;
      void pump();
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Keyed on the request's content (`requestKey`), not on the object's identity.
  }, [requestKey, signedIn, pump]);

  // Price the same inputs again (the ring ran out, or "Try again"): a fresh object, so the pump sends it once more.
  const requestRef = React.useRef<MarginRequest | undefined>(undefined);
  requestRef.current = request;
  const requote = React.useCallback(() => {
    const current = intentRef.current;
    const latest = requestRef.current;
    if (!latest || !signedIn || running.current || controller.busy) return;
    if (current && !isMarginOpen(current)) return;
    wanted.current = { ...latest };
    void pump();
  }, [controller.busy, pump, signedIn]);

  // The draft matches what the ticket shows only when it was drafted from these very inputs.
  const intent = controller.intent;
  const draft = intent?.draft ?? null;
  const current =
    Boolean(draft && request) && draft!.market === request!.market && draft!.side === request!.side && Number(formatUnits(BigInt(draft!.margin), USDC_DECIMALS)) === marginValue && draft!.leverage === request!.leverage;

  // After an open completes: the chosen targets go onto the new position (watched once Kawase may close it).
  const completedPosition = intent?.state === "completed" && intent.request.action === "open" ? intent.positionId : null;
  const mark = usd(draft?.markPrice);
  React.useEffect(() => {
    if (!completedPosition || !draft || mark === null || (targets.takeProfit === null && targets.stopLoss === null)) return;
    if (targetsSaved && targetsSaved !== "failed" && targetsSaved.positionId === completedPosition) return;
    const price = (target: keyof TradeTargets) => (targets[target] === null ? null : targetPrice(mark, draft.side, target, targets[target]!).toFixed(CENTS));
    api.margin
      .protect(completedPosition, { takeProfit: price("takeProfit"), stopLoss: price("stopLoss") })
      .then((result) => setTargetsSaved({ positionId: completedPosition, needsGrant: result.needsGrant }))
      .catch(() => setTargetsSaved("failed"));
  }, [completedPosition, draft, mark, targets, targetsSaved]);
  React.useEffect(() => {
    if (completedPosition) void refreshWallet();
  }, [completedPosition, refreshWallet]);

  return {
    controller,
    view,
    market: view?.market,
    setMarket: (next: string) => {
      setMarket(next);
      setTargets({ takeProfit: null, stopLoss: null });
    },
    side,
    setSide,
    sideView,
    amount,
    setAmount: (text: string) => {
      if (AMOUNT_PATTERN.test(text)) setAmountText(text);
    },
    /** A share of what the wallet can spend (¼ ½ ¾ All), in cents, rounded down. */
    setShare: (share: number) => {
      if (spendable === undefined || spendable <= ZERO) return;
      const part = (spendable * BigInt(Math.round(share * PERCENT))) / BigInt(PERCENT);
      setAmountText(formatUnits(part - (part % CENT_UNITS), USDC_DECIMALS));
    },
    available,
    marginValue,
    leverageOn,
    leverageAvailable,
    setLeverageOn: (on: boolean) => {
      setLeverageOn(on);
      remember(on, leverage);
    },
    leverage: chosenLeverage,
    maxLeverage,
    setLeverage: (value: number) => {
      setLeverageValue(value);
      remember(true, value);
    },
    targets,
    setTarget: (target: keyof TradeTargets, step: TargetStep) => setTargets((was) => ({ ...was, [target]: step })),
    signedIn,
    drafting,
    draftFailed,
    /** The order's draft, when it was priced from exactly what the ticket shows. */
    draft: current ? draft : null,
    requote,
    targetsSaved,
    /** Start over after a receipt. */
    again: () => {
      controller.reset();
      intentRef.current = undefined;
      wanted.current = undefined;
      setAmountText("");
      setTargets({ takeProfit: null, stopLoss: null });
      setTargetsSaved(undefined);
    },
  };
}

export type Trade = ReturnType<typeof useTrade>;
