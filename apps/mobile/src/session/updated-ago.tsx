// "Updated 5 minutes ago" under values read earlier (B2-3, plan §A.4 12 "Offline"): shown only while the latest read
// failed or the app is offline, in the person's language (Intl.RelativeTimeFormat), ticking every minute.
import { Clock } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

function ago(at: number, now: number, locale: string) {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.max(0, Math.round((now - at) / MINUTE_MS));
  if (minutes < HOUR_MINUTES) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / HOUR_MINUTES);
  if (hours < DAY_HOURS) return format.format(-hours, "hour");
  return format.format(-Math.round(hours / DAY_HOURS), "day");
}

export function UpdatedAgo({ at, className }: { at: number | undefined; className?: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  if (at === undefined) return null;
  return (
    <View accessibilityLiveRegion="polite" className={cn("flex-row items-center gap-1.5", className)}>
      <Icon as={Clock} className="text-muted-foreground size-3.5" />
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("offline.updated", { ago: ago(at, now, locale) })}</Text>
    </View>
  );
}
