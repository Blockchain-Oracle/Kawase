// Automations (Stage 8): everything running on autopilot on this network, each said in full (who, how much, when,
// the on-chain bound, the next runs, recent runs with what happened and why), with its lifecycle in reach: pause /
// resume, skip the next run, cancel (which revokes its grant on chain with one more Face ID). Empty: what to ask
// Kawase. Made in chat; managed here.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AutomationView } from "@kawase/api-client";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AutomationSummary } from "@/automations/automation-summary";
import { useAutomation } from "@/automations/use-automation";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_WIDTH = 150;
const SKELETON_HEIGHT = 180;

function AutomationItem({ initial }: { initial: AutomationView }) {
  const { t } = useT();
  const controller = useAutomation(initial);
  const automation = controller.automation ?? initial;
  return (
    <View className="bg-card border-border gap-4 rounded-3xl border p-4">
      <AutomationSummary automation={automation} showRuns />
      {automation.status === "active" || automation.status === "paused" ? (
        <View className="flex-row flex-wrap gap-2">
          {automation.status === "active" ? (
            <>
              <Button size="sm" variant="secondary" disabled={controller.busy} onPress={() => void controller.pause()}>
                <Text>{t("automation.pause")}</Text>
              </Button>
              <Button size="sm" variant="secondary" disabled={controller.busy} onPress={() => void controller.skip()}>
                <Text>{t("automation.skipNext")}</Text>
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled={controller.busy} onPress={() => void controller.resume()}>
              <Text>{t("automation.resume")}</Text>
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel(t("automation.revokePrompt"))}>
            <Text className="text-destructive">{t("automation.cancel")}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function AutomationsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [list, setList] = React.useState<AutomationView[]>();
  const [failed, setFailed] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  const load = React.useCallback(async () => {
    try {
      const { automations } = await api.automations.list();
      setList(automations.filter((entry) => entry.status !== "draft"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("automation.title")}
        </Text>
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {failed && !list ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
            <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("automation.failed")}</Text>
            <Button size="sm" variant="secondary" onPress={() => void load()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : !list ? (
          <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
        ) : list.length === 0 ? (
          <View className="flex-1">
            <EmptyState
              art={<PaperPlane width={ART_WIDTH} id="automations-empty-plane" />}
              title={t("automation.emptyTitle")}
              body={t("automation.emptyBody")}
              action={
                <Button onPress={() => router.push("/chat")}>
                  <Text>{t("chat.title")}</Text>
                </Button>
              }
            />
          </View>
        ) : (
          list.map((entry) => <AutomationItem key={entry.id} initial={entry} />)
        )}
      </ScrollView>
    </View>
  );
}
