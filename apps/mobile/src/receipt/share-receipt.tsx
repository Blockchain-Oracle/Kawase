// A receipt as an image (C7, plan §A.4.11 "receipt share"): the receipt slip (receipt-slip.tsx) in the person's own
// theme, its QR opening the transaction on the explorer, made into a picture the person shares anywhere
// (react-native-view-shot captures the slip as it is drawn; the share sheet sends the PNG). The web, or a capture that
// fails, shares the same facts as text with the explorer link.
import * as Sharing from "expo-sharing";
import { Share2 } from "lucide-react-native";
import * as React from "react";
import { Modal, Platform, Pressable, Share, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";

import { ReceiptSlip, type ReceiptData } from "./receipt-slip";

export type { ReceiptData };

const CARD_WIDTH = 340;

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
export function ShareReceiptButton({ receipt, variant = "secondary", compact = false }: { receipt: ReceiptData; variant?: "secondary" | "ghost"; compact?: boolean }) {
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
      <Button variant={variant} {...(compact ? { size: "sm" as const } : {})} onPress={() => setOpen(true)}>
        <Icon as={Share2} className="size-4" />
        <Text>{t("receipt.share")}</Text>
      </Button>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
          <Pressable onPress={() => undefined} style={{ alignItems: "center", gap: 16 }}>
            <View style={{ width: CARD_WIDTH }}>
              <ReceiptSlip ref={card} receipt={receipt} exporting />
            </View>
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
