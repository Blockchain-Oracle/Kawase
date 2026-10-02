// Buy with Apple Pay / Google Pay / debit (money-in.md, Circle Onramp): one flow for the whole app — the Add-money
// sheet's first row, the chat's start_buy card, a token page's Buy when short. Tapping Buy mints a Circle session
// for the person's own address and opens Circle's checkout top level in the system browser sheet (Apple Pay works
// there, not in a WebView). When the sheet closes, Kawase watches the order: the money is confirmed when it lands
// on chain (the api's watcher), then the funded moment plays once; a "then" token opens its swap next.
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import * as React from "react";
import { toast } from "sonner-native";

import { ApiError, type OnrampOrderView, type OnrampStartRequest } from "@kawase/api-client";

import { confirmedFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { BuySheet } from "./buy-sheet";

const POLL_MS = 3_000;
/** After the checkout closes, watch this long in the foreground; the api keeps matching for hours after. */
const WATCH_MS = 180_000;
const USDC_UNIT = 1_000_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Only a token Kawase knows is the real one gets bought automatically after a card purchase (the copycat rule). */
const TRUSTED: ReadonlySet<string> = new Set(["canonical", "listed"]);

export type BuyPhase = "idle" | "starting" | "checkout" | "watching" | "settled" | "not_completed" | "failed";

type BuyContextValue = {
  /** Opens the sheet (amount and method) with an optional prefill. */
  open: (prefill?: OnrampStartRequest) => void;
};

const BuyContext = React.createContext<BuyContextValue | null>(null);

export function BuyProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const colors = useThemeColors();
  const { status } = useSession();
  const signIn = useSignIn();
  const [isOpen, setOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<OnrampStartRequest>({});
  const [phase, setPhase] = React.useState<BuyPhase>("idle");
  const [order, setOrder] = React.useState<OnrampOrderView>();
  const watching = React.useRef(0);

  const open = React.useCallback(
    (next?: OnrampStartRequest) => {
      if (status !== "account") {
        signIn.open();
        return;
      }
      setPrefill(next ?? {});
      setPhase("idle");
      setOrder(undefined);
      setOpen(true);
    },
    [signIn, status],
  );

  /** Polls the order until it settles, stops, or the foreground watch ends (the api keeps watching). */
  const watch = React.useCallback(async (id: string) => {
    const run = ++watching.current;
    const until = Date.now() + WATCH_MS;
    setPhase("watching");
    while (run === watching.current && Date.now() < until) {
      try {
        const { order: next } = await api.onramp.get(id);
        setOrder(next);
        if (next.status === "settled") {
          setPhase("settled");
          void confirmedFeedback(`onramp:${next.id}`);
          return;
        }
        if (next.status === "not_completed" || next.status === "expired") {
          setPhase("not_completed");
          return;
        }
      } catch {
        // A missed poll is retried; nothing is decided from it.
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }, []);

  const start = React.useCallback(
    async (request: OnrampStartRequest) => {
      setPhase("starting");
      try {
        const started = await api.onramp.start(request);
        setOrder(started.order);
        setPhase("checkout");
        await WebBrowser.openBrowserAsync(started.widgetUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          controlsColor: colors.primary,
          dismissButtonStyle: "done",
          readerMode: false,
        });
        await watch(started.order.id);
      } catch (failure) {
        setPhase("failed");
        toast.error(failure instanceof ApiError ? failure.message : t("buy.failedStart"));
      }
    },
    [colors.primary, t, watch],
  );

  const close = React.useCallback(() => {
    watching.current++;
    setOpen(false);
  }, []);

  /** The swap for what arrived: the token as said, resolved to a canonical or listed one (never a lookalike). */
  const then = React.useCallback(async () => {
    if (!order?.thenToken || !order.received) return;
    const wanted = order.thenToken;
    let address = ADDRESS.test(wanted) ? wanted : undefined;
    if (!address) {
      const { results } = await api.tokens.search(wanted, order.network).catch(() => ({ results: [] }));
      address = results.find((entry) => entry.token.symbol.toLowerCase() === wanted.toLowerCase() && TRUSTED.has(entry.token.status))?.token.address;
    }
    close();
    const amount = (Number(order.received) / USDC_UNIT).toString();
    router.push(address ? { pathname: "/swap", params: { from: order.asset, amount, buy: address } } : { pathname: "/swap", params: { from: order.asset, amount } });
  }, [close, order, router]);

  const value = React.useMemo(() => ({ open }), [open]);
  return (
    <BuyContext.Provider value={value}>
      {children}
      <BuySheet open={isOpen} onClose={close} prefill={prefill} phase={phase} order={order} onStart={(request) => void start(request)} onThen={() => void then()} />
    </BuyContext.Provider>
  );
}

export function useBuy(): BuyContextValue {
  const context = React.useContext(BuyContext);
  if (!context) throw new Error("useBuy must be used inside BuyProvider");
  return context;
}
