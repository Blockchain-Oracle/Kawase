// The language sheet (A4 / K5): the ten languages, each in its own name and script, the current one ticked. A tap
// changes the language in place — text, reading direction, number formats — with no restart (`chooseLocale`),
// and the sheet closes. Opened from the language pill (first onboarding panel, guest home) and from Settings.
import { Globe } from "lucide-react-native";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { LANGUAGE_NAMES } from "@kawase/i18n";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useThemeColors } from "@/theme/use-theme-colors";

type LanguageSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const { t } = useT();
  const { locale, chooseLocale } = useLocale();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const choose = (next: SupportedLocale) => {
    if (next !== locale) void chooseLocale(next);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("settings.language")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom}>
      <ListGroup>
        {SUPPORTED_LOCALES.map((candidate) => (
          <ListRow key={candidate} title={LANGUAGE_NAMES[candidate]} selected={candidate === locale} accessibilityRole="radio" onPress={() => choose(candidate)} />
        ))}
      </ListGroup>
    </Sheet>
  );
}

type LanguagePillProps = {
  onPress: () => void;
  className?: string;
};

/** The pill that opens the sheet: the current language in its own script, with a globe. */
export function LanguagePill({ onPress, className }: LanguagePillProps) {
  const { t } = useT();
  const { locale } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("settings.language")}
      onPress={onPress}
      className={cn("bg-secondary active:bg-muted flex-row items-center gap-1.5 rounded-full px-2.5 py-1", className)}
    >
      <Icon as={Globe} className="text-muted-foreground size-3.5" />
      <Text className="text-foreground text-xs font-semibold">{LANGUAGE_NAMES[locale]}</Text>
    </Pressable>
  );
}
