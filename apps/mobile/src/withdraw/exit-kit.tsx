// The exit kit on Withdraw (plan "kept and carried": pause, revoke all, withdraw all), on the kit: the three moves that
// take Kawase out of the person's money, in order. Pause stops everything Kawase does at once (a tightening, so no
// prompt, D38); revoking every permission on Arc is irreversible from here, so it is a deliberate hold (21st 23527)
// followed by the one Face ID that signs the revoke (the Nonce kill-switch, L3's safety); "Withdraw everything" fills
// this page with every asset. The words are the Wallet & limits screen's own (one exit kit, two doors).
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";

import { Button, HoldButton, LoadingState, Panel, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { useChangeRunner } from "@/safety/use-change-runner";
import { useSafetyChange, useSafetyView } from "@/safety/use-safety";
import { api } from "@/session/api";

export function ExitKit({ onEverything }: { onEverything: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const { safety, load, set, canLoad } = useSafetyView();
  const control = useChangeRunner(set);
  const { revoke } = useSafetyChange();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canLoad) return null;
  if (!safety) return <LoadingState shape="plate" />;

  const grantsOn = safety.grants.allowance + safety.grants.automation + safety.grants.marketplace;
  const revokeAll = async () => {
    setBusy(true);
    try {
      const kit = await api.safety.exitKit();
      set(kit.safety);
      if (!kit.revoke) {
        toast(t("safety.exitNothing"));
        return;
      }
      const outcome = await revoke(kit.revoke, t("safety.revokePrompt"), t("common.cancel"));
      toast(outcome === "revoked" ? t("safety.exitRevoked") : t("safety.revokeLater"));
      await load();
    } catch {
      toast(t("safety.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={styles.panel}>
      <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("safety.exitTitle")}</Text>
      <Text style={[TYPE.body, { color: color.text2 }]}>{t("safety.exitBody")}</Text>
      <Button
        label={safety.pausedAt ? t("safety.exitPaused") : t("safety.exitPause")}
        variant="secondary"
        disabled={Boolean(safety.pausedAt) || control.busy}
        onPress={() => void control.submit({ kind: "pause", on: true })}
      />
      {grantsOn > 0 ? (
        <View style={styles.group}>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("safety.exitGrants", { count: grantsOn })}</Text>
          <HoldButton label={t("safety.exitRevokeHold")} holdingLabel={t("safety.exitRevoking")} ready busy={busy} onConfirm={() => void revokeAll()} />
        </View>
      ) : (
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("safety.exitNothing")}</Text>
      )}
      <Button label={t("safety.exitMove")} onPress={onEverything} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.md, padding: SPACE.lg },
  group: { gap: SPACE.sm },
});
