// The settings sub-page frame (the Automations page's grammar): the testnet strip, Back and a title, then the content
// scrolling under it, with an eyebrowed section helper.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type * as React from "react";
import { ScrollView, View, type RefreshControlProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;

export function Page({ title, children, refreshControl }: { title: string; children: React.ReactNode; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground flex-1 text-2xl font-bold" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerClassName="gap-7 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        {...(refreshControl ? { refreshControl } : {})}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Eyebrow className="px-1">{title}</Eyebrow>
      {children}
    </View>
  );
}
