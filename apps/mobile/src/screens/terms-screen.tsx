// The terms the person agrees to on the completion screen (Codex review R15): a real page instead of a sentence with
// nothing behind it. Short and honest, and marked as a draft — Kawase is a preview, and full terms and a privacy
// policy replace this before a public launch. Readable without an account (it sits outside the signed-in area) and
// in the person's language, with the language pill at hand.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TERMS_VERSION } from "@kawase/config";
import { Badge } from "@kawase/ui-native/components/ui/badge";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { useT } from "@/i18n";

const EDGE_INSET = 12;
const FOOTER_GAP = 24;

export function TermsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [languageOpen, setLanguageOpen] = React.useState(false);

  const sections = [
    { title: t("terms.whatTitle"), body: t("terms.whatBody") },
    { title: t("terms.controlTitle"), body: t("terms.controlBody") },
    { title: t("terms.riskTitle"), body: t("terms.riskBody") },
    { title: t("terms.testTitle"), body: t("terms.testBody") },
    { title: t("terms.dataTitle"), body: t("terms.dataBody") },
  ];

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + EDGE_INSET }}>
      <View className="flex-row items-center justify-between px-5">
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={t("common.back")}
          className="size-11"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <LanguagePill onPress={() => setLanguageOpen(true)} />
      </View>
      <ScrollView
        contentContainerClassName="gap-6 px-5 pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}
      >
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <Text
              accessibilityRole="header"
              className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}
            >
              {t("terms.title")}
            </Text>
            <Badge variant="secondary">
              <Text>{t("terms.draft")}</Text>
            </Badge>
          </View>
          <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("terms.draftNote")}</Text>
        </View>
        {sections.map((section) => (
          <View key={section.title} className="gap-1.5">
            <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
              {section.title}
            </Text>
            <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{section.body}</Text>
          </View>
        ))}
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {t("terms.version", { version: TERMS_VERSION })}
        </Text>
      </ScrollView>
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}
