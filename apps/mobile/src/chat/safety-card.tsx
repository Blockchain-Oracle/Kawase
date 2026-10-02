// The card for the agent's safety tools (get_limits, pause_all, set_risk_mode, propose_limit_change,
// propose_allowlist_change, revoke_grant): the limits as they are; a tightening, done; a loosening, as Now → After with
// the approval on the card (never by the model, X7); a revoke, signed on the card. Actions only show while the card's
// network is the active one; a stored card keeps its own network.
import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { SafetyToolOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { ApprovalPanel, useChangeTitle, useLimitValueText } from "@/safety/approval-panel";
import { useChangeRunner } from "@/safety/use-change-runner";
import { useSafetyChange, useSafetyFormat } from "@/safety/use-safety";
import { useSession } from "@/session/session-provider";

import { AgentCard } from "./card";

export function SafetyCard({ output }: { output: SafetyToolOutput }) {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const format = useSafetyFormat();
  const title = useChangeTitle();
  const valueText = useLimitValueText();
  const runner = useChangeRunner(undefined, "chat");
  const { revoke } = useSafetyChange();
  const [done, setDone] = React.useState<"approved" | "revoked" | undefined>();
  const [busy, setBusy] = React.useState(false);
  const active = (user?.activeNetwork ?? "testnet") === output.network;
  const network = output.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const response = output.response;
  const pending = response?.status === "needs_approval" ? response : undefined;
  const { show } = runner;
  React.useEffect(() => {
    if (pending && !done) show(pending);
  }, [pending, done, show]);

  const changeTitle = output.change && output.change.kind !== "revoke" ? title(output.change, pending?.after) : t("safety.cardRevoke");
  const open = () => router.push("/limits");

  if (output.status === "refused")
    return (
      <AgentCard eyebrow={`${t("safety.cardRefused")} · ${network}`}>
        <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{output.reason ?? t("safety.failed")}</Text>
      </AgentCard>
    );

  if (output.status === "view" && output.safety) {
    const safety = output.safety;
    return (
      <AgentCard eyebrow={`${t("safety.cardLimits")} · ${network}`}>
        {safety.pausedAt ? <Text className={cn("text-destructive text-sm font-semibold", TEXT_START)}>{t("safety.pausedSince", { time: format.time(safety.pausedAt) })}</Text> : null}
        {safety.allowances.map((entry) => (
          <View key={entry.token} className="flex-row items-center justify-between gap-3">
            <Text className="text-foreground text-base font-semibold">{entry.symbol}</Text>
            <Text className="text-muted-foreground text-sm">
              {t("safety.allowanceRow", { amount: format.money(entry.perDay, entry.decimals, entry.symbol), left: format.money(entry.leftToday, entry.decimals, entry.symbol) })}
            </Text>
          </View>
        ))}
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {[
            t("safety.perPaymentRow", { amount: format.usdc(safety.perPayment.temp?.value ?? safety.perPayment.value) }),
            `${t("safety.risk")}: ${t(safety.riskMode === "careful" ? "safety.riskGuard" : safety.riskMode === "autonomous" ? "safety.riskAutonomous" : "safety.riskBalanced")}`,
            safety.practice ? t("safety.stripPractice") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {active ? (
          <Button variant="secondary" onPress={open}>
            <Text>{t("safety.title")}</Text>
          </Button>
        ) : null}
      </AgentCard>
    );
  }

  if (pending && done !== "approved")
    return (
      <AgentCard eyebrow={`${t("safety.cardWaiting")} · ${network}`}>
        <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{changeTitle}</Text>
        {active && runner.pending ? (
          <ApprovalPanel
            pending={runner.pending}
            busy={runner.busy}
            onApprove={() =>
              void runner.confirm().then((ok) => {
                if (ok) setDone("approved");
              })
            }
          />
        ) : (
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{`${valueText(pending.before)} → ${valueText(pending.after)}`}</Text>
        )}
      </AgentCard>
    );

  const signRevoke = async () => {
    if (!output.revoke) return;
    setBusy(true);
    const outcome = await revoke(output.revoke, t("safety.revokePrompt"), t("common.cancel"));
    setBusy(false);
    if (outcome === "revoked") setDone("revoked");
    toast(outcome === "revoked" ? t("safety.revokedOnArc") : t("safety.revokeLater"));
  };

  return (
    <AgentCard eyebrow={`${t("safety.cardApplied")} · ${network}`}>
      <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{changeTitle}</Text>
      {response && response.status !== "needs_approval" && output.change && output.change.kind !== "revoke" ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.tightenNote")}</Text>
      ) : null}
      {done === "approved" ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.saved")}</Text> : null}
      {output.revoke && active && done !== "revoked" ? (
        <View className="gap-2">
          <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("safety.revokeOffer")}</Text>
          <Button disabled={busy} onPress={() => void signRevoke()}>
            <Text>{t("safety.revokeOnArc")}</Text>
          </Button>
        </View>
      ) : null}
      {done === "revoked" ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.revokedOnArc")}</Text> : null}
      {active ? (
        <Button variant="ghost" onPress={open}>
          <Text>{t("safety.title")}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}
