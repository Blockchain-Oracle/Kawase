// What the slide turns into once the swap is final (the kit's TxMorph target): what actually arrived, from the receipt
// (never the estimate), what left, the venue that did it with its real mark, and the transaction on the explorer
// ("don't trust it, click it"). The next steps are the host's (Done, See the token).
import type * as React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { SwapIntent } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { Icon, KeyValue, Panel, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { Check } from "@/components/kit/icons";
import { useT } from "@/i18n";
import { venueName } from "@/routes/from-draft";

import { useSwapMoney } from "./swap-tokens";

const BADGE = SIZE.avatarMd;
const HALF = 2;
const HASH_HEAD = 10;
const HASH_TAIL = 6;

export function SwapReceipt({ intent, actions }: { intent: SwapIntent; actions?: React.ReactNode }) {
  const { t } = useT();
  const { color } = useTheme();
  const money = useSwapMoney();
  const draft = intent.draft;
  if (!draft) return null;
  const received = money(draft, "out", intent.received ?? draft.estimatedOut, intent.network);
  const paid = money(draft, "in", draft.amountIn, intent.network);
  const venue = draft.venue ?? null;
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <View style={[styles.badge, { backgroundColor: color.upSurface }]}>
          <Icon icon={Check} size={SIZE.icon} tint={color.up} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.sheetTitle, { color: color.ink }]}>
          {t("swap.swappedTitle")}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[TYPE.body, styles.center, { color: color.text2 }]}>
          {t("swap.swappedBody", { received, paid })}
        </Text>
        <View style={styles.facts}>
          {venue ? (
            <View style={styles.via}>
              <Mark entity={`venue:${venue}`} size={SIZE.markInline} />
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("swap.pricedBy", { venue: venueName(venue, draft.provider) })}</Text>
            </View>
          ) : null}
          {intent.tx ? <KeyValue label={t("swap.transaction")} value={`${intent.tx.hash.slice(0, HASH_HEAD)}…${intent.tx.hash.slice(-HASH_TAIL)}`} /> : null}
        </View>
        {intent.tx ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(intent.tx!.explorerUrl)} style={styles.link}>
            <Text style={[TYPE.bodyStrong, { color: color.link }]}>{t("send.viewExplorer")}</Text>
          </Pressable>
        ) : null}
      </Panel>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  panel: { alignItems: "center", gap: SPACE.sm, padding: SPACE.xl },
  badge: { width: BADGE, height: BADGE, borderRadius: BADGE / HALF, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  facts: { alignSelf: "stretch", gap: SPACE.xs, paddingTop: SPACE.sm },
  via: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.sm },
  link: { minHeight: SIZE.touch, justifyContent: "center" },
  actions: { gap: SPACE.sm },
});
