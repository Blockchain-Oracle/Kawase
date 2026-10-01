// The inbox (journey 15, Stage 9): what needs you and what Kawase did. A pushed page from the header's bell,
// with the designed empty state until notifications exist.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_WIDTH = 160;

export function InboxScreen() {
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
        <Text className="font-display text-foreground text-2xl font-bold">{t("inbox.title")}</Text>
      </View>
      <View className="flex-1" style={{ paddingBottom: insets.bottom + EDGE_INSET }}>
        <EmptyState art={<PaperPlane width={ART_WIDTH} />} title={t("inbox.emptyTitle")} body={t("inbox.emptyBody")} />
      </View>
    </View>
  );
}
