// The purchase inside the app (D42): react-native-webview showing Kawase's own buy page, so the person never sees the
// provider's site as a separate page. Settings from the docs pack (buy-market §3):
// - iOS `enableApplePay`: Apple Pay works in the WebView, and WebKit turns off injected JavaScript, so the page talks to
//   the app only through `window.webkit.messageHandlers.ReactNativeWebView.postMessage` (buy-page.tsx does).
// - Android `paymentRequestEnabled` for Google Pay (needs WebView 137+ and Play Services; the manifest side is the lead's).
// - The default user agent stays: the providers warn that Apple Pay breaks with a custom one.
// - A Coinbase payment link (a provider page, not ours) is loaded as is and its own events are read here.
// Whether Circle's widget (Transak inside) takes Apple Pay inside a WKWebView is unverified until a real iPhone tries
// it; when it does not, the same page opens in the system sheet (`onNeedsBrowser`), still on our URL.
import { RotateCw } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";

import { HOST_EVENTS, readBuyEvent, type BuyEvent } from "./order-events";

/** What the frame shows: Kawase's page for the order (Circle), or a provider's payment link (Coinbase). */
export type BuySource = { kind: "page"; pageUrl: string } | { kind: "link"; url: string };

export type BuyFrameProps = {
  orderId: string;
  source: BuySource;
  /** Every provider event, as soon as it happens (the screen around moves its rail; the order itself is read from the api). */
  onEvent?: ((event: BuyEvent) => void) | undefined;
  /** The page says the money arrived (the screen plays its own confirmation). */
  onSettled?: (() => void) | undefined;
  /** The person closed the page. */
  onClose?: (() => void) | undefined;
  className?: string | undefined;
};

const ALLOWED_ORIGINS = ["https://*", "apple-pay://*"];
/** A server error (5xx) on the page means it did not load; a 4xx is the page's own state to show. */
const SERVER_ERROR = 500;
const ALLOWED_SCHEMES = /^(https:|apple-pay:|about:)/i;

export function BuyFrame({ orderId, source, onEvent, onSettled, onClose, className }: BuyFrameProps) {
  const { t } = useT();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const uri = source.kind === "page" ? source.pageUrl : source.url;

  const onMessage = React.useCallback(
    (message: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.nativeEvent.data);
      } catch {
        return;
      }
      const name = (parsed as { event?: unknown } | null)?.event;
      if (name === HOST_EVENTS.settled) onSettled?.();
      else if (name === HOST_EVENTS.close) onClose?.();
      const event = readBuyEvent(parsed);
      if (!event || event.event.startsWith("KAWASE_")) return;
      onEvent?.(event);
      // Our page reports to the api itself; a provider's own page cannot, so the app does it for that one.
      if (source.kind === "link") void api.onramp.event(orderId, { event: event.event, code: event.code, ...(event.payload ? { payload: event.payload } : {}) }).catch(() => undefined);
    },
    [onClose, onEvent, onSettled, orderId, source.kind],
  );

  if (failed) {
    return (
      <View className={cn("flex-1 items-center justify-center gap-3 p-6", className)} accessibilityRole="alert">
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("buy.loadFailedTitle")}</Text>
        <Text className={cn("text-muted-foreground text-center text-sm", TEXT_START)}>{t("buy.loadFailedBody")}</Text>
        <Button
          onPress={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          <Icon as={RotateCw} className="text-primary-foreground size-4" />
          <Text>{t("buy.tryAgain")}</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className={cn("flex-1", className)}>
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
          <View className="bg-background absolute inset-0 gap-6 p-4" accessibilityRole="progressbar" accessibilityLabel={t("buy.loadingPage")}>
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-96 w-full rounded-3xl" />
          </View>
        )}
        allowsInlineMediaPlayback
        // The cards' own checkout, ID and 3-D Secure steps open sheets and popups of their own.
        setSupportMultipleWindows
      />
    </View>
  );
}
