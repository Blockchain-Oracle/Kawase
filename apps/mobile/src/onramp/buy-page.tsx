// Kawase's own checkout page for a purchase (`app.getkawase.xyz/buy/:orderId`, D42). The card and ID step belongs to a
// licensed provider; everything around it is ours: the Kawase header, the steps (Paying · Buying · On Arc), the loading,
// failure, waiting and receipt states, and what the person is told about their money at every point.
// It runs in three places: a browser tab, a WebView inside the app (react-native-webview, no sign-in: the order's key
// travels in the URL fragment) and, rendered by the same code, inline in the web app's Buy sheet. Embedded (`?embed=1`,
// or inline in the sheet) it leaves the header and the steps to the sheet around it. Circle's widget (web only) is the
// one provider part; its events are forwarded to the api (`POST /onramp/orders/:id/events`) and to the app around the
// page. The order settles only when the money is seen arriving on chain. Built on the Senryo kit.
import * as React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { createApiClient, type OnrampSessionView } from "@kawase/api-client";
import { exchangeKey, getEntity, providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, ErrorState, LoadingState, OfflineStrip, Panel, useHeldLoading, WaitingText } from "@/components/kit";
import { Icon, X } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { API_URL, api } from "@/session/api";

import { BuySteps } from "./buy-steps";
import { CircleWidget } from "./circle-widget";
import { HOST_EVENTS, KNOWN_REASONS, OPEN_STATUSES, RETRYABLE_REASONS, postToHost, useOrderWatch, type BuyEvent } from "./order-events";

const COLUMN_MAX = 480;
const WIDGET_HEIGHT = 720;

export type BuyPageProps = {
  orderId: string;
  /** The order's key from the URL fragment; absent when the person is signed in on this device. */
  pageKey?: string | undefined;
  /** Inside the app's Buy sheet: no header or steps of its own. */
  embedded?: boolean | undefined;
  /** Every provider event, after the api has it. */
  onEvent?: ((event: BuyEvent) => void) | undefined;
  onSettled?: (() => void) | undefined;
  /** The person is done or wants out; `retry` asks the screen around to start the purchase again. */
  onClose: (options?: { retry?: boolean }) => void;
};

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

/** The widget's box while the session is minted and the kit mounts: shaped like the checkout, never a spinner page. */
function WidgetSkeleton() {
  const { t } = useT();
  return (
    <View style={styles.widgetSkeleton}>
      <LoadingState shape="detail" label={t("buy.loadingPage")} named />
    </View>
  );
}

