import { useLocalSearchParams } from "expo-router";

import { WhyScreen } from "@/screens/why-screen";

/** `/why/run/:id`: why an automation run went the way it did (a skip, a practice run, a step waiting for you). */
export default function RunWhyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WhyScreen runId={id} />;
}
