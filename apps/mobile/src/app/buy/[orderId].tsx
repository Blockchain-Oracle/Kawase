import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { Button, ErrorState, LoadingState } from "@/components/kit";
import { SPACE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { BuyFrame } from "@/onramp/buy-frame";
import { useBuy } from "@/onramp/buy-provider";
import { hasHost } from "@/onramp/order-events";
import { api } from "@/session/api";

/**
 * Kawase's own checkout page for one purchase (`/buy/<orderId>`, D42). On the web this route IS the page: open to whoever
 * holds the order's key (in the URL fragment, `#k=…`, never sent to a server), or to the signed-in owner; `?embed=1`
 * (the app's Buy sheet loads it so) leaves the header and steps to the sheet. On a phone it is a deep link into the
 * purchase: the api re-issues the page with a new key for the signed-in owner, and the native frame (react-native-webview,
 * Apple Pay on) loads that same web page. The page, its states and the widget mount live in `onramp/buy-page.tsx`.
 */
export default function BuyRoute() {
  const { orderId, embed } = useLocalSearchParams<{ orderId: string; embed?: string }>();
  const router = useRouter();
  const { t } = useT();
  const { color } = useTheme();
  const buy = useBuy();
  const id = orderId ?? "";
  const close = React.useCallback(() => {
    // Inside the app's WebView the page already told the app to close its sheet; navigating here would load the web
    // app's home inside the payment sheet.
    if (Platform.OS === "web" && hasHost()) return;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  // The web page keeps its own address (the key travels in this tab's fragment). A phone asks for the page.
  const web = Platform.OS === "web";
  const [pageUrl, setPageUrl] = React.useState<string | undefined>(() => (web ? `${window.location.origin}/buy/${encodeURIComponent(id)}${window.location.hash}` : undefined));
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (web || !id) return undefined;
    let live = true;
    setFailed(false);
    api.onramp
      .page(id)
      .then((answer) => {
        if (live) setPageUrl(answer.pageUrl);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt, id, web]);

  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      {failed ? (
        <View style={styles.pad}>
          <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("buy.loadFailedBody")} retry={() => setAttempt((value) => value + 1)} />
          <Button label={t("buy.close")} variant="ghost" onPress={close} />
        </View>
      ) : !pageUrl ? (
        <View style={styles.pad}>
          <LoadingState shape="detail" label={t("buy.loadingPage")} named />
        </View>
      ) : (
        <BuyFrame
          orderId={id}
          source={{ kind: "page", pageUrl }}
          embedded={embed === "1"}
          // The deep-linked purchase plays its own arrival (the Buy sheet plays it when it is the one around).
          onSettled={() => fire("filled", { sound: "received", identity: `onramp:${id}` })}
          onClose={(options) => {
            close();
            // Starting again with fresh numbers happens in the Buy sheet (a deep link has no sheet of its own).
            if (options?.retry) buy.open();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { flex: 1, padding: SPACE.lg, gap: SPACE.md, justifyContent: "center" },
});
