import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Platform } from "react-native";

import { BuyFrame } from "@/onramp/buy-frame";
import { buyPageUrl } from "@/onramp/page-url";

/**
 * Kawase's own checkout page for one purchase (`/buy/<orderId>`, D42): open to whoever holds the order's key (in the
 * URL fragment: `#k=…`, never sent to a server), because a WebView in the app has no sign-in. On the web the frame renders
 * the page itself (Circle's widget in Kawase's header and progress rail); on a phone it is the WebView that loads this
 * same page from the web. The page, its states and the widget mount live in `onramp/buy-page.tsx`.
 */
export default function BuyRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const id = orderId ?? "";
  // On the web the key is in this tab's own address; on a phone there is none (the person is signed in).
  const pageUrl = React.useMemo(() => (Platform.OS === "web" ? `${window.location.origin}/buy/${encodeURIComponent(id)}${window.location.hash}` : buyPageUrl(id)), [id]);
  return (
    <BuyFrame
      orderId={id}
      source={{ kind: "page", pageUrl }}
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
    />
  );
}
