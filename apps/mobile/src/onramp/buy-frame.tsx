// The purchase inside the app (D42): react-native-webview showing Kawase's own buy page, so the person never sees the
// provider's site as a separate page. Settings from the docs pack (buy-market §3):
// - iOS `enableApplePay`: Apple Pay works in the WebView, and WebKit turns off injected JavaScript, so the page talks to
//   the app only through `window.webkit.messageHandlers.ReactNativeWebView.postMessage` (buy-page.tsx does).
// - Android `paymentRequestEnabled` for Google Pay (needs WebView 137+ and Play Services). The manifest side comes with
//   react-native-webview 13.16: its library manifest declares the PAY / IS_READY_TO_PAY / UPDATE_PAYMENT_DETAILS
//   <queries> (merged into the app's) and it builds against androidx.webkit 1.14.0.
// - The default user agent stays: the providers warn that Apple Pay breaks with a custom one.
// - A Coinbase payment link (a provider page, not ours) is loaded as is and its own events are read here.
// Whether Circle's widget (Transak inside) takes Apple Pay inside a WKWebView is unverified until a real iPhone tries
// it; when it does not, the same page opens in the system sheet, still on our URL.
import * as React from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { ErrorState, LoadingState } from "@/components/kit";
import { SPACE, useTheme } from "@/components/kit/theme";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { HOST_EVENTS, readBuyEvent, type BuyEvent } from "./order-events";

/** What the frame shows: Kawase's page for the order (Circle), or a provider's payment link (Coinbase). */
export type BuySource = { kind: "page"; pageUrl: string } | { kind: "link"; url: string };

export type BuyFrameProps = {
  orderId: string;
  source: BuySource;
  /** Every provider event, as soon as it happens (the screen around moves its steps; the order itself is read from the api). */
  onEvent?: ((event: BuyEvent) => void) | undefined;
  /** The page says the money arrived (the screen plays its own confirmation). */
  onSettled?: (() => void) | undefined;
  /** The person closed the page; `retry` asks the screen around to start the purchase again. */
  onClose?: ((options?: { retry?: boolean }) => void) | undefined;
  /** Inside the Buy sheet, which draws the title, the close and the steps itself: the page leaves out its own. */
  embedded?: boolean | undefined;
};

/** Kawase's page with `?embed=1` before the fragment (the order key stays in the fragment, never sent to a server). */
export function embeddedUrl(pageUrl: string): string {
  const [head = "", hash] = pageUrl.split("#");
  const url = `${head}${head.includes("?") ? "&" : "?"}embed=1`;
  return hash ? `${url}#${hash}` : url;
}

const ALLOWED_ORIGINS = ["https://*", "apple-pay://*"];
/** A server error (5xx) on the page means it did not load; a 4xx is the page's own state to show. */
const SERVER_ERROR = 500;
const ALLOWED_SCHEMES = /^(https:|apple-pay:|about:)/i;

export function BuyFrame({ orderId, source, onEvent, onSettled, onClose, embedded }: BuyFrameProps) {
  const { t } = useT();
  const { color } = useTheme();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const uri = source.kind === "page" ? (embedded ? embeddedUrl(source.pageUrl) : source.pageUrl) : source.url;

  const onMessage = React.useCallback(
    (message: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.nativeEvent.data);
      } catch {
        return;
      }
      const hostMessage = parsed as { event?: unknown; retry?: unknown } | null;
      const name = hostMessage?.event;
      if (name === HOST_EVENTS.settled) onSettled?.();
      else if (name === HOST_EVENTS.close) onClose?.({ retry: hostMessage?.retry === true });
      const event = readBuyEvent(parsed);
      if (!event || event.event.startsWith("KAWASE_")) return;
      // A provider's own page cannot report to the api; the app does it for that one (our page reports itself).
      const report = source.kind === "link" ? api.onramp.event(orderId, { event: event.event, code: event.code, ...(event.payload ? { payload: event.payload } : {}) }).catch(() => undefined) : Promise.resolve();
      void report.then(() => onEvent?.(event));
    },
    [onClose, onEvent, onSettled, orderId, source.kind],
  );

  if (failed) {
    return (
      <View style={styles.fill}>
        <ErrorState
          diagnosis={{ kind: "server", retryable: true }}
          stillWorks={t("buy.loadFailedBody")}
          retry={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: color.card }]}>
      <WebView
        key={attempt}
        source={{ uri }}
        // Apple Pay in the page (iOS). It disables injected JavaScript, which the page does not need.
        enableApplePay={source.kind === "page"}
        // Google Pay in the page (Android).
        paymentRequestEnabled
        originWhitelist={ALLOWED_ORIGINS}
        onShouldStartLoadWithRequest={(request) => ALLOWED_SCHEMES.test(request.url)}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= SERVER_ERROR) setFailed(true);
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: color.card }]}>
            <LoadingState shape="detail" label={t("buy.loadingPage")} named />
          </View>
        )}
        allowsInlineMediaPlayback
        // The cards' own checkout, ID and 3-D Secure steps open sheets and popups of their own.
        setSupportMultipleWindows
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { padding: SPACE.lg },
});