export function BuyPage({ orderId, pageKey, embedded = false, onEvent: relay, onSettled, onClose }: BuyPageProps) {
  const { t } = useT();
  const { color } = useTheme();
  const money = useMoney();
  const online = useOnline();
  // The page in a WebView has no sign-in: its order key is the bearer, good for this order's three calls only.
  const client = React.useMemo(() => (pageKey ? createApiClient({ baseUrl: API_URL, getToken: () => pageKey }) : api), [pageKey]);
  const watch = useOrderWatch(orderId, client.onramp);
  const { order, accept } = watch;
  const held = useHeldLoading(watch.loading && !order);

  // Circle's session for the widget: minted fresh by the api for this open order (it re-mints on SESSION_TIMEOUT). Once
  // the order is submitted the widget gives way to the waiting state, so no session is minted for it.
  const [session, setSession] = React.useState<OnrampSessionView>();
  const [sessionTry, setSessionTry] = React.useState(0);
  const [widgetState, setWidgetState] = React.useState<"minting" | "mounting" | "ready" | "failed">("minting");
  const [widgetFailure, setWidgetFailure] = React.useState<{ code: string; retry: boolean }>();
  const wantsWidget = order?.engine !== "coinbase" && !!order && (order.status === "created" || order.status === "opened");

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
        .catch(() => undefined)
        .then(() => relay?.(event));
    },
    [accept, client, orderId, relay],
  );

  // Every way out (the X, Done, Try again) tells the app around the page first, so a WebView closes its sheet instead
  // of navigating inside itself; `retry` asks the app to start the purchase again.
  const leave = React.useCallback(
    (options?: { retry?: boolean }) => {
      postToHost({ event: HOST_EVENTS.close, orderId, retry: options?.retry === true });
      onClose(options);
    },
    [onClose, orderId],
  );

  // Arrival plays once, here only when no app is around the page (the app plays it from the message).
  const settledOnce = React.useRef(false);
  React.useEffect(() => {
    if (order?.status !== "settled" || settledOnce.current) return;
    settledOnce.current = true;
    onSettled?.();
    if (!postToHost({ event: HOST_EVENTS.settled, orderId }) && !embedded) fire("filled", { sound: "received", identity: `onramp:${orderId}` });
  }, [embedded, onSettled, order?.status, orderId]);

  const waitingSince = React.useRef(Date.now());
  const sandbox = order?.network === "testnet";
  const open = !!order && OPEN_STATUSES.has(order.status);
  // The licensed party's mark and name come from the identity registry (real logos, one source of names).
  const provider = order?.engine === "coinbase" ? exchangeKey("coinbase") : providerKey("circle");
  const providerName = getEntity(provider)?.name ?? "";

  let body: React.ReactNode;
  if (!order && (held || watch.loading)) {
    body = <WidgetSkeleton />;
  } else if (!order) {
    // The read failed and there is no earlier answer: say what still holds, offer the one action.
    body = <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("buy.loadFailedBody")} retry={watch.reload} />;
  } else if (order.status === "settled") {
    body = (
      <Panel style={styles.panel}>
        <Text accessibilityRole="header" style={[TYPE.sheetTitle, { color: color.ink }]}>
          {t("buy.funded")}
        </Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("buy.fundedBody", { amount: money(order.asset, order.received) })}</Text>
        {order.tx ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(order.tx!.explorerUrl)}>
            <Text style={[TYPE.rowDetail, { color: color.link }]}>{t("buy.viewTx")}</Text>
          </Pressable>
        ) : null}
        <Button label={t("buy.done")} onPress={() => leave()} />
      </Panel>
    );
  } else if (order.status === "not_completed" || order.status === "expired") {
    const reason = order.reason && KNOWN_REASONS.has(order.reason) ? order.reason : "other";
    const retry = order.status === "expired" || !order.reason || RETRYABLE_REASONS.has(order.reason);
    body = (
      <View style={[styles.panel, styles.failure, { backgroundColor: color.destructiveSurface }]} accessibilityRole="alert">
        <Text accessibilityRole="header" style={[TYPE.rowTitle, { color: color.ink }]}>
          {t("buy.notCompleted")}
        </Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{order.status === "expired" ? t("buy.expired") : t(`buy.reason_${reason}`)}</Text>
        <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t(reason === "CUSTOMER_PENDING_REVIEW" ? "buy.moneyPending" : "buy.moneyNone")}</Text>
        {retry ? <Button label={t("buy.tryAgain")} onPress={() => leave({ retry: true })} /> : null}
        <Button label={t("buy.done")} variant="ghost" onPress={() => leave()} />
      </View>
    );
  } else if (order.engine !== "coinbase" && (order.status === "created" || order.status === "opened")) {
    body =
      widgetState === "failed" ? (
        <View style={styles.stack}>
          <ErrorState diagnosis={{ kind: "server", retryable: widgetFailure?.retry !== false, technical: widgetFailure?.code ?? "" }} stillWorks={t("buy.widgetFailedBody")} {...(widgetFailure?.retry !== false ? { retry: reopen } : {})} />
          {session?.widgetUrl && Platform.OS === "web" ? <Button label={t("buy.openInBrowser")} variant="secondary" onPress={() => globalThis.open?.(session.widgetUrl, "_blank", "noopener")} /> : null}
        </View>
      ) : session ? (
        <View style={styles.widget}>
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color.background }]} pointerEvents="none">
              <WidgetSkeleton />
            </View>
          ) : null}
        </View>
      ) : (
        <WidgetSkeleton />
      );
  } else {
    // Submitted, or a Coinbase order between its payment and Arc: the wait, said in words.
    const stage = order.stage ?? "buying";
    body = (
      <Panel style={styles.panel}>
        <Text accessibilityRole="header" style={[TYPE.sheetTitle, { color: color.ink }]}>
          {t(`buy.wait_${stage}`, { asset: order.asset })}
        </Text>
        <WaitingText startedAtMs={waitingSince.current} onRetry={watch.reload}>
          {stage === "bridging" || stage === "on_base" ? t("buy.verbMoving") : t("buy.verbBuying")}
        </WaitingText>
        <Text style={[TYPE.body, { color: color.text2 }]}>{sandbox ? t("buy.sandboxArrival") : t("buy.safeToLeave")}</Text>
        {order.bridge?.intentId ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("buy.bridgeNote")}</Text> : null}
      </Panel>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: embedded ? color.card : color.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, embedded ? styles.scrollEmbedded : null]} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {embedded ? null : (
            <View style={styles.header}>
              <Mark entity="provider:kawase" size={SIZE.avatarSm} />
              <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.sheetHeading, styles.grow, { color: color.ink }]}>
                {t("buy.pageTitle", { asset: order?.asset ?? "USDC" })}
              </Text>
              {sandbox ? (
                <View style={[styles.chip, { backgroundColor: color.networkSurface }]}>
                  <Text style={[TYPE.chipLabel, { color: color.network }]}>{t("buy.sandboxChip")}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("buy.close")}
                hitSlop={SPACE.md}
                onPress={() => leave()}
                style={({ pressed }) => [styles.close, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
              >
                <Icon icon={X} size={SIZE.iconSm} tint={color.ink} />
              </Pressable>
            </View>
          )}
          {!online ? <OfflineStrip /> : watch.failed && order && open ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("buy.stale")}</Text> : null}
          {order && !embedded ? <BuySteps order={order} /> : null}
          {body}
          {order ? (
            <View style={styles.footer}>
              <Mark entity={provider} size={SIZE.markChip} variant="mono" tint={color.text3} />
              <Text style={[TYPE.meta, { color: color.text3 }]}>{t("buy.checkedBy", { provider: providerName })}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  stack: { gap: SPACE.md },
  scroll: { alignItems: "center", paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
  scrollEmbedded: { paddingHorizontal: SPACE.none, paddingVertical: SPACE.sm },
  column: { width: "100%", maxWidth: COLUMN_MAX, gap: SPACE.lg },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  chip: { height: SIZE.chipHeight, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill, justifyContent: "center" },
  close: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  panel: { padding: SPACE.xl, gap: SPACE.md },
  failure: { borderRadius: RADIUS.md },
  widget: { borderRadius: RADIUS.lg, overflow: "hidden", minHeight: WIDGET_HEIGHT },
  widgetSkeleton: { minHeight: WIDGET_HEIGHT, paddingTop: SPACE.sm },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.xs, paddingTop: SPACE.sm },
});
