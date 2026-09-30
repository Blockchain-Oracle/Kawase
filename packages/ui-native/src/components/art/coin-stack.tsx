// Three kobans stacked, the top one stamped: money that has arrived (the fund hub, "you're funded", the send
// empty state's coins). Each coin is its own material instance so the highlights differ.
import { View } from "react-native";

import { Koban, KOBAN_VIEWBOX } from "./koban";

type CoinStackProps = {
  width?: number;
  metal?: "silver" | "gold";
  id?: string;
};

const DEFAULT_WIDTH = 160;
const COUNT = 3;
/** Vertical offset between coins as a fraction of the coin height. */
const STEP_RATIO = 0.22;

export function CoinStack({ width = DEFAULT_WIDTH, metal = "silver", id = "stack" }: CoinStackProps) {
  const coinHeight = (width * KOBAN_VIEWBOX.height) / KOBAN_VIEWBOX.width;
  const step = coinHeight * STEP_RATIO;
  const height = coinHeight + step * (COUNT - 1);
  return (
    <View style={{ width, height }}>
      {Array.from({ length: COUNT }, (_, index) => (
        <View key={index} style={{ position: "absolute", top: step * (COUNT - 1 - index), start: 0 }}>
          <Koban width={width} metal={metal} stamped={index === COUNT - 1} id={`${id}-${index}`} rotate={index % 2 === 0 ? -2 : 2} />
        </View>
      ))}
    </View>
  );
}

export type { CoinStackProps };
