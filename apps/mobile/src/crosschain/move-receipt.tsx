// What a move's slide turns into once the money is delivered (the kit's TxMorph target): what arrived on which chain,
// for whom, through which bridge (its real mark), and both transactions — the one leaving Arc and the one arriving.
import type * as React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { CrossChainIntent } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { Icon, Panel, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { Check } from "@/components/kit/icons";
import { useT } from "@/i18n";
import { venueName } from "@/routes/from-draft";

import { useAssetMoney } from "./move-copy";

const BADGE = SIZE.avatarMd;
const HALF = 2;
const HEAD = 6;
const TAIL = 4;

const short = (address: string) => `${address.slice(0, HEAD)}…${address.slice(-TAIL)}`;

export function MoveReceipt({ intent, actions }: { intent: CrossChainIntent; actions?: React.ReactNode }) {
  const { t } = useT();
  const { color } = useTheme();
  const money = useAssetMoney();
  const draft = intent.draft;
  if (!draft) return null;
  const who = draft.recipient.own ? t("move.you") : (draft.recipient.label ?? short(draft.recipient.address));
  const arrived = money(intent.received ?? draft.minReceived, draft.output);
  const links = [
    intent.tx ? { hash: intent.tx.hash, url: intent.tx.explorerUrl, chain: draft.source.name } : null,
    intent.fillTx ? { hash: intent.fillTx.hash, url: intent.fillTx.explorerUrl, chain: draft.destination.name } : null,
  ].filter((entry): entry is { hash: string; url: string; chain: string } => entry !== null);
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <View style={[styles.badge, { backgroundColor: color.upSurface }]}>
          <Icon icon={Check} size={SIZE.icon} tint={color.up} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.sheetTitle, { color: color.ink }]}>
          {t("move.deliveredTitle", { chain: draft.destination.name })}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[TYPE.body, styles.center, { color: color.text2 }]}>
          {t("move.deliveredBody", { amount: arrived, who })}
        </Text>
        <View style={styles.via}>
          <Mark entity={`venue:${draft.chosen}`} size={SIZE.markInline} />
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("move.byBridge", { bridge: venueName(draft.chosen) })}</Text>
        </View>
        {links.map((link) => (
          <Pressable key={link.hash} accessibilityRole="link" onPress={() => void Linking.openURL(link.url)} style={styles.link}>
            <Text style={[TYPE.bodyStrong, { color: color.link }]}>{t("move.onExplorer", { chain: link.chain })}</Text>
          </Pressable>
        ))}
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
  via: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingTop: SPACE.xs },
  link: { minHeight: SIZE.touch, justifyContent: "center" },
  actions: { gap: SPACE.sm },
});
