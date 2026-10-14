// Buy inside Kawase (D42): one flow for the whole app — the Add money hub's Buy, a token page's Buy, the chat's
// start_buy card, the agent wallet's card top-up. Everything is ours except the licensed provider's card and ID step:
//   amount  AmountPad, the "You get" line (Coinbase's live quote where it is offered, Circle's figure before its fee)
//   method  rows with the real marks, only what this device can pay with; a row that cannot take the amount names its fix
//   contact Coinbase only: a US phone and the account's email, each confirmed with a code, and its terms (said up front)
//   pay     Kawase's own buy page (`/buy/:orderId`) in our frame: Circle's widget mounted on it, or Coinbase's pay link
//   arriving Paying · Buying · (Moving to Arc) · On Arc, read from the api (the chain settles it, never the widget)
//   done    the steps morph into the receipt, the balance rolls in, the arrival sound plays once
// The order keeps being watched after the sheet closes; when it lands the person hears it and sees a toast.
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";
import { Platform } from "react-native";

import { ApiError, type OnrampAvailability, type OnrampCoinbaseContact, type OnrampOrderView, type OnrampQuoteView, type OnrampStartRequest } from "@kawase/api-client";
import { ONRAMP } from "@kawase/config";

import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import type { BuySource } from "./buy-frame-types";
import { BuySheet } from "./buy-sheet";
import { payOptions, type PayOption } from "./methods";
import { useOrderWatch } from "./order-events";

const CENTS = 100n;
const ZERO = 0n;
const CENT_DIGITS = 2;
const USDC_UNIT = 1_000_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Only a token Kawase knows is the real one gets bought automatically after a card purchase (the copycat rule). */
const TRUSTED: ReadonlySet<string> = new Set(["canonical", "listed"]);
/** A quote is asked this long after the amount stops changing. */
const QUOTE_DEBOUNCE_MS = 450;
/** Coinbase's events that mean the payment went in (the api reads the provider's own state from here on). */
const SUBMITTED = new Set(["DEPOSIT_SUBMITTED", "DEPOSIT_SETTLED", "onramp_api.commit_success", "onramp_api.polling_success"]);

export type BuyStep = "amount" | "method" | "contact" | "pay" | "arriving";

/** A Coinbase contact confirmed in this session (Coinbase keeps a verification for 60 days). */
export type VerifiedContact = Omit<OnrampCoinbaseContact, "acceptedTerms">;

export type BuyFlow = {
  step: BuyStep;
  prefill: OnrampStartRequest;
  availability: { state: "loading" } | { state: "ready"; value: OnrampAvailability } | { state: "failed" };
  /** The fiat amount in cents. */
  cents: bigint;
  setCents: (cents: bigint) => void;
  asset: "USDC" | "EURC";
  currency: "USD" | "EUR";
  setAsset: (asset: "USDC" | "EURC") => void;
  then: string | null;
  setThen: (then: string | null) => void;
  options: PayOption[];
  /** Coinbase's live price for this amount (null while asking, or where Coinbase is not offered). */
  quote: { state: "idle" | "loading" | "failed" } | { state: "ready"; value: OnrampQuoteView };
  /** The row being started. */
  starting: string | null;
  /** Why the last start failed, in words for the person (and the row it was on). */
  startError: { key: string; message: string; limit: boolean } | null;
  option: PayOption | null;
  contact: VerifiedContact | null;
  order: OnrampOrderView | undefined;
  /** The order read failed (the last one seen is shown, stale). */
  orderStale: boolean;
  reloadOrder: () => void;
  source: BuySource | null;
  goTo: (step: BuyStep) => void;
  choose: (option: PayOption) => void;
  confirmContact: (contact: VerifiedContact) => void;
  onFrameEvent: (event: { event: string }) => void;
  onFrameClose: (options?: { retry?: boolean }) => void;
  retry: () => void;
  close: () => void;
  thenAction: () => void;
};

type BuyContextValue = {
  /** Opens the sheet (amount and method) with an optional prefill. */
  open: (prefill?: OnrampStartRequest) => void;
};

const BuyContext = React.createContext<BuyContextValue | null>(null);

const centsOf = (decimal: string | null | undefined): bigint => {
  if (!decimal || !/^\d+(\.\d{1,2})?$/.test(decimal)) return ZERO;
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole) * CENTS + BigInt(fraction.padEnd(CENT_DIGITS, "0"));
};
const decimalOf = (cents: bigint): string => `${cents / CENTS}.${(cents % CENTS).toString().padStart(CENT_DIGITS, "0")}`;

/** A sandbox Coinbase link in a browser frame on the web needs Coinbase's sandbox wallet sheet (docs pack §4). */
function linkFor(url: string, option: PayOption, sandbox: boolean): string {
  if (Platform.OS !== "web" || !sandbox) return url;
  const flag = option.method === "google_pay" ? "useGooglePaySandbox" : "useApplePaySandbox";
  return `${url}${url.includes("?") ? "&" : "?"}${flag}=true`;
}

