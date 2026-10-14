// Kawase's own checkout page for a purchase (`app.getkawase.xyz/buy/:orderId`, D42). The card and ID step belongs to a
// licensed provider; everything around it is ours: the Kawase header, the progress rail (Paying · Buying · On Arc), the
// loading, failure, waiting and receipt states, and what the person is told about their money at every point.
// It runs in three places: a browser tab, a WebView inside the app (react-native-webview, no sign-in: the order's key
// travels in the URL fragment) and, rendered by the same code, inline in the web app. Circle's widget (web only) is
// the one provider part; its events are forwarded to the api (`POST /onramp/orders/:id/events`) and to the app around
// the page, which moves the rail at once. The order settles only when the money is seen arriving on chain.
import { ExternalLink, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";

import { createApiClient, type OnrampSessionView } from "@kawase/api-client";
import { exchangeKey, getEntity, providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { confirmedFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { API_URL, api } from "@/session/api";

import { CircleWidget } from "./circle-widget";
import { HOST_EVENTS, KNOWN_REASONS, OPEN_STATUSES, RETRYABLE_REASONS, postToHost, railSteps, useOrderWatch, type BuyEvent } from "./order-events";
import { ProgressRail } from "./progress-rail";

/** A skeleton stays up at least this long so it never flashes (the premium bar's held loading). */
const HOLD_MS = 300;
/** After this long in "Buying" the page shows the seconds; after the next it offers a retry of the read. */
const ELAPSED_AFTER_MS = 3_000;
const STILL_WAITING_AFTER_MS = 15_000;
const COLUMN_MAX = 480;
const MS_PER_SECOND = 1_000;
/** The rail skeleton: three discs, two bars between them. */
const RAIL_STEPS = 3;
const RAIL_DISCS = Array.from({ length: RAIL_STEPS }, (_, index) => index);
const RAIL_LAST = RAIL_STEPS - 1;
const MARK = 24;
const HEADER_MARK = 28;

export type BuyPageProps = {
  orderId: string;
  /** The order's key from the URL fragment; absent when the person is signed in on this device. */
  pageKey?: string | undefined;
  /** The person is done or wants out; `retry` asks the screen around to start the purchase again. */
  onClose: (options?: { retry?: boolean }) => void;
};

/** True after `loading` has been true for HOLD_MS, so a quick answer does not flash the skeleton. */
function useHeld(loading: boolean): boolean {
  const [held, setHeld] = React.useState(loading);
  React.useEffect(() => {
    if (loading) {
      setHeld(true);
      return undefined;
    }
    const timer = setTimeout(() => setHeld(false), HOLD_MS);
    return () => clearTimeout(timer);
  }, [loading]);
  return held;
}

function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const sync = () => setOnline(globalThis.navigator?.onLine !== false);
    sync();
    globalThis.addEventListener("online", sync);
    globalThis.addEventListener("offline", sync);
    return () => {
      globalThis.removeEventListener("online", sync);
      globalThis.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

/** Seconds since `since` (an ISO time), counted while `active`. */
function useElapsedMs(since: string | undefined, active: boolean): number {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [active]);
  return since && active ? Math.max(0, now - new Date(since).getTime()) : 0;
}

/** The skeleton shaped like the page: header, rail, the widget's box. */
function PageSkeleton() {
  const { t } = useT();
  return (
    <View className="gap-6" accessibilityRole="progressbar" accessibilityLabel={t("buy.loadingPage")}>
      <View className="flex-row items-center gap-2">
        {RAIL_DISCS.map((index) => (
          <React.Fragment key={index}>
            <Skeleton className="size-7 rounded-full" />
            {index < RAIL_LAST ? <Skeleton className="h-1 flex-1 rounded-full" /> : null}
          </React.Fragment>
        ))}
      </View>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-96 w-full rounded-3xl" />
    </View>
  );
}

function StateCard({ title, body, children, tone = "neutral" }: { title: string; body?: string | undefined; children?: React.ReactNode; tone?: "neutral" | "error" | "success" }) {
  return (
    <View className={cn("gap-3 rounded-3xl border p-5", tone === "error" ? "border-destructive/40 bg-card" : "border-border bg-card")} accessibilityRole="alert">
      <Text className={cn("font-display text-xl font-bold", tone === "error" ? "text-destructive" : "text-foreground", TEXT_START)}>{title}</Text>
      {body ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function BuyPage({ orderId, pageKey, onClose }: BuyPageProps) {
  const { t } = useT();
  const money = useMoney();
  const online = useOnline();
  // The page in a WebView has no sign-in: its order key is the bearer, good for this order's three calls only.
  const client = React.useMemo(() => (pageKey ? createApiClient({ baseUrl: API_URL, getToken: () => pageKey }) : api), [pageKey]);
  const watch = useOrderWatch(orderId, client.onramp);
  const { order, accept } = watch;
  const held = useHeld(watch.loading);

  // Circle's session for the widget: minted fresh by the api for this open order (it re-mints on SESSION_TIMEOUT).
  const [session, setSession] = React.useState<OnrampSessionView>();
  const [sessionTry, setSessionTry] = React.useState(0);
  const [widgetState, setWidgetState] = React.useState<"minting" | "mounting" | "ready" | "failed">("minting");
  const [widgetFailure, setWidgetFailure] = React.useState<{ code: string; retry: boolean }>();
  const wantsWidget = order?.engine !== "coinbase" && !!order && (order.status === "created" || order.status === "opened" || order.status === "submitted");

  React.useEffect(() => {
    if (!wantsWidget || session) return undefined;
    let live = true;
    setWidgetState("minting");
    client.onramp
      .session(orderId)
      .then((fresh) => {
        if (!live) return;
        setSession(fresh);
        setWidgetState("mounting");
      })
      .catch(() => {
        if (!live) return;
        setWidgetFailure({ code: "SESSION_MINT_FAILED", retry: true });
        setWidgetState("failed");
      });
    return () => {
      live = false;
    };
  }, [client, orderId, session, sessionTry, wantsWidget]);

  const reopen = React.useCallback(() => {
    setSession(undefined);
    setWidgetFailure(undefined);
    setSessionTry((value) => value + 1);
  }, []);

  const onEvent = React.useCallback(
    (event: BuyEvent) => {
      postToHost(event);
      void client.onramp
        .event(orderId, { event: event.event, code: event.code, ...(event.payload ? { payload: event.payload } : {}) })
        .then((answer) => accept(answer.order))
        .catch(() => undefined);
    },
    [accept, client, orderId],
  );

  // Arrival plays once, here only when no app is around the page (the app plays it from the message).
  const settledOnce = React.useRef(false);
  React.useEffect(() => {
    if (order?.status !== "settled" || settledOnce.current) return;
    settledOnce.current = true;
    if (!postToHost({ event: HOST_EVENTS.settled, orderId })) void confirmedFeedback(`onramp:${orderId}`);
  }, [order?.status, orderId]);

  const elapsed = useElapsedMs(order?.createdAt, order?.status === "submitted" || order?.stage === "bridging");
  const sandbox = order?.network === "testnet";
  const open = !!order && OPEN_STATUSES.has(order.status);
  const items = order
    ? railSteps(order).map((step) => ({ id: step.id, state: step.state, label: t(`buy.rail_${step.id}`) }))
    : [];
  // The licensed party's mark and name come from the identity registry (real logos, one source of names).
  const provider = order?.engine === "coinbase" ? exchangeKey("coinbase") : providerKey("circle");
  const providerName = getEntity(provider)?.name ?? "";

  let body: React.ReactNode;
  if (held && !order) {
    body = <PageSkeleton />;
  } else if (!order) {
    // The read failed and there is no earlier answer: say what still holds, offer the one action.
    body = (
      <StateCard title={t("buy.loadFailedTitle")} body={t("buy.loadFailedBody")} tone="error">
        <Button onPress={watch.reload}>
          <Text>{t("buy.tryAgain")}</Text>
        </Button>
      </StateCard>
    );
  } else if (order.status === "settled") {
    body = (
      <StateCard title={t("buy.funded")} body={t("buy.fundedBody", { amount: money(order.asset, order.received) })} tone="success">
        {order.tx ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(order.tx!.explorerUrl)} className="flex-row items-center gap-2">
            <Icon as={ExternalLink} className="text-muted-foreground size-4" />
            <Text className="text-muted-foreground text-sm underline">{t("buy.viewTx")}</Text>
          </Pressable>
        ) : null}
        <Button onPress={() => onClose()}>
          <Text>{t("buy.done")}</Text>
        </Button>
      </StateCard>
    );
  } else if (order.status === "not_completed" || order.status === "expired") {
    const reason = order.reason && KNOWN_REASONS.has(order.reason) ? order.reason : "other";
    const retry = order.status === "expired" || !order.reason || RETRYABLE_REASONS.has(order.reason);
    body = (
      <StateCard title={t("buy.notCompleted")} body={order.status === "expired" ? t("buy.expired") : t(`buy.reason_${reason}`)} tone="error">
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t(reason === "CUSTOMER_PENDING_REVIEW" ? "buy.moneyPending" : "buy.moneyNone")}</Text>
        {retry ? (
          <Button onPress={() => onClose({ retry: true })}>
            <Text>{t("buy.tryAgain")}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" onPress={() => onClose()}>
          <Text>{t("buy.done")}</Text>
        </Button>
      </StateCard>
    );
  } else {
    const waiting = order.status === "submitted" || order.stage === "bridging" || order.stage === "on_base";
    body = (
      <View className="gap-4">
        {order.engine !== "coinbase" ? (
          <View className={cn(waiting && "hidden")}>
            {widgetState === "failed" ? (
              <StateCard title={t("buy.widgetFailedTitle")} body={t("buy.widgetFailedBody")} tone="error">
                {session?.widgetUrl && Platform.OS === "web" ? (
                  <Button variant="outline" onPress={() => globalThis.open?.(session.widgetUrl, "_blank", "noopener")}>
                    <Text>{t("buy.openInBrowser")}</Text>
                  </Button>
                ) : null}
                {widgetFailure?.retry !== false ? (
                  <Button onPress={reopen}>
                    <Text>{t("buy.tryAgain")}</Text>
                  </Button>
                ) : null}
              </StateCard>
            ) : session ? (
              <View className="overflow-hidden rounded-3xl">
                <CircleWidget
                  session={session}
                  sandbox={sandbox}
                  onReady={() => setWidgetState("ready")}
                  onEvent={onEvent}
                  onFailed={(code, retry) => {
                    setWidgetFailure({ code, retry });
                    setWidgetState("failed");
                  }}
                  onSessionExpired={reopen}
                />
                {widgetState !== "ready" ? (
                  <View className="bg-background absolute inset-0 p-2" pointerEvents="none">
                    <PageSkeleton />
                  </View>
                ) : null}
              </View>
            ) : (
              <PageSkeleton />
            )}
          </View>
        ) : null}
        {waiting || order.engine === "coinbase" ? (
          <StateCard title={t(`buy.wait_${order.stage ?? "buying"}`, { asset: order.asset })} body={t("buy.safeToLeave")}>
            {elapsed >= STILL_WAITING_AFTER_MS ? (
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-muted-foreground text-sm">{t("buy.stillWaiting")}</Text>
                <Button size="sm" variant="secondary" onPress={watch.reload}>
                  <Text>{t("buy.retryRead")}</Text>
                </Button>
              </View>
            ) : elapsed >= ELAPSED_AFTER_MS ? (
              <Text className="text-muted-foreground text-sm">{t("buy.elapsed", { seconds: Math.floor(elapsed / MS_PER_SECOND) })}</Text>
            ) : null}
            {order.bridge?.intentId ? (
              <Text className="text-muted-foreground text-xs">{t("buy.bridgeNote")}</Text>
            ) : null}
          </StateCard>
        ) : null}
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      <ScrollView contentContainerClassName="items-center px-4 py-4" keyboardShouldPersistTaps="handled">
        <View className="w-full gap-5" style={{ maxWidth: COLUMN_MAX }}>
          <View className="flex-row items-center gap-3">
            <Mark entity="provider:kawase" size={HEADER_MARK} />
            <View className="flex-1">
              <Text className={cn("font-display text-foreground text-lg font-bold", TEXT_START)} numberOfLines={1}>
                {t("buy.pageTitle", { asset: order?.asset ?? "USDC" })}
              </Text>
            </View>
            {sandbox ? (
              <View className="bg-secondary rounded-full px-3 py-1">
                <Text className="text-secondary-foreground text-xs font-semibold">{t("buy.sandboxChip")}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("buy.close")}
              hitSlop={12}
              onPress={() => {
                postToHost({ event: HOST_EVENTS.close, orderId });
                onClose();
              }}
              className="bg-secondary size-9 items-center justify-center rounded-full"
            >
              <Icon as={X} className="text-foreground size-4" />
            </Pressable>
          </View>

          {!online ? (
            <View className="bg-muted rounded-2xl px-4 py-3" accessibilityRole="alert">
              <Text className="text-muted-foreground text-sm">{t("buy.offline")}</Text>
            </View>
          ) : watch.failed && order && open ? (
            <View className="bg-muted rounded-2xl px-4 py-3">
              <Text className="text-muted-foreground text-sm">{t("buy.stale")}</Text>
            </View>
          ) : null}

          {order ? <ProgressRail items={items} /> : null}
          {body}

          {order ? (
            <View className="flex-row items-center justify-center gap-2 pt-2">
              <Mark entity={provider} size={MARK} variant="mono" />
              <Text className="text-muted-foreground text-xs">{t("buy.checkedBy", { provider: providerName })}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
