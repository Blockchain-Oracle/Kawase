import { MarketplaceScreen } from "@/marketplace/marketplace-screen";

/** `/marketplace`: the x402 services the agent can pay for; `?d=<tool>` opens one in the drawer, `?c=` a category. */
export default function MarketplaceRoute() {
  return <MarketplaceScreen />;
}
