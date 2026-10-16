// The 404 for every address the app does not have (Abu, 10-16: "our custom 404 page… everywhere"), told as Kawase's
// own object, the receipt slip, voided: the address on the slip, "No such page", and the line a money app owes anyone
// who lands somewhere wrong — nothing left their wallet. A vermilion VOID stamp where a real slip has its hanko (the
// hanko means approved), then the perforation and the ways back: home, or ask Kawase. Mitoshi and Owarine tell their
// 404 as a voided ticket the same way. Served with a 404 status on the web (expo-server's +not-found.html).
import { usePathname, useRouter } from "expo-router";
import Head from "expo-router/head";
import * as React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { VERMILION } from "@kawase/ui-native/components/art/stipple";

import { Button, ELEVATION, RADIUS, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { Perforation } from "@/receipt/receipt-slip";

const SLIP_MAX = 420;
const MARK = 26;
/** The stamp sits askew, like one pressed by hand. */
const STAMP_TILT = "-12deg";
const STAMP_BORDER = 3;
const STAMP_LETTERS = 3;

// On the web the page is prerendered once (as /+not-found), so the visitor's own address comes from the address bar
// after hydration; the server and the first client render agree on none.
const noStore = () => () => undefined;
const addressPath = () => (typeof window === "undefined" ? null : window.location.pathname);
const noPath = () => null;

function useMissingPath(): string | null {
  const routed = usePathname();
  const address = React.useSyncExternalStore(noStore, addressPath, noPath);
  return Platform.OS === "web" ? address : routed;
}

export default function NotFound() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const path = useMissingPath();

  return (
    <ScrollView style={{ backgroundColor: color.ground }} contentContainerStyle={styles.page}>
      <Head>
        <title>{t("notFound.pageTitle")}</title>
      </Head>
      <View style={styles.column}>
        <Text accessibilityRole="header" style={[TYPE.pageTitle, styles.center, { color: color.ink }]}>
          {t("notFound.title")}
        </Text>
        <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>{t("notFound.line")}</Text>

        <View style={[styles.slip, ELEVATION.receipt, { backgroundColor: color.popover }]}>
          <View style={styles.head}>
            <KawaseMark size={MARK} />
            <Text style={[TYPE.label, styles.grow, { color: color.ink }]}>{t("common.appName")}</Text>
            <Text style={[TYPE.micro, { color: color.text3 }]}>{t("notFound.receipt")}</Text>
          </View>
          <View style={styles.rows}>
            <Row label={t("notFound.to")}>
              <Text numberOfLines={1} style={[TYPE.label, styles.mono, { color: color.ink }]}>
                {path ?? "—"}
              </Text>
            </Row>
            <Row label={t("notFound.status")}>
              <Text style={[TYPE.label, { color: color.ink }]}>{t("notFound.missing")}</Text>
            </Row>
            <Row label={t("notFound.money")}>
              <Text style={[TYPE.label, { color: color.up }]}>{t("notFound.safe")}</Text>
            </Row>
          </View>
          <View pointerEvents="none" style={styles.stampSpot}>
            <Text accessibilityElementsHidden importantForAccessibility="no" style={[TYPE.sectionTitle, styles.stamp]}>
              {t("notFound.void")}
            </Text>
          </View>
          <Perforation notch={color.ground} rule={color.hairline} />
          <View style={styles.actions}>
            <Button label={t("notFound.home")} onPress={() => router.replace("/")} />
            <Button label={t("notFound.ask")} variant="secondary" onPress={() => router.replace("/chat")} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[TYPE.meta, { color: color.text2 }]}>{label}</Text>
      <View style={styles.value}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: SPACE.lg },
  column: { width: "100%", maxWidth: SLIP_MAX, gap: SPACE.md },
  center: { textAlign: "center" },
  slip: { marginTop: SPACE.md, borderRadius: RADIUS.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
  grow: { flex: 1 },
  rows: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.md },
  value: { flexShrink: 1, alignItems: "flex-end" },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" }) },
  stampSpot: { position: "absolute", top: SPACE.xl, end: SPACE.lg },
  stamp: {
    color: VERMILION.light,
    borderColor: VERMILION.light,
    borderWidth: STAMP_BORDER,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm,
    letterSpacing: STAMP_LETTERS,
    opacity: 0.85,
    transform: [{ rotate: STAMP_TILT }],
  },
  actions: { gap: SPACE.sm, padding: SPACE.lg },
});
