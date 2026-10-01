// The Chat tab (journey 14): the agent's thread surface. Stage 4 connects `useChat`; until then the designed
// empty state, the composer the keyboard path always leads to, and an honest line about what arrives when. A
// starter chip from home lands here with its text already in the composer.
import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Composer } from "@kawase/ui-native/components/composer";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const MARK_SIZE = 72;

export function ChatScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const overlay = useOverlay();
  const { user } = useSession();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const [draft, setDraft] = React.useState(prompt ?? "");
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  React.useEffect(() => {
    if (prompt) setDraft(prompt);
  }, [prompt]);

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Text className="font-display text-foreground text-2xl font-bold">{t("chat.title")}</Text>
      </View>
      <EmptyState art={<KawaseMark size={MARK_SIZE} />} title={t("chat.emptyTitle")} body={t("chat.emptyBody")} />
      <KeyboardStickyView offset={{ closed: 0, opened: clearance.dock }}>
        <View className="px-5" style={{ paddingBottom: clearance.dock + EDGE_INSET }}>
          <Composer
            value={draft}
            onValueChange={setDraft}
            onSubmit={() => toast(t("home.comingSoon"))}
            onTalk={() => overlay.open("voice")}
            labels={{ placeholder: t("chat.placeholder"), attach: t("chat.placeholder"), talk: t("home.dockVoice"), send: t("home.send") }}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
