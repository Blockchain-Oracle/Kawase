// The receipt as a slip (Senryo's trade slip, D-331/D-349, made Kawase's): the brand and the receipt's folio, what
// moved and with whom, the vermilion hanko pressed beside the amount, the facts, then a perforation and a stub whose
// QR opens the transaction on the explorer. The paper follows the theme, on the page and in the shared image alike;
// on the page the perforation's notches are cut in the colour of what the slip sits on.
import * as React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { arcIdentity } from "@kawase/identity";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { Mark } from "@kawase/ui-native/components/mark";

import { ELEVATION, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

/** What a receipt says. `amount` is already formatted with its currency ("20.00 USDC"). */
export type ReceiptData = {
  direction: "sent" | "received";
  amount: string;
  counterparty: string;
  network: "mainnet" | "testnet";
  at: string;
  txHash: string | null;
  explorerUrl: string | null;
  note?: string | null | undefined;
  /** A swap reads "You swapped … via <venue>" (`counterparty` is the venue); a transfer (the default) "You sent … to". */
  kind?: "transfer" | "swap" | undefined;
};

const SLIP = { maxWidth: 380, pad: 22, radius: 20, mark: 26, hanko: 78, perf: 18, notch: 18, qr: 92, netMark: 16 } as const;
const HASH_HEAD = 8;
const HASH_TAIL = 6;
const DASH = "4 5";
const TRACKING = 0.9;
const HALF = 2;
const HANKO_TILT = "-10deg";
const HEX_PREFIX = 2;
/** The mark in the QR's centre, as a share of the code (error correction H keeps it readable). */
const QR_CENTER = 0.2;

const shortHash = (hash: string) => `${hash.slice(0, HASH_HEAD)}…${hash.slice(-HASH_TAIL)}`;
const explorerHost = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0] ?? url;

