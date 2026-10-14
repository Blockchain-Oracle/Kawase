// The purchase frame's props, shared by the native WebView frame and its web twin (kept apart so neither file imports
// itself on the web, where `./buy-frame` resolves to `buy-frame.web.tsx`).
import type { BuyEvent } from "./order-events";

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
