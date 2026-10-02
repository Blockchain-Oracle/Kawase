// One request in "Your requests": the asset's real mark, the amount in mono, the note or the date, and a status chip
// (waiting / paid / cancelled / expired, in words — colour is never the only signal). Open ones can be cancelled
// right from the row.
import { Pressable, View } from "react-native";

import type { PaymentRequest } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { RequestTokenMark, requestFigures } from "@/request/request-token";

import { effectiveStatus, useRequestDates, useRequestStatusLabel } from "./copy";

const MARK = 36;

export function RequestRow({ request, onPress, onCancel }: { request: PaymentRequest; onPress: () => void; onCancel?: (() => void) | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const label = useRequestStatusLabel();
  const dates = useRequestDates();
  const status = effectiveStatus(request);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${requestFigures(request, locale, true)}, ${label(status)}`}
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3 px-4 py-3"
    >
      <RequestTokenMark request={request} size={MARK} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Amount numberOfLines={1} className="text-foreground text-base font-semibold">
          {requestFigures(request, locale, true)}
        </Amount>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {request.note ? `“${request.note}” · ${dates.day(request.createdAt)}` : dates.day(request.createdAt)}
        </Text>
      </View>
      <View className={cn("rounded-full px-2.5 py-1", status === "paid" ? "bg-success/15" : "bg-muted")}>
        <Text className={cn("text-xs font-semibold", status === "paid" ? "text-success" : "text-muted-foreground")}>{label(status)}</Text>
      </View>
      {status === "open" && onCancel ? (
        <Button variant="ghost" size="sm" accessibilityLabel={t("request.cancel")} onPress={onCancel}>
          <Text className="text-muted-foreground text-xs">{t("common.cancel")}</Text>
        </Button>
      ) : null}
    </Pressable>
  );
}
