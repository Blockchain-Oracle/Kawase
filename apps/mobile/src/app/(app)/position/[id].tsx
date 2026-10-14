import { useLocalSearchParams } from "expo-router";

import { PositionScreen } from "@/screens/position-screen";
import { WidePage } from "@/trade/page-frame";

/** `/position/<id>`: one long/short; two columns on a desktop window (the stage and the close ticket). */
export default function PositionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <WidePage />
      <PositionScreen id={id} />
    </>
  );
}
