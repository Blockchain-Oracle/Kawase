// Auto-save on the Earn screen (Stage 8b): the same automation chat drafts, one tap away. When it is on, one line says
// what it keeps ready and opens Automations. When it is not, a draft with Kawase's own choices (the amount kept, the
// vault, checking daily and whenever money arrives) is said in full — what would move right now and the on-chain bound
// — with a few amounts to keep instead, and one button that signs its grants with one Face ID.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { AutomationView } from "@kawase/api-client";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AutomationSummary } from "@/automations/automation-summary";
import { useTurnOnLabel } from "@/automations/copy";
import { useAutomation } from "@/automations/use-automation";
import { useT } from "@/i18n";
import { useMoney, usePolicyText } from "@/send/copy";
import { api } from "@/session/api";

import { protocolEntity } from "./vault-row";

const MARK = 36;
const USDC_UNIT = 1_000_000n;
const ZERO = 0n;
/** Amounts to keep ready, in whole USDC. */
const KEEP_CHOICES = ["10", "25", "50", "100"];

export function AutoSaveCard() {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const policyText = usePolicyText();
  const turnOnLabel = useTurnOnLabel();
  const [current, setCurrent] = React.useState<AutomationView | null>();
  const [drafting, setDrafting] = React.useState(false);
  const controller = useAutomation(undefined);
  const draft = controller.automation;

  const load = React.useCallback(async () => {
    const { automations } = await api.automations.list().catch(() => ({ automations: [] as AutomationView[] }));
    setCurrent(automations.find((entry) => entry.kind === "auto_save" && (entry.status === "active" || entry.status === "paused")) ?? null);
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const start = async (keep?: string) => {
    setDrafting(true);
    try {
      const { automation } = await api.automations.autoSave(keep ? { keep } : {});
      controller.set(automation);
    } finally {
      setDrafting(false);
    }
  };

  // Once the draft is on, it is the current Auto-save.
  React.useEffect(() => {
    if (draft?.status === "active") setCurrent(draft);
  }, [draft]);

  if (current === undefined) return null;

  if (current) {
    const save = current.save;
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push("/automations")} className="bg-card border-border active:bg-muted flex-row items-center gap-3 rounded-3xl border px-4 py-3">
        {save ? <Mark entity={protocolEntity(save.protocol)} size={MARK} /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("automation.autoSave")}</Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {current.status === "paused" ? t("automation.statusPaused") : t("automation.saveOnLine", { amount: money("USDC", save?.keep ?? "0") })}
          </Text>
        </View>
        <Icon as={ChevronRight} className="text-muted-foreground size-5 rtl:-scale-x-100" />
      </Pressable>
    );
  }

  if (!draft) {
    return (
      <View className="bg-card border-border gap-3 rounded-3xl border p-4">
        <Eyebrow>{t("automation.autoSave")}</Eyebrow>
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("automation.saveCta")}</Text>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.saveCtaBody", { amount: money("USDC", (BigInt(KEEP_CHOICES[0]!) * USDC_UNIT).toString()) })}</Text>
        <Button variant="secondary" disabled={drafting} onPress={() => void start()}>
          <Text>{t("automation.saveStart")}</Text>
        </Button>
      </View>
    );
  }

  const keep = draft.save ? BigInt(draft.save.keep) : ZERO;
  return (
    <View className="bg-card border-border gap-4 rounded-3xl border p-4">
      <AutomationSummary automation={draft} compact />
      {draft.status === "draft" ? (
        <View className="flex-row flex-wrap gap-2">
          {KEEP_CHOICES.map((choice) => {
            const units = BigInt(choice) * USDC_UNIT;
            const selected = units === keep;
            return (
              <Button key={choice} size="sm" variant={selected ? "default" : "secondary"} disabled={drafting || controller.busy} accessibilityState={{ selected }} onPress={() => void start(choice)}>
                <Text>{money("USDC", units.toString())}</Text>
              </Button>
            );
          })}
        </View>
      ) : null}
      {draft.blocking ? (
        <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(draft.blocking, draft.network)}</Text>
      ) : draft.status === "draft" ? (
        <Button size="lg" disabled={controller.busy || drafting} onPress={() => void controller.turnOn(t("automation.saveSignPrompt", { amount: money("USDC", keep.toString()) }))}>
          <Icon as={ScanFace} className="text-primary-foreground size-5" />
          <Text>{controller.busy ? t("automation.turningOn") : turnOnLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}
