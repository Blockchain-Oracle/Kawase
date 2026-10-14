// Circle's Onramp widget in Kawase's frame (docs pack buy-market §2): `mountIframe` into a box the page owns. No user
// gesture is needed, so it mounts from an effect. The kit sets the iframe's attributes (camera, payment, clipboard,
// strict-origin referrer, no sandbox: card and 3-D Secure need scripts, forms and popups), so none are added here.
// The client's `widgetBaseUrl` must equal the server's: the sandbox widget on testnet, Circle's production one otherwise.
// A wrong content-security policy on this page shows as a silent empty box until the kit's own 10 s `PAGE_NOT_LOADED`.
import { createOnrampKit } from "@circle-fin/onramp-kit";
import * as React from "react";
import { View } from "react-native";

import { ONRAMP } from "@kawase/config";

import { useT } from "@/i18n";

import { readBuyEvent } from "./order-events";
import type { CircleWidgetProps } from "./circle-widget";

export type { CircleWidgetProps } from "./circle-widget";

/** The widget's box: tall enough for its KYC and card steps, as the kit's hosting notes ask for an explicit height. */
const WIDGET_HEIGHT = 720;
const LOAD_TIMEOUT_MS = 10_000;
/** Errors that a new session fixes: the token ran out or was refused. */
const SESSION_CODES = new Set(["INVALID_SESSION_TOKEN", "SESSION_TIMEOUT"]);

export function CircleWidget({ session, sandbox, onReady, onEvent, onFailed, onSessionExpired }: CircleWidgetProps) {
  const { t } = useT();
  const box = React.useRef<View>(null);
  // The handlers change every render; the widget is mounted once per session.
  const handlers = React.useRef({ onReady, onEvent, onFailed, onSessionExpired });
  handlers.current = { onReady, onEvent, onFailed, onSessionExpired };

  React.useEffect(() => {
    const container = box.current as unknown as HTMLElement | null;
    if (!container || !session.kitSession) {
      handlers.current.onFailed("INITIALIZATION_ERROR", true);
      return undefined;
    }
    let off: (() => void) | undefined;
    let widget: { close(): void } | undefined;
    try {
      const kit = createOnrampKit(sandbox ? { widgetBaseUrl: ONRAMP.sandbox.widgetBaseUrl } : {});
      const mounted = kit.mountIframe({
        // The session exactly as the server kit minted it.
        session: session.kitSession as never,
        container,
        title: "Kawase",
        loadTimeout: LOAD_TIMEOUT_MS,
        onSessionExpired: () => handlers.current.onSessionExpired(),
      });
      widget = mounted;
      off = mounted.on("*", (envelope) => {
        const event = readBuyEvent(envelope);
        if (!event) return;
        if (event.event === "INITIALIZATION_SUCCESS") handlers.current.onReady();
        if (event.event === "INITIALIZATION_ERROR") {
          const code = event.code ?? "INITIALIZATION_ERROR";
          if (SESSION_CODES.has(code)) handlers.current.onSessionExpired();
          else handlers.current.onFailed(code, event.payload?.canRetry !== false);
        }
        handlers.current.onEvent(event);
      });
    } catch {
      // A malformed or expired session, or a widget origin that does not match the server's: the kit refuses before mounting.
      handlers.current.onFailed("INITIALIZATION_ERROR", true);
    }
    return () => {
      off?.();
      widget?.close();
    };
  }, [session, sandbox]);

  return <View ref={box} accessibilityLabel={t("buy.widgetTitle")} style={{ height: WIDGET_HEIGHT, width: "100%" }} />;
}
