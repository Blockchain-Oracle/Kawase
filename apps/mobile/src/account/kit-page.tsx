// The account sub-pages' frame on the Senryo kit (Settings → Sign-in & security, Devices, Private key, Delete
// account): a round Back plate and the condensed page title, then the content scrolling under it on the page ground.
// Groups are filled panels one step lighter than the page with a quiet label above (no borders, no eyebrows), the way
// the kit's settings rows read (DESIGN.md "Page grammar").
import { useRouter } from "expo-router";
import type * as React from "react";
import { Pressable, type RefreshControlProps, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Panel, RADIUS, SectionLabel, SIZE, SPACE, TYPE, usePressScale, useTheme } from "@/components/kit";
import { ChevronLeft } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

/** Leaves a sub-page: back to whatever opened it, or to Settings when a link opened it cold. */
function useLeavePage() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };
}

export function Page({
  title,
  children,
  refreshControl,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Pinned under the scrolling content (the page's one action), above the home indicator. */
  footer?: React.ReactNode;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeavePage();
  const press = usePressScale();
  const { rtl } = useLocale();
  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.md }]}>
        <Animated.View style={press.style}>
          <Pressable
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            onPress={() => {
              fire("tick");
              leave();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={SPACE.xs}
            style={[styles.back, { backgroundColor: color.raised2 }]}
          >
            <View style={rtl ? styles.flip : undefined}>
              <Icon icon={ChevronLeft} size={SIZE.iconSm} />
            </View>
          </Pressable>
        </Animated.View>
        <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.pageTitle, styles.title, { color: color.ink }]}>
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: (footer ? SPACE.lg : insets.bottom + SPACE.xl) }]}
        keyboardShouldPersistTaps="handled"
        {...(refreshControl ? { refreshControl } : {})}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.lg }]}>{footer}</View> : null}
    </View>
  );
}

/** A labelled group: the quiet label, then the filled panel holding its rows. */
export function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {label ? <SectionLabel style={styles.label}>{label}</SectionLabel> : null}
      <Panel>{children}</Panel>
    </View>
  );
}

/** One quiet line under a group (a note, never an explainer under a control). */
export function GroupNote({ children }: { children: string }) {
  const { color } = useTheme();
  return <Text style={[TYPE.rowDetail, styles.label, { color: color.text3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  back: { width: SIZE.touch, height: SIZE.touch, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  // The chevron points the way back in either reading direction.
  flip: { transform: [{ scaleX: -1 }] },
  title: { flex: 1 },
  content: { gap: SPACE.xl, paddingHorizontal: SPACE.inset, paddingTop: SPACE.md, flexGrow: 1 },
  footer: { paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm, gap: SPACE.sm },
  group: { gap: SPACE.sm },
  label: { paddingHorizontal: SPACE.xs },
});
