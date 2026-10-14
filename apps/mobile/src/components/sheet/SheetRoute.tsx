import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";
import { SHEET_SHAPE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet } from "./Sheet";
import { SheetInPlace } from "./SheetHost";

/**
 * A sheet's heading (Fomo F20/F36): the title centred under the handle, one centred sentence under it. No close
 * button: the handle, the scrim and Back dismiss it, and the scrim carries the accessible "Close" name.
 */
export function SheetHeading({ title, body }: { title: string; body?: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[TYPE.sheetHeading, styles.center, { color: color.ink }]}>
        {title}
      </Text>
      {body ? <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>{body}</Text> : null}
    </View>
  );
}

/**
 * Leaves a sheet route once it has slid away: back to whatever opened it, or — when a link opened it from a cold start
 * and nothing is under it — to `/`, whose gate picks welcome, setup or Home (never a blank stack).
 */
export function leaveSheetRoute() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** A sheet route (a native transparent modal, so the sheet renders in place) with the standard heading. */
export function SheetRoute({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const { t } = useT();
  return (
    <SheetInPlace>
      <Sheet onClose={leaveSheetRoute} closeLabel={t("shell.kit.closeNamed", { name: title })}>
        <SheetHeading title={title} {...(body ? { body } : {})} />
        {children ? <View style={styles.rows}>{children}</View> : null}
      </Sheet>
    </SheetInPlace>
  );
}

const styles = StyleSheet.create({
  heading: { gap: SPACE.xs, paddingHorizontal: SPACE.sm },
  center: { textAlign: "center" },
  rows: { gap: SHEET_SHAPE.rowGap },
});
