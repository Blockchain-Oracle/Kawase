// A feed row opened (row → receipt → why): what it was, where it stands, when, on which network, with whom; then the
// way on — its why (the decision record behind a transaction, or behind an automation run that never needed one), the
// step waiting for the person, the transaction on the explorer.
import { useRouter } from "expo-router";
import { ExternalLink, Hand, ListTree } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FeedItem } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useThemeColors } from "@/theme/use-theme-colors";

import { useFeedText } from "./feed-row";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-1.5">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <Text selectable className="text-foreground flex-1 text-end text-sm">
        {value}
      </Text>
    </View>
  );
}

export function FeedSheet({ item, onClose }: { item: FeedItem | undefined; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const text = useFeedText();
  const go = (path: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(path);
  };
  const sign = item?.direction === "in" ? "+" : item?.direction === "out" ? "−" : "";
  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      title={item ? text.title(item) : undefined}
      subtitle={item ? text.line(item) : undefined}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
    >
      {item ? (
        <View className="gap-4">
          {item.amount && item.token ? <Amount className="text-foreground text-3xl">{`${sign}${text.money(item.amount, item.token)}`}</Amount> : null}
          <View>
            <Fact label={t("activity.when")} value={text.when(item.at)} />
            <Fact label={t("activityFeed.network")} value={item.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} />
            {item.other ? <Fact label={t("activityFeed.paid")} value={text.money(item.other.amount, item.other.token)} /> : null}
            {item.counterparty ? <Fact label={item.direction === "in" ? t("activity.fromAddress") : t("activity.toAddress")} value={item.counterparty} /> : null}
            {item.txHash ? <Fact label={t("activity.transaction")} value={item.txHash} /> : null}
          </View>
          {item.needsYouId && item.status === "waiting" ? (
            <Button onPress={() => go({ pathname: "/needs-you/[id]", params: { id: item.needsYouId! } })}>
              <Icon as={Hand} className="text-primary-foreground size-4" />
              <Text>{t("needsYou.approve")}</Text>
            </Button>
          ) : null}
          {item.txHash || item.runId ? (
            <Button
              variant="secondary"
              onPress={() => (item.runId && !item.txHash ? go({ pathname: "/why/run/[id]", params: { id: item.runId } }) : go({ pathname: "/why/[tx]", params: { tx: item.txHash!, network: item.network } }))}
            >
              <Icon as={ListTree} className="text-foreground size-4" />
              <Text>{t("why.open")}</Text>
            </Button>
          ) : null}
          {item.explorerUrl ? (
            <Button variant="ghost" onPress={() => void Linking.openURL(item.explorerUrl!)}>
              <Icon as={ExternalLink} className="text-foreground size-4" />
              <Text>{t("activity.viewExplorer")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
