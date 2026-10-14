import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Platform, View } from "react-native";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { BuyFrame } from "@/onramp/buy-frame";
import { hasHost } from "@/onramp/order-events";
import { api } from "@/session/api";

/**
 * Kawase's own checkout page for one purchase (`/buy/<orderId>`, D42). On the web this route IS the page: open to whoever
 * holds the order's key (in the URL fragment, `#k=…`, never sent to a server), or to the signed-in owner. On a phone it
 * is a deep link into the purchase: the api re-issues the page with a new key for the signed-in owner, and the native
 * frame (react-native-webview, Apple Pay on) loads that same web page. The page, its states and the widget mount live
 * in `onramp/buy-page.tsx`.
 */
export default function BuyRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { t } = useT();
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

  if (failed) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-3 p-6" accessibilityRole="alert">
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("buy.loadFailedTitle")}</Text>
        <Text className="text-muted-foreground text-center text-sm">{t("buy.loadFailedBody")}</Text>
        <Button onPress={() => setAttempt((value) => value + 1)}>
          <Text>{t("buy.tryAgain")}</Text>
        </Button>
        <Button variant="ghost" onPress={close}>
          <Text>{t("buy.close")}</Text>
        </Button>
      </View>
    );
  }

  if (!pageUrl) {
    return (
      <View className="bg-background flex-1 gap-6 p-4" accessibilityRole="progressbar" accessibilityLabel={t("buy.loadingPage")}>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </View>
    );
  }

  return <BuyFrame orderId={id} source={{ kind: "page", pageUrl }} onClose={close} />;
}
