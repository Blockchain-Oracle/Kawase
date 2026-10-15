// Setup's budget step (D38: the agent works inside a weekly budget; replaces the old any-recipient daily allowance): one
// hero figure — $200 a week — with what it means in one line, what it covers as chips, the worst case in words, and
// one confirm to turn it on. "Change the numbers" opens the Budget screen; "Not now" leaves every action asking.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useSession } from "@/session/session-provider";
import { biometricKind, confirmWithBiometrics, type BiometricKind } from "@/wallet/biometric";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { DEFAULT_CATEGORIES, DEFAULT_PER_ACTION, DEFAULT_WEEKLY, defaultDraft, useAllBudgetVenues } from "./defaults";
import { formatUsd } from "./format";
import { signBudget } from "./sign-budget";
import type { BudgetView } from "./types";
import { useBudget } from "./use-budget";

export function BudgetIntro({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { color } = useTheme();
  const { user } = useSession();
  const { state, set, network } = useBudget();
  const signer = useWalletSigner();
  const ready = state.status === "ready";
  const { venues } = useAllBudgetVenues(network, ready);
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<BiometricKind>("none");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  // On — already (a returning account) or just now: setup moves on, once.
  const existing = ready ? state.view : null;
  const finished = React.useRef(false);
  React.useEffect(() => {
    if (!existing || finished.current) return;
    finished.current = true;
    onDone();
  }, [existing, onDone]);

  const method = t(`budget.method.${kind}`);
  const label = kind !== "none" && kind !== "emailCode" ? t("budget.screen.turnOnWith", { method }) : t("budget.screen.turnOn");

  const turnOn = async () => {
    if (!signer || !user) {
      notify.info(t("budget.screen.walletNeeded"));
      return;
    }
    setBusy(true);
    try {
      const result = await signBudget({ draft: defaultDraft(venues), current: null, signer, network, confirm: () => confirmWithBiometrics(t("budget.screen.confirmPrompt"), t("common.cancel")) });
      if (result.outcome === "saved") {
        fire("filled", { sound: "confirmed" });
        set(result.answer.budget as BudgetView | null);
      } else if (result.outcome === "refused") notify.error(t("budget.screen.refused"));
      else if (result.outcome === "failed") notify.error(t("send.approvalFailed"));
    } catch {
      notify.error(t("budget.screen.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <Text style={[TYPE.caption, { color: color.text3 }]}>{t("budget.intro.eyebrow")}</Text>
        <Text style={[TYPE.displayBalance, { color: color.ink }]}>{formatUsd(DEFAULT_WEEKLY, locale)}</Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("budget.intro.body", { action: formatUsd(DEFAULT_PER_ACTION, locale) })}</Text>
      </View>
      <View style={styles.chips}>
        {DEFAULT_CATEGORIES.map((category) => (
          <View key={category} style={[styles.chip, { backgroundColor: color.raised2 }]}>
            <Text style={[TYPE.chipLabel, { color: color.ink }]}>{t(`budget.category.${category}`)}</Text>
          </View>
        ))}
      </View>
      <Text style={[TYPE.caption, { color: color.text3 }]}>{t("budget.intro.asks")}</Text>
      <View style={styles.grow} />
      <View style={styles.actions}>
        <Button label={busy ? t("budget.screen.signing") : label} loading={busy} disabled={!ready || !signer} onPress={() => void turnOn()} />
        <Button label={t("budget.intro.customise")} variant="secondary" onPress={() => router.push("/budget")} />
        <Button label={t("budget.intro.later")} variant="ghost" onPress={onSkip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: SPACE.lg },
  hero: { gap: SPACE.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { height: SIZE.chipHeight, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, justifyContent: "center" },
  grow: { flex: 1 },
  actions: { gap: SPACE.sm },
});
