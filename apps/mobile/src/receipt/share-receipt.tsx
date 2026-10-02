// A receipt as an image (C7, plan §A.4.11 "receipt share"): the payment on warm paper — amount and currency, who, when,
// the network and the transaction — with the vermilion hanko pressed on it like a paid stamp, made into a picture the
// person shares anywhere (react-native-view-shot captures the card as it is drawn; the share sheet sends the PNG).
// The web, or a capture that fails, shares the same facts as text with the explorer link.
import * as Sharing from "expo-sharing";
import { Share2 } from "lucide-react-native";
import * as React from "react";
import { Modal, Platform, Pressable, Share, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

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
};

/** Paper and ink: the receipt reads the same in light and dark (it is an object, like the hanko). */
const PAPER = "#F6F2E9";
const INK = "#101210";
const MUTED = "#5E625A";
const RULE = "#DDD6C7";
const CARD_WIDTH = 320;
const HANKO = 92;
const MARK = 26;
const HASH_HEAD = 10;
const HASH_TAIL = 8;

const shortHash = (hash: string) => `${hash.slice(0, HASH_HEAD)}…${hash.slice(-HASH_TAIL)}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 }}>
      <Text style={{ color: MUTED, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: INK, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** The receipt card itself (what the image is made of). */
export const ReceiptImage = React.forwardRef<View, { receipt: ReceiptData }>(function ReceiptImage({ receipt }, ref) {
  const { t } = useT();
  const { locale } = useLocale();
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(receipt.at));
  const network = receipt.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  return (
    <View ref={ref} collapsable={false} style={{ width: CARD_WIDTH, backgroundColor: PAPER, borderRadius: 24, padding: 22, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <KawaseMark size={MARK} />
        <Text style={{ color: INK, fontSize: 15, fontWeight: "700" }}>Kawase</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: MUTED, fontSize: 12, fontWeight: "600" }}>{t("receipt.title")}</Text>
      </View>
      <Text style={{ color: MUTED, fontSize: 13, marginTop: 22 }}>{receipt.direction === "sent" ? t("receipt.sent") : t("receipt.received")}</Text>
      <Text style={{ color: INK, fontSize: 34, fontWeight: "700", marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
        {receipt.amount}
      </Text>
      <View style={{ height: 1, backgroundColor: RULE, marginVertical: 16 }} />
      <Row label={receipt.direction === "sent" ? t("receipt.to") : t("receipt.from")} value={receipt.counterparty} />
      <Row label={t("receipt.when")} value={when} />
      <Row label={t("receipt.network")} value={receipt.network === "testnet" ? `${network} · ${t("receipt.testMoney")}` : network} />
      {receipt.note ? <Row label={t("receipt.note")} value={receipt.note} /> : null}
      {receipt.txHash ? <Row label={t("receipt.transaction")} value={shortHash(receipt.txHash)} /> : null}
      <View style={{ position: "absolute", right: 14, bottom: 46, transform: [{ rotate: "-12deg" }], opacity: 0.92 }} pointerEvents="none">
        <Hanko size={HANKO} id={`receipt-hanko-${receipt.txHash ?? "x"}`} />
      </View>
      <Text style={{ color: MUTED, fontSize: 11, marginTop: 18 }}>{t("receipt.footer")}</Text>
    </View>
  );
});

/** The words the receipt shares when no image can be made (the web, or a failed capture). */
function useReceiptText() {
  const { t } = useT();
  return (receipt: ReceiptData) =>
    [
      receipt.direction === "sent" ? t("receipt.sentLine", { amount: receipt.amount, name: receipt.counterparty }) : t("receipt.receivedLine", { amount: receipt.amount, name: receipt.counterparty }),
      receipt.network === "testnet" ? `${t("network.arcTestnet")} · ${t("receipt.testMoney")}` : t("network.arc"),
      receipt.explorerUrl ?? "",
    ]
      .filter(Boolean)
      .join("\n");
}

/** "Share receipt": a preview of the image card and one Share button. */
export function ShareReceiptButton({ receipt, variant = "secondary" }: { receipt: ReceiptData; variant?: "secondary" | "ghost" }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const card = React.useRef<View>(null);
  const text = useReceiptText();

  const share = async () => {
    setBusy(true);
    try {
      if (Platform.OS !== "web" && card.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(card, { format: "png", quality: 1, result: "tmpfile" });
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: t("receipt.title"), UTI: "public.png" });
      } else {
        await Share.share({ message: text(receipt) });
      }
      setOpen(false);
    } catch {
      await Share.share({ message: text(receipt) }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} onPress={() => setOpen(true)}>
        <Icon as={Share2} className="size-4" />
        <Text>{t("receipt.share")}</Text>
      </Button>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
          <Pressable onPress={() => undefined} style={{ alignItems: "center", gap: 16 }}>
            <ReceiptImage ref={card} receipt={receipt} />
            <View style={{ flexDirection: "row", gap: 8, width: CARD_WIDTH }}>
              <Button className="flex-1" disabled={busy} onPress={() => void share()}>
                <Icon as={Share2} className="text-primary-foreground size-4" />
                <Text>{t("receipt.shareImage")}</Text>
              </Button>
              <Button variant="secondary" onPress={() => setOpen(false)}>
                <Text>{t("common.close")}</Text>
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
