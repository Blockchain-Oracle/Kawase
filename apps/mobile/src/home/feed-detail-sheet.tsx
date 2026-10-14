// One feed row opened (the detail behind the timeline, Mitoshi's DecisionTimeline → detail): what happened as one
// line, what the person asked in their own words, the venues Kawase compared (the race exactly as it ran, read from
// the conversation, never a new quote), and the receipt — outcome, amount, venue, time, the transaction on the
// explorer and why. Then where to go next: the intent's own screen ("Open swap"), the conversation, or Why.
// Loading is the detail's own skeleton; a row that could not be read says so with Retry and what still works.
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import type { AgentFeedDetail, AgentFeedItem } from "@kawase/api-client";

import { Button, diagnose, ErrorState, KeyValue, LoadingState, Panel, SectionLabel, SPACE, TYPE, useHeldLoading, useTheme, type Diagnosis } from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { LIST_DETENTS } from "@/components/sheet/constants";
import { RaceRows } from "@/chat/race-card";
import { useOpenIn, type OpenTarget } from "@/chat/open-in";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";

import { useFeedCopy } from "./feed-copy";

const HASH_HEAD = 10;
const HASH_TAIL = 6;

export function FeedDetailSheet({ item, onClose, onAsk }: { item: AgentFeedItem; onClose: () => void; onAsk?: ((prompt: string) => void) | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const copy = useFeedCopy();
  const open = useOpenIn();
  const [detail, setDetail] = React.useState<AgentFeedDetail | null>(null);
  const [error, setError] = React.useState<Diagnosis | null>(null);
  const [reading, setReading] = React.useState(true);
  const held = useHeldLoading(reading);

  const read = React.useCallback(async () => {
    setReading(true);
    setError(null);
    try {
      setDetail(await api.feed.item(item.id, item.network));
    } catch (failure) {
      setError(diagnose(failure));
    } finally {
      setReading(false);
    }
  }, [item.id, item.network]);
  React.useEffect(() => {
    void read();
  }, [read]);

  const row = detail?.item ?? item;
  const go = (target: OpenTarget) => {
    onClose();
    router.push(target.href);
  };
  const targets: OpenTarget[] = [
    ...(row.intentId ? [open.intent(row.kind, row.intentId)] : []),
    ...(row.outcome === "scheduled" && row.automationId ? [open.automations()] : []),
    ...(row.threadId ? [open.thread(row.threadId)] : []),
  ];
  const venue = copy.venueName(row);
  const amount = row.other ? `${copy.money(row.other.amount, row.other.token)} → ${copy.money(row.amount, row.token)}` : copy.money(row.amount, row.token);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.at));
  const prompt = row.group === "found" && row.suggestion ? t("feed.detail.foundPrompt", { what: copy.line(row) }) : null;

  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: t("feed.detail.title") })} detents={LIST_DETENTS}>
      <SheetHeading title={copy.line(row)} body={copy.detail(row)} />
      <View style={styles.body}>
        {detail?.asked ? (
          <View style={styles.block}>
            <SectionLabel>{t("feed.detail.asked")}</SectionLabel>
            <Text style={[TYPE.body, { color: color.ink }]}>“{detail.asked}”</Text>
          </View>
        ) : null}

        {held ? (
          <LoadingState shape="routes" />
        ) : error ? (
          <ErrorState diagnosis={error} retry={() => void read()} stillWorks={t("feed.detail.stillWorks")} variant="strip" />
        ) : detail?.race ? (
          <View style={styles.block}>
            <SectionLabel>{t("feed.detail.race", { count: detail.race.rows.length })}</SectionLabel>
            <RaceRows race={detail.race} live={false} />
          </View>
        ) : null}

        <Panel>
          <View style={styles.receipt}>
            <KeyValue label={t("feed.detail.outcome")} value={copy.outcome(row)} />
            {amount ? <KeyValue label={t("feed.detail.amount")} value={amount} /> : null}
            {venue ? <KeyValue label={t("feed.detail.venue")} value={venue} /> : null}
            {row.counterparty ? <KeyValue label={t("feed.detail.where")} value={row.counterparty} /> : null}
            <KeyValue label={row.outcome === "scheduled" ? t("feed.detail.next") : t("feed.detail.when")} value={when} />
            {row.txHash ? <KeyValue label={t("feed.detail.tx")} value={`${row.txHash.slice(0, HASH_HEAD)}…${row.txHash.slice(-HASH_TAIL)}`} /> : null}
          </View>
        </Panel>

        <View style={styles.actions}>
          {prompt && onAsk ? (
            <Button
              label={t("feed.detail.foundAction")}
              onPress={() => {
                onClose();
                onAsk(prompt);
              }}
            />
          ) : null}
          {targets.map((target, index) => (
            <Button key={target.label} label={target.label} variant={index === 0 && !prompt ? "primary" : "secondary"} onPress={() => go(target)} />
          ))}
          {row.txHash ? (
            <Button
              label={t("feed.detail.why")}
              variant="secondary"
              onPress={() => go({ label: "", href: { pathname: "/why/[tx]", params: { tx: row.txHash!, network: row.network } } })}
            />
          ) : null}
          {row.explorerUrl ? <Button label={t("feed.detail.explorer")} variant="ghost" onPress={() => void Linking.openURL(row.explorerUrl!)} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg, paddingTop: SPACE.md },
  block: { gap: SPACE.sm },
  receipt: { gap: SPACE.sm },
  actions: { gap: SPACE.sm },
});
