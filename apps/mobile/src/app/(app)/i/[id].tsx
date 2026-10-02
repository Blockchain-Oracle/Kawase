import { useLocalSearchParams } from "expo-router";

import { IntentScreen } from "@/screens/intent-screen";

/** `/i/<id>`: one money action's own card, from a push, the inbox or an email. */
export default function IntentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IntentScreen id={id ?? ""} />;
}
