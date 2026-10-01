// The top bar of every onboarding page after the story (Phantom P05/P10 grammar): a back chevron or a close ×
// in a dim circle at the start, the step segments in the middle, and the language pill at the end — the pill
// never disappears because the person signed in (cross-cutting rule: language from the first screen on).
import { ChevronLeft, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";

import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { useT } from "@/i18n";

const CONTROL_SIZE = 40;
const SEGMENT_HEIGHT = 4;
const SEGMENT_WIDTH = 8;
const SEGMENT_ACTIVE_WIDTH = 22;
const HIT_SLOP = 8;

type OnboardingBarProps = {
  /** Back to the previous page (a chevron), or leave onboarding (an ×). */
  leading?: { kind: "back" | "close"; onPress: () => void };
  /** 0-based step and the number of steps, for the segments. */
  step?: { index: number; total: number };
};

export function OnboardingBar({ leading, step }: OnboardingBarProps) {
  const { t } = useT();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  return (
    <View className="min-h-11 flex-row items-center justify-between">
      <View style={{ width: CONTROL_SIZE }}>
        {leading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={leading.kind === "back" ? t("common.back") : t("common.close")}
            hitSlop={HIT_SLOP}
            onPress={leading.onPress}
            className="bg-secondary active:bg-muted items-center justify-center rounded-full"
            style={{ width: CONTROL_SIZE, height: CONTROL_SIZE }}
          >
            <Icon as={leading.kind === "back" ? ChevronLeft : X} className="size-5 rtl:-scale-x-100" />
          </Pressable>
        ) : null}
      </View>
      {step ? (
        <View accessibilityRole="progressbar" accessibilityLabel={t("story.panelOf", { n: step.index + 1, total: step.total })} className="flex-row gap-1.5">
          {Array.from({ length: step.total }, (_, i) => (
            <View
              key={i}
              className={i <= step.index ? "bg-primary" : "bg-muted"}
              style={{ height: SEGMENT_HEIGHT, width: i === step.index ? SEGMENT_ACTIVE_WIDTH : SEGMENT_WIDTH, borderRadius: SEGMENT_HEIGHT }}
            />
          ))}
        </View>
      ) : (
        <View />
      )}
      <LanguagePill onPress={() => setLanguageOpen(true)} />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}