export function BuyProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const [isOpen, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<BuyStep>("amount");
  const [prefill, setPrefill] = React.useState<OnrampStartRequest>({});
  const [availability, setAvailability] = React.useState<BuyFlow["availability"]>({ state: "loading" });
  const [cents, setCents] = React.useState<bigint>(centsOf(ONRAMP.defaultAmount));
  const [asset, setAsset] = React.useState<"USDC" | "EURC">("USDC");
  const [then, setThen] = React.useState<string | null>(null);
  const [quote, setQuote] = React.useState<BuyFlow["quote"]>({ state: "idle" });
  const [starting, setStarting] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<BuyFlow["startError"]>(null);
  const [option, setOption] = React.useState<PayOption | null>(null);
  const [contacts, setContacts] = React.useState<Record<string, VerifiedContact>>({});
  const [orderId, setOrderId] = React.useState<string>();
  const [source, setSource] = React.useState<BuySource | null>(null);
  const watch = useOrderWatch(orderId, api.onramp);
  const order = watch.order;
  const scope = `${user?.id ?? "guest"}:${user?.activeNetwork ?? "testnet"}`;
  const contact = contacts[scope] ?? null;
  const currency = asset === "EURC" ? "EUR" : "USD";
  const sandbox = availability.state === "ready" ? availability.value.sandbox : (user?.activeNetwork ?? "testnet") !== "mainnet";
  const options = React.useMemo(
    () =>
      payOptions(availability.state === "ready" ? availability.value : undefined)
        // The agent wallet is topped up on Arc directly; Coinbase delivers on Base. EURC comes from Circle only.
        .filter((entry) => !(entry.engine === "coinbase" && (prefill.destination === "agent_wallet" || asset === "EURC"))),
    [availability, prefill.destination, asset],
  );

  const open = React.useCallback(
    (next?: OnrampStartRequest) => {
      if (status !== "account") {
        signIn.open();
        return;
      }
      const wanted = next?.asset?.toUpperCase() === "EURC" ? "EURC" : "USDC";
      setPrefill(next ?? {});
      setAsset(wanted);
      setThen(next?.then ?? null);
      setCents(centsOf(next?.amount ?? ONRAMP.defaultAmount) || centsOf(ONRAMP.defaultAmount));
      setStep("amount");
      setOption(null);
      setStarting(null);
      setStartError(null);
      setSource(null);
      setOrderId(undefined);
      setOpen(true);
    },
    [signIn, status],
  );

  // What the server offers here (engines, methods, sandbox), read each time the sheet opens.
  React.useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    setAvailability((previous) => (previous.state === "ready" && previous.value.network === user?.activeNetwork ? previous : { state: "loading" }));
    api.onramp
      .status()
      .then((value) => live && setAvailability({ state: "ready", value }))
      .catch(() => live && setAvailability({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [isOpen, user?.activeNetwork]);

  // Coinbase's live price for the amount, when Coinbase is offered here (Circle's widget shows its own).
  const coinbase = options.find((entry) => entry.engine === "coinbase");
  React.useEffect(() => {
    if (!isOpen || !coinbase || cents <= ZERO || currency !== "USD") {
      setQuote({ state: "idle" });
      return undefined;
    }
    let live = true;
    setQuote({ state: "loading" });
    const timer = setTimeout(() => {
      api.onramp
        .quote({ engine: "coinbase", amount: decimalOf(cents), currency, method: coinbase.method })
        .then((value) => live && setQuote({ state: "ready", value }))
        .catch(() => live && setQuote({ state: "failed" }));
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [isOpen, coinbase, cents, currency]);

  const start = React.useCallback(
    async (chosen: PayOption, verified: VerifiedContact | null) => {
      setStarting(chosen.key);
      setStartError(null);
      try {
        const request: OnrampStartRequest = {
          ...prefill,
          amount: decimalOf(cents),
          asset,
          currency,
          then,
          engine: chosen.engine,
          method: chosen.method,
          frame: "page",
          ...(chosen.engine === "coinbase" && verified ? { coinbase: { ...verified, acceptedTerms: true as const } } : {}),
        };
        const started = await api.onramp.start(request);
        watch.accept(started.order);
        setOrderId(started.order.id);
        if (chosen.engine === "coinbase") {
          setSource({ kind: "link", url: linkFor(started.widgetUrl, chosen, sandbox) });
        } else if (started.pageUrl || Platform.OS === "web") {
          // On the web the page renders inline (the same code), with the signed-in session when no page link is served.
          setSource({ kind: "page", pageUrl: started.pageUrl ?? `${globalThis.location?.origin ?? ""}/buy/${started.order.id}` });
        } else {
          // No page served for this api: Circle's checkout in the system sheet, then back to the steps here.
          await WebBrowser.openBrowserAsync(started.widgetUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, dismissButtonStyle: "done" });
          setStep("arriving");
          return;
        }
        setStep("pay");
      } catch (failure) {
        const reason = failure instanceof ApiError && typeof failure.problem.reason === "string" ? failure.problem.reason : null;
        const limit = Boolean(reason?.startsWith("guest_") && reason.includes("limit"));
        const message =
          reason === "guest_region_forbidden"
            ? t("buy.errorRegion")
            : limit
              ? t("buy.errorLimit")
              : reason === "otp_verification_required" || reason?.startsWith("otp_")
                ? t("buy.errorVerify")
                : t("buy.failedStart");
        setStartError({ key: chosen.key, message, limit });
        fire("fail");
        // A verification Coinbase no longer accepts is asked again on the next try.
        if (chosen.engine === "coinbase" && reason?.startsWith("otp_"))
          setContacts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== scope)));
      } finally {
        setStarting(null);
      }
    },
    [asset, cents, currency, prefill, sandbox, scope, t, then, watch],
  );

  const choose = React.useCallback(
    (chosen: PayOption) => {
      if (starting) return;
      setOption(chosen);
      if (chosen.engine === "coinbase" && !contact) {
        setStep("contact");
        return;
      }
      void start(chosen, contact);
    },
    [contact, start, starting],
  );

  const confirmContact = React.useCallback(
    (verified: VerifiedContact) => {
      setContacts((previous) => ({ ...previous, [scope]: verified }));
      if (option) void start(option, verified);
    },
    [option, scope, start],
  );

  const onFrameEvent = React.useCallback(
    (event: { event: string }) => {
      if (SUBMITTED.has(event.event)) setStep("arriving");
      // The provider's event moves the order on the api; read it now rather than at the next poll.
      watch.reload();
    },
    [watch],
  );

  const onFrameClose = React.useCallback(
    (options?: { retry?: boolean }) => {
      if (options?.retry) {
        setOrderId(undefined);
        setSource(null);
        setStep("method");
        return;
      }
      // Out of the frame: the steps say where the purchase stands (paid, or closed without paying and nothing charged).
      setStep("arriving");
      watch.reload();
    },
    [watch],
  );

  const retry = React.useCallback(() => {
    setOrderId(undefined);
    setSource(null);
    setStartError(null);
    setStep("method");
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  // The arrival, once per order: the sound and haptic; a toast too when the sheet is no longer up.
  const announced = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (order?.status !== "settled" || announced.current === order.id) return;
    announced.current = order.id;
    if (isOpen) fire("filled", { sound: "received", identity: `onramp:${order.id}` });
    else notify.arrived(t("buy.arrivedToast", { amount: money(order.asset, order.received) }), { identity: `onramp:${order.id}` });
  }, [isOpen, money, order, t]);

  /** The swap for what arrived: the token as said, resolved to a canonical or listed one (never a lookalike). */
  const thenAction = React.useCallback(() => {
    if (!order?.thenToken || !order.received) return;
    const wanted = order.thenToken;
    const amount = (Number(order.received) / USDC_UNIT).toString();
    void (async () => {
      let address = ADDRESS.test(wanted) ? wanted : undefined;
      if (!address) {
        const { results } = await api.tokens.search(wanted, order.network).catch(() => ({ results: [] }));
        address = results.find((entry) => entry.token.symbol.toLowerCase() === wanted.toLowerCase() && TRUSTED.has(entry.token.status))?.token.address;
      }
      setOpen(false);
      router.push(address ? { pathname: "/swap", params: { from: order.asset, amount, buy: address } } : { pathname: "/swap", params: { from: order.asset, amount } });
    })();
  }, [order, router]);

  const flow: BuyFlow = {
    step,
    prefill,
    availability,
    cents,
    setCents,
    asset,
    currency,
    setAsset,
    then,
    setThen,
    options,
    quote,
    starting,
    startError,
    option,
    contact,
    order,
    orderStale: watch.failed,
    reloadOrder: watch.reload,
    source,
    goTo: setStep,
    choose,
    confirmContact,
    onFrameEvent,
    onFrameClose,
    retry,
    close,
    thenAction,
  };

  const value = React.useMemo(() => ({ open }), [open]);
  return (
    <BuyContext.Provider value={value}>
      {children}
      {isOpen ? <BuySheet flow={flow} /> : null}
    </BuyContext.Provider>
  );
}

export function useBuy(): BuyContextValue {
  const context = React.useContext(BuyContext);
  if (!context) throw new Error("useBuy must be used inside BuyProvider");
  return context;
}
