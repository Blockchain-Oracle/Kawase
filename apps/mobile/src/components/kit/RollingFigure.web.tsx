// Web twin of RollingFigure: NumberFlow (21st.dev barvian/number-flow, id 1444) through ui-web's `Odometer`, so a changed
// digit rolls up on a rise and down on a fall, in the display face, with the full value readable by assistive
// technology and a plain swap under reduced motion. Same props as the native Skia figure; `font` is ignored (CSS draws
// the face).
import { Odometer } from "@kawase/ui-web/components/ui/number-flow";
import { StyleSheet, View } from "react-native";

import { useT } from "@/i18n";

import { parseFigure } from "./figure";
import { HIDDEN_AMOUNT, useHideBalances } from "./hide-balances";
import { FONT } from "./theme";

/** The digits fill this share of the figure's line height. */
const FIGURE_SHARE = 0.9;
const DISPLAY_WEIGHT = 900;

export function RollingFigure({
  text,
  height,
  color,
  align = "right",
  accessibilityLabel,
  sensitive = false,
}: {
  text: string;
  /** Unused on the web (kept so a caller's props match the native twin). */
  value?: bigint;
  font?: unknown;
  color: string;
  height: number;
  align?: "left" | "right";
  accessibilityLabel?: string;
  sensitive?: boolean;
}) {
  const { t } = useT();
  const [hiddenAll] = useHideBalances();
  const hidden = sensitive && hiddenAll;
  const figure = parseFigure(text);
  const style = { color, fontFamily: FONT.display, fontWeight: DISPLAY_WEIGHT, fontSize: height * FIGURE_SHARE, lineHeight: `${height}px` } as const;
  return (
    <View
      style={[styles.box, { height, alignItems: align === "right" ? "flex-end" : "flex-start" }]}
      accessible
      accessibilityLabel={hidden ? t("shell.kit.hidden") : accessibilityLabel ?? text}
    >
      <span style={style}>
        {hidden || !figure ? (
          hidden ? HIDDEN_AMOUNT : text
        ) : (
          <Odometer
            value={figure.value}
            prefix={figure.prefix}
            suffix={figure.suffix}
            format={{ minimumFractionDigits: figure.decimals, maximumFractionDigits: figure.decimals, useGrouping: figure.grouping }}
          />
        )}
      </span>
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignSelf: "stretch", justifyContent: "center" } });
