// The header of the contacts pages, in the same grammar as Receive and Wallet & limits: the testnet strip when on
// testnet, a back button (its chevron flips in right-to-left languages), the title, and an optional action at the end.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;

export function ContactsHeader({ title, end }: { title: string; end?: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  return (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text numberOfLines={1} className={cn("font-display text-foreground flex-1 text-2xl font-bold", TEXT_START)}>
          {title}
        </Text>
        {end}
      </View>
    </>
  );
}
