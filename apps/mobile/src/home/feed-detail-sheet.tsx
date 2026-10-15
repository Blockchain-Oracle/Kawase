// One feed row opened (the detail behind the timeline, Mitoshi's DecisionTimeline → detail): what happened as one
// line, what the person asked in their own words, the venues Kawase compared (the race exactly as it ran, read from
// the conversation, never a new quote), and the receipt — outcome, amount, venue, time, the transaction on the
// explorer and why. Then where to go next: the intent's own screen ("Open swap"), the conversation, or Why.
// The sheet opens with what the row already knows; only a run that raced venues shimmers, in the race's own shape,
// while its race is read. A row that could not be read says so with Retry and what still works.
// Money that moved opens on its receipt slip, the same one wherever the row was tapped (Home, Activity, Why; Abu 10-15:
// "it's still receipt"): a swap, a send, a bridge or a deposit with Share, and money that came in with who sent it.
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import type { AgentFeedDetail, AgentFeedItem } from "@kawase/api-client";
import { getVenueIdentity, venueKey } from "@kawase/identity";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import {
  Button,
  diagnose,
  ErrorState,
  KeyValue,
  Panel,
  SectionLabel,
  SIZE,
  Skeleton,
  SPACE,
  TYPE,
  useHeldLoading,
  useTheme,
  type Diagnosis,
} from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { LIST_DETENTS } from "@/components/sheet/constants";
import { RaceRows } from "@/chat/race-card";
import { useFeedReceipt } from "@/receipt/feed-receipt";
import { IncomingActions } from "@/receipt/incoming-actions";
import { ReceiptSlip } from "@/receipt/receipt-slip";
import { ShareReceiptButton } from "@/receipt/share-receipt";
import { useOpenIn, type OpenTarget } from "@/chat/open-in";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { api } from "@/session/api";

import { useFeedCopy } from "./feed-copy";
import { FeedMark } from "./feed-timeline";

const HASH_HEAD = 10;
const HASH_TAIL = 6;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const SKELETON_COUNT = 3;
const SKELETON_ROWS = Array.from({ length: SKELETON_COUNT }, (_, row) => row);
const SKELETON_AMOUNT = 64;
/** The kinds whose run raced venues first (the race is read from the conversation that made it). */
const RACED: ReadonlySet<AgentFeedItem["kind"]> = new Set(["swap", "bridge", "crosschain", "earn", "lend"]);

