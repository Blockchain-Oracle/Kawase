// Export (surfaces.md Activity "export"; cards/automate-safety.md "Records: export CSV/beancount"): pick the month
// (this one or the last five) and the format, and the file is handed to the share sheet (or downloaded on the web).
import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { NetworkId } from "@kawase/api-client";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { Chip } from "@/marketplace/parts";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";

import { shareTextFile } from "./share-file";

const MONTHS_BACK = 6;
const MONTH_CHARS = "YYYY-MM".length;

export function ExportSheet({ open, onClose, network }: { open: boolean; onClose: () => void; network: NetworkId }) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const months = React.useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTHS_BACK }, (_, back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
  }, []);
  const [month, setMonth] = React.useState(0);
  const [format, setFormat] = React.useState<"csv" | "beancount">("csv");
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const key = months[month]!.toISOString().slice(0, MONTH_CHARS);
      const file = await api.history.export(network, key, format);
      await shareTextFile({ filename: file.filename, body: file.body, mimeType: format === "csv" ? "text/csv" : "text/plain" });
      if (!file.complete) toast(t("history.exportPartial"));
      onClose();
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom} className="gap-4">
      <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("history.exportTitle")}</Text>
      <View className="flex-row flex-wrap gap-2">
        {months.map((date, index) => (
          <Chip key={date.toISOString()} label={new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date)} selected={month === index} onPress={() => setMonth(index)} />
        ))}
      </View>
      <View className="flex-row gap-2">
        <Chip label="CSV" selected={format === "csv"} onPress={() => setFormat("csv")} />
        <Chip label="Beancount" selected={format === "beancount"} onPress={() => setFormat("beancount")} />
      </View>
      <Text className={cn("text-muted-foreground text-xs leading-5", TEXT_START)}>{t("history.exportBody")}</Text>
      <Button disabled={busy} onPress={() => void run()}>
        <Text>{busy ? t("common.loading") : t("history.export")}</Text>
      </Button>
    </Sheet>
  );
}
