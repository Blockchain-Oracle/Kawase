// The share card for a payment request (C3, revamp 10b): who asks and how much (the amount large, with the asset's
// real mark), the note the payer will see, the network, the link with a scannable QR on an ink tile (it scans on
// both themes, like Receive), Copy and Share, and the live status — waiting, paid by whom and when with the
// explorer link, cancelled or expired. One lime action while it is open: Share. The same card sits in the chat
// (compact: no QR). Links and addresses stay left-to-right in every language.
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react-native";
import * as React from "react";
import { Linking, Share, View } from "react-native";
import { toast } from "sonner-native";

import type { PaymentRequest } from "@kawase/api-client";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { NetworkChip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { tokens } from "@kawase/ui-tokens";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";

import { effectiveStatus, useRequestDates, useRequestStatusLabel } from "./copy";
import { RequestTokenMark, requestFigures } from "./request-token";

const ASSET_MARK = 32;
const ASSET_MARK_COMPACT = 26;
const QR_SIZE = 200;
const QR_PADDING = 16;
const CENTER_MARK = 36;
const CENTER_PADDING = 5;
const LTR = { writingDirection: "ltr", textAlign: "left" } as const;

export type RequestShareCardProps = {
  request: PaymentRequest;
  /** How the requester is named on the card ("@abu", or "You" for the person's own view). */
  requester: string;
  compact?: boolean;
  /** Offered while the request is open. */
  onCancel?: (() => void) | undefined;
  cancelling?: boolean;
};

export function RequestShareCard({ request, requester, compact, onCancel, cancelling }: RequestShareCardProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const statusLabel = useRequestStatusLabel();
  const dates = useRequestDates();
  const asset = request.asset;
  const status = effectiveStatus(request);
  const open = status === "open";
  const figures = requestFigures(request, locale);
  const sum = requestFigures(request, locale, true);
  const networkName = request.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const ink = tokens.themes.dark;

  const copy = async () => {
    await Clipboard.setStringAsync(request.link);
    toast(t("request.linkCopied"));
  };
  const share = async () => {
    await Share.share({
      message: t("request.shareMessage", { name: requester, amount: sum, network: networkName, link: request.link }),
    });
  };

  return (
    <View className="gap-4">
      <View className={cn("items-center gap-2", compact ? "" : "pt-1")}>
        <Text className="text-muted-foreground text-sm">{t("request.requests", { name: requester })}</Text>
        <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
          <RequestTokenMark request={request} size={compact ? ASSET_MARK_COMPACT : ASSET_MARK} />
          <Text
            accessibilityLabel={sum}
            className={cn("font-display text-foreground font-bold", compact ? "text-[32px]" : "text-5xl")}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {figures}
          </Text>
          <Text className="font-display text-muted-foreground text-xl font-semibold">{asset}</Text>
        </View>
        {request.note ? (
          <Text className="text-foreground text-center text-base" numberOfLines={3}>
            “{request.note}”
          </Text>
        ) : null}
        <NetworkChip label={networkName} />
      </View>

      {open && !compact ? (
        <View className="items-center">
          <View className="items-center justify-center rounded-3xl" style={{ padding: QR_PADDING, backgroundColor: ink.background }}>
            <DottedQr
              value={request.link}
              size={QR_SIZE}
              dotColor={ink.foreground}
              background={ink.background}
              center={
                <View className="items-center justify-center rounded-2xl" style={{ backgroundColor: ink.background, padding: CENTER_PADDING }}>
                  <RequestTokenMark request={request} size={CENTER_MARK} />
                </View>
              }
            />
          </View>
        </View>
      ) : null}

      <View
        accessibilityLiveRegion="polite"
        className={cn("flex-row items-center gap-2 rounded-2xl px-4 py-3", status === "paid" ? "bg-success/15" : "bg-muted")}
      >
        {status === "paid" ? <Icon as={Check} className="text-success size-4" /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={cn("text-sm font-semibold", status === "paid" ? "text-success" : "text-foreground", TEXT_START)}>{statusLabel(status)}</Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {status === "paid" && request.paidAt
              ? request.paidBy
                ? t("request.paidBy", { name: request.paidBy.name ?? shortAddress(request.paidBy.address), time: dates.moment(request.paidAt) })
                : t("request.paidAt", { time: dates.moment(request.paidAt) })
              : status === "open"
                ? t("request.openUntil", { date: dates.day(request.expiresAt) })
                : status === "expired"
                  ? t("request.expiredBody")
                  : t("request.canceledBody")}
          </Text>
        </View>
        {request.paidTx ? (
          <Button variant="ghost" size="sm" accessibilityLabel={t("send.viewExplorer")} onPress={() => void Linking.openURL(request.paidTx!.explorerUrl)}>
            <Icon as={ExternalLink} className="text-muted-foreground size-4" />
          </Button>
        ) : null}
      </View>

      {open ? (
        <View className="gap-2">
          <View className="bg-muted flex-row items-center gap-2 rounded-2xl py-1 pe-1 ps-4">
            <Text selectable numberOfLines={1} className="text-foreground min-w-0 flex-1 font-mono text-sm" style={LTR}>
              {request.link}
            </Text>
            <Button variant="ghost" size="sm" accessibilityLabel={t("request.copyLink")} onPress={() => void copy()}>
              <Icon as={Copy} className="size-4" />
            </Button>
          </View>
          <Button size={compact ? "default" : "lg"} onPress={() => void share()}>
            <Icon as={Share2} className="text-primary-foreground size-5" />
            <Text>{t("request.share")}</Text>
          </Button>
          {onCancel ? (
            <Button variant="ghost" disabled={cancelling} onPress={onCancel}>
              <Text className="text-muted-foreground">{t("request.cancel")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