function Perforation({ notch, rule }: { notch: string | null; rule: string }) {
  return (
    <View style={styles.perf} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={SLIP.perf}>
        <Line x1={SLIP.notch} x2="100%" y1={SLIP.perf / HALF} y2={SLIP.perf / HALF} stroke={rule} strokeWidth={1} strokeDasharray={DASH} />
      </Svg>
      {notch ? (
        <>
          <View style={[styles.notch, styles.notchStart, { backgroundColor: notch }]} />
          <View style={[styles.notch, styles.notchEnd, { backgroundColor: notch }]} />
        </>
      ) : null}
    </View>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[TYPE.meta, { color: color.text2 }]}>{label}</Text>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

/**
 * `exporting`: drawn for the shared image (no notches, no shadow, the explorer link as words beside the QR).
 * `ground`: the colour the slip sits on, for the notches (the page's ground by default).
 */
export const ReceiptSlip = React.forwardRef<View, { receipt: ReceiptData; exporting?: boolean; ground?: string | undefined }>(function ReceiptSlip({ receipt, exporting = false, ground }, ref) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(receipt.at));
  const folio = receipt.txHash ? `#${receipt.txHash.slice(HEX_PREFIX, HEX_PREFIX + HASH_TAIL).toUpperCase()}` : t("receipt.title");
  const network = receipt.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const value = [TYPE.rowStrong, styles.end, { color: color.ink }];
  const explorer = receipt.explorerUrl;
  return (
    <View ref={ref} collapsable={false} style={[styles.paper, { backgroundColor: color.card }, exporting ? null : ELEVATION.receipt]}>
      <View style={styles.body}>
        <View style={styles.head}>
          <KawaseMark size={SLIP.mark} />
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>Kawase</Text>
          <View style={styles.flex} />
          <Text style={[TYPE.label, styles.caps, { color: color.text2 }]}>
            {t("receipt.title")} {folio}
          </Text>
        </View>
        <View style={styles.result}>
          <View style={styles.flex}>
            <Text style={[TYPE.label, styles.caps, { color: color.text2 }]}>
              {receipt.kind === "swap" ? t("receipt.swapped") : receipt.direction === "sent" ? t("receipt.sent") : t("receipt.received")}
            </Text>
            <Text style={[TYPE.displayPrice, { color: color.ink }]} numberOfLines={1} adjustsFontSizeToFit>
              {receipt.amount}
            </Text>
            <Text style={[TYPE.body, { color: color.text2 }]} numberOfLines={1}>
              {receipt.kind === "swap" ? t("receipt.via") : receipt.direction === "sent" ? t("receipt.to") : t("receipt.from")} <Text style={{ color: color.ink }}>{receipt.counterparty}</Text>
            </Text>
          </View>
          <View style={styles.hanko} pointerEvents="none">
            <Hanko size={SLIP.hanko} id={`receipt-hanko-${receipt.txHash ?? "x"}`} />
          </View>
        </View>
        <View style={[styles.rule, { backgroundColor: color.hairline }]} />
        <View style={styles.facts}>
          <Fact label={t("receipt.when")}>
            <Text style={value}>{when}</Text>
          </Fact>
          <Fact label={t("receipt.network")}>
            <Mark entity={arcIdentity(receipt.network).chain} size={SLIP.netMark} />
            <Text style={value}>{receipt.network === "testnet" ? `${network} · ${t("receipt.testMoney")}` : network}</Text>
          </Fact>
          {receipt.note ? (
            <Fact label={t("receipt.note")}>
              <Text style={value} numberOfLines={2}>
                {receipt.note}
              </Text>
            </Fact>
          ) : null}
          {receipt.txHash ? (
            <Fact label={t("receipt.transaction")}>
              <Text style={value}>{shortHash(receipt.txHash)}</Text>
            </Fact>
          ) : null}
        </View>
      </View>
      {explorer ? (
        <>
          <Perforation notch={exporting ? null : (ground ?? color.ground)} rule={color.hairline} />
          <View style={styles.stub}>
            <View style={[styles.flex, styles.stubWords]}>
              <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("receipt.verifyTitle")}</Text>
              {exporting ? (
                <Text style={[TYPE.meta, { color: color.text2 }]} numberOfLines={1}>
                  {t("receipt.scanToVerify", { explorer: explorerHost(explorer) })}
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => {
                    fire("tick");
                    void Linking.openURL(explorer);
                  }}
                >
                  <Text style={[TYPE.meta, styles.link, { color: color.ink }]}>{t("receipt.openExplorer", { explorer: explorerHost(explorer) })}</Text>
                </Pressable>
              )}
              <Text style={[TYPE.meta, { color: color.text2 }]}>{t("receipt.footer")}</Text>
            </View>
            <DottedQr value={explorer} size={SLIP.qr} dotColor={color.ink} background={color.card} center={<KawaseMark size={SLIP.qr * QR_CENTER} />} />
          </View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  paper: { width: "100%", maxWidth: SLIP.maxWidth, alignSelf: "center", borderRadius: SLIP.radius },
  body: { padding: SLIP.pad, gap: SPACE.lg },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  flex: { flex: 1, minWidth: 0 },
  caps: { textTransform: "uppercase", letterSpacing: TRACKING },
  result: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  hanko: { transform: [{ rotate: HANKO_TILT }] },
  rule: { height: StyleSheet.hairlineWidth },
  facts: { gap: SPACE.sm },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.md },
  factValue: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, flexShrink: 1 },
  end: { textAlign: "right", flexShrink: 1 },
  perf: { height: SLIP.perf, justifyContent: "center" },
  notch: { position: "absolute", width: SLIP.notch, height: SLIP.notch, borderRadius: SLIP.notch / HALF },
  notchStart: { left: -SLIP.notch / HALF },
  notchEnd: { right: -SLIP.notch / HALF },
  stub: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SLIP.pad, paddingTop: SPACE.sm, paddingBottom: SLIP.pad },
  stubWords: { gap: SPACE.xs },
  link: { textDecorationLine: "underline" },
});
