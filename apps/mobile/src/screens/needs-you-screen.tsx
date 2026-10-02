// One step waiting for the person (Needs you), opened from a push, the inbox or Activity: the item and its answer. A
// tap on a push says so ("from a notification"), so another device later shows where it was answered.
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NeedsYouItem } from "@kawase/api-client";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { NeedsYouCard } from "@/needs-you/needs-you-card";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const SKELETON_HEIGHT = 200;

export function NeedsYouScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [item, setItem] = React.useState<NeedsYouItem>();
  const [failed, setFailed] = React.useState(false);
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      setItem((await api.needsYou.get(id)).item);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);
  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("needsYou.title")}
        </Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET }}>
        {item ? (
          <NeedsYouCard item={item} via={from === "push" ? "push" : "app"} onChange={setItem} />
        ) : failed ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
            <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("needsYou.failed")}</Text>
            <Button size="sm" variant="secondary" onPress={() => void load()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : (
          <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
        )}
      </ScrollView>
    </View>
  );
}
