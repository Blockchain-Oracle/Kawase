import { useLocalSearchParams } from "expo-router";

import { PositionScreen } from "@/screens/position-screen";

export default function PositionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PositionScreen id={id} />;
}
