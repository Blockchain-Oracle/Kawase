// Circle's Onramp widget mounts only on the web (the kit builds an iframe); a phone shows Kawase's buy page inside a
// WebView instead (buy-frame.tsx), which is this same page running on the web. See circle-widget.web.tsx.
import type * as React from "react";

import type { OnrampSessionView } from "@kawase/api-client";

import type { BuyEvent } from "./order-events";

export type CircleWidgetProps = {
  session: OnrampSessionView;
  /** The sandbox widget on testnet; production otherwise (the client's origin must match the server's). */
  sandbox: boolean;
  onReady: () => void;
  onEvent: (event: BuyEvent) => void;
  /** The widget could not start: the page shows its failure state (`retry`: a fresh session may fix it). */
  onFailed: (code: string, retry: boolean) => void;
  /** The 30-minute session ran out; the page re-mints and mounts again. */
  onSessionExpired: () => void;
};

/** Native has no widget (the WebView shows the web page instead), so this renders nothing. */
export const CircleWidget: (props: CircleWidgetProps) => React.ReactElement | null = () => null;
