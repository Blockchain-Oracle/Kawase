import { useLocalSearchParams } from "expo-router";

import { MarketplaceScreen } from "@/marketplace/marketplace-screen";

/** `/marketplace/<tool>`: a link to one tool (the agent's cards, Markets' Services) opens the list with its drawer up. */
export default function MarketplaceToolRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MarketplaceScreen openKey={id} />;
}