/** A fact with a mark beside its value (the token, the venue, the person). */
function Fact({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{label}</Text>
      <View style={styles.factValue}>
        {children}
        <Text numberOfLines={1} style={[TYPE.rowStrong, styles.shrink, { color: color.ink }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function FeedDetailSheet({
  item,
  onClose,
  onAsk,
}: {
  item: AgentFeedItem;
  onClose: () => void;
  onAsk?: ((prompt: string) => void) | undefined;
}) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <Sheet
      onClose={onClose}
      closeLabel={t("shell.kit.closeNamed", { name: t("feed.detail.title") })}
      detents={LIST_DETENTS}
    >
      <FeedDetail item={item} onLeave={onClose} onAsk={onAsk} ground={color.popover} />
    </Sheet>
  );
}

/**
 * What a row opens, without the sheet around it: the sheet on a phone, Activity's receipt panel on a desktop.
 * `onLeave` runs before it navigates away (the sheet closes); `ground` is the colour it sits on (the slip's notches).
 */
export function FeedDetail({
  item,
  onLeave,
  onAsk,
  ground,
}: {
  item: AgentFeedItem;
  onLeave?: (() => void) | undefined;
  onAsk?: ((prompt: string) => void) | undefined;
  ground: string;
}) {
  const onClose = () => onLeave?.();
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const copy = useFeedCopy();
  const feedReceipt = useFeedReceipt();
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
  const expectsRace =
    Boolean(item.threadId) && RACED.has(item.kind) && item.outcome !== "scheduled" && item.group !== "found";
  const where =
    row.counterparty && ADDRESS.test(row.counterparty)
      ? `${row.counterparty.slice(0, ADDRESS_HEAD)}…${row.counterparty.slice(-ADDRESS_TAIL)}`
      : row.counterparty;
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
  const amount = row.other
    ? `${copy.money(row.other.amount, row.other.token)} → ${copy.money(row.amount, row.token)}`
    : copy.money(row.amount, row.token);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.at));
  const prompt =
    row.group === "found" && row.suggestion ? t("feed.detail.foundPrompt", { what: copy.line(row) }) : null;
  const receipt = feedReceipt(row);
  const incoming =
    receipt &&
    row.kind === "receive" &&
    row.counterparty &&
    ADDRESS.test(row.counterparty) &&
    row.txHash &&
    row.token &&
    row.amount
      ? row
      : null;

  return (
    <>
      {receipt ? null : (
        <>
          <View style={styles.face}>
            <FeedMark item={row} ring={ground} />
          </View>
          <SheetHeading title={copy.line(row)} body={copy.detail(row)} />
        </>
      )}
      <View style={styles.body}>
        {incoming ? (
          <IncomingActions
            from={incoming.counterparty!}
            amountBase={incoming.amount!}
            asset={incoming.token!.symbol}
            network={incoming.network}
            at={incoming.at}
            txHash={incoming.txHash!}
            explorerUrl={incoming.explorerUrl}
          />
        ) : receipt ? (
          <View style={styles.block}>
            <ReceiptSlip receipt={receipt} ground={ground} />
            <ShareReceiptButton receipt={receipt} />
          </View>
        ) : null}
        {detail?.asked ? (
          <View style={styles.block}>
            <SectionLabel>{t("feed.detail.asked")}</SectionLabel>
            <Text style={[TYPE.body, { color: color.ink }]}>“{detail.asked}”</Text>
          </View>
        ) : null}

        {/* Only a run that raced venues has a race to read, so only it shows the race's own shape while it loads;
            a watched automation or a received payment opens with what it already knows. */}
        {held && expectsRace ? (
          <View style={styles.block}>
            <Skeleton width="40%" height={SPACE.md} />
            {SKELETON_ROWS.map((row) => (
              <View key={row} style={styles.skeletonRow}>
                <Skeleton width={SIZE.markToken} height={SIZE.markToken} radius={SIZE.markToken} />
                <View style={styles.grow}>
                  <Skeleton width="55%" height={SPACE.md} />
                </View>
                <Skeleton width={SKELETON_AMOUNT} height={SPACE.md} />
              </View>
            ))}
          </View>
        ) : error && expectsRace ? (
          <ErrorState
            diagnosis={error}
            retry={() => void read()}
            stillWorks={t("feed.detail.stillWorks")}
            variant="strip"
          />
        ) : detail?.race ? (
          <View style={styles.block}>
            <SectionLabel>{t("feed.detail.race", { count: detail.race.rows.length })}</SectionLabel>
            <RaceRows race={detail.race} live={false} />
          </View>
        ) : null}

        {receipt ? null : (
          <Panel style={styles.panel}>
            <View style={styles.receipt}>
              <KeyValue label={t("feed.detail.outcome")} value={copy.outcome(row)} />
              {amount ? (
                <Fact label={t("feed.detail.amount")} value={amount}>
                  {row.token ? (
                    <TokenMark
                      token={{
                        chainId: ARC_CHAIN_IDS[row.network],
                        address: (row.other?.token ?? row.token).address,
                        symbol: (row.other?.token ?? row.token).symbol,
                      }}
                      size={SIZE.markChip}
                    />
                  ) : null}
                </Fact>
              ) : null}
              {venue ? (
                <Fact label={t("feed.detail.venue")} value={venue}>
                  {row.venue && getVenueIdentity(row.venue) ? (
                    <Mark entity={venueKey(row.venue)} size={SIZE.markChip} />
                  ) : null}
                </Fact>
              ) : null}
              {where ? (
                <Fact label={row.kind === "receive" ? t("receipt.from") : t("feed.detail.where")} value={where}>
                  {row.counterparty && ADDRESS.test(row.counterparty) ? (
                    <DefaultAvatar seed={row.counterparty.toLowerCase()} size={SIZE.markChip} />
                  ) : null}
                </Fact>
              ) : null}
              <KeyValue
                label={row.outcome === "scheduled" ? t("feed.detail.next") : t("feed.detail.when")}
                value={when}
              />
              {row.txHash ? (
                <KeyValue
                  label={t("feed.detail.tx")}
                  value={`${row.txHash.slice(0, HASH_HEAD)}…${row.txHash.slice(-HASH_TAIL)}`}
                />
              ) : null}
            </View>
          </Panel>
        )}

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
            <Button
              key={target.label}
              label={target.label}
              variant={index === 0 && !prompt ? "primary" : "secondary"}
              onPress={() => go(target)}
            />
          ))}
          {row.txHash ? (
            <Button
              label={t("feed.detail.why")}
              variant="secondary"
              onPress={() =>
                go({ label: "", href: { pathname: "/why/[tx]", params: { tx: row.txHash!, network: row.network } } })
              }
            />
          ) : null}
          {row.explorerUrl ? (
            <Button
              label={t("feed.detail.explorer")}
              variant="ghost"
              onPress={() => void Linking.openURL(row.explorerUrl!)}
            />
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg, paddingTop: SPACE.md },
  block: { gap: SPACE.sm },
  receipt: { gap: SPACE.sm },
  panel: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  face: { alignItems: "center", paddingTop: SPACE.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.md },
  factValue: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  actions: { gap: SPACE.sm },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1 },
});
