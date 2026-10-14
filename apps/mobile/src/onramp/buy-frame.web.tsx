// The purchase inside the web app: no WebView here, so Kawase's page renders inline (the same code the phone's
// WebView loads from the web). A Coinbase payment link (a provider page) goes in an iframe that is allowed to pay,
// with its events read from the window and sent to the api.
import * as React from "react";
import { View } from "react-native";

import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";

import { BuyPage } from "./buy-page";
import { readBuyEvent } from "./order-events";
import type { BuyFrameProps } from "./buy-frame";

export type { BuyFrameProps, BuySource } from "./buy-frame";

/** The page URL's fragment carries the order key (`#k=kbuy_…`). */
const keyOf = (pageUrl: string): string | undefined => {
  const hash = pageUrl.split("#")[1];
  return hash ? new URLSearchParams(hash).get("k") ?? undefined : undefined;
};

function LinkFrame({ orderId, url, onEvent, className }: { orderId: string; url: string; onEvent: BuyFrameProps["onEvent"]; className: string | undefined }) {
  const { t } = useT();
  const origin = React.useMemo(() => new URL(url).origin, [url]);
  React.useEffect(() => {
    const listen = (message: MessageEvent) => {
      if (message.origin !== origin) return;
      const event = readBuyEvent(message.data);
      if (!event) return;
      onEvent?.(event);
      void api.onramp.event(orderId, { event: event.event, code: event.code, ...(event.payload ? { payload: event.payload } : {}) }).catch(() => undefined);
    };
    globalThis.addEventListener("message", listen);
    return () => globalThis.removeEventListener("message", listen);
  }, [onEvent, orderId, origin]);
  return (
    <View className={cn("flex-1", className)}>
      {React.createElement("iframe", { src: url, title: t("buy.widgetTitle"), allow: "payment; camera; clipboard-write", style: { border: 0, width: "100%", height: "100%", minHeight: 640 } })}
    </View>
  );
}

export function BuyFrame({ orderId, source, onEvent, onClose, className }: BuyFrameProps) {
  if (source.kind === "link") return <LinkFrame orderId={orderId} url={source.url} onEvent={onEvent} className={className} />;
  return (
    <View className={cn("flex-1", className)}>
      <BuyPage orderId={orderId} pageKey={keyOf(source.pageUrl)} onClose={(options) => onClose?.(options)} />
    </View>
  );
}
