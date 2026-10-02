// The automation card (Stage 8): what `draft_automation` or `draft_auto_save` drafted — the read-back, the next runs
// (or, for Auto-save, what it keeps ready and what would move now), the on-chain bound —
// and one button named after the device's real check that signs the grant and turns it on. Blocked → the reason and
// its one fix (sign in, set up, add the contact); once the fix happens, the same draft is checked again with the
// request as it was asked — never a new one, and nothing turns on by itself (review K03). Once on, the card is the
// automation's live state; cancelled from chat, it offers the revoke of its permission on Arc. While it is a draft,
// its asset is a chip with the universal picker (R1): a scheduled send's currency (USDC or EURC — the everyday
// allowance's tokens; others say why), or the token a DCA buys (any token).
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronDown, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { ProposeAutomationOutput } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AutomationSummary } from "@/automations/automation-summary";
import { PracticeActions } from "@/automations/automation-more";
import { useRuleText, useScheduleText, useTurnOnLabel } from "@/automations/copy";
import { useAutomation } from "@/automations/use-automation";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useT } from "@/i18n";
import { nameFromWords, useMoney, usePolicyText } from "@/send/copy";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { stableToken } from "@/portfolio/ticket-token";
import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { AgentCard } from "./card";

/** The card for one automation; the Payroll screen passes just the automation (the summary is for the model). */
export function AutomationCard({ output }: { output: Pick<ProposeAutomationOutput, "automation"> }) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const money = useMoney();
  const policyText = usePolicyText();
  const scheduleText = useScheduleText();
  const turnOnLabel = useTurnOnLabel();
  const controller = useAutomation(output.automation.id ? output.automation : undefined);
  const automation = controller.automation ?? output.automation;
  const [adding, setAdding] = React.useState(false);
  const networkName = automation.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("automation.title")} · ${automation.network === "mainnet" ? t("network.realMoney") : networkName}`;
  const blocking = automation.blocking;
  const a = automation.action;
  const ruleText = useRuleText();
  const prompt = automation.rule
    ? `${ruleText.when(automation.rule)}: ${ruleText.what(automation.rule)}`
    : automation.save
    ? t("automation.saveSignPrompt", { amount: money("USDC", automation.save.keep) })
    : a
      ? t("automation.signPrompt", { readBack: `${scheduleText(automation.schedule)}: ${t("automation.sendTo", { amount: money(a.asset, a.amount), name: a.recipientName ?? nameFromWords(a.recipientWords) })}` })
      : t("automation.title");

  // After a fix made elsewhere — signing in, setting the wallet up — the same draft is checked again.
  const { status: session } = useSession();
  const blockedOn = blocking?.code;
  React.useEffect(() => {
    if (session === "account" && blockedOn === "SIGN_IN_REQUIRED") void controller.recheck();
  }, [session, blockedOn]);
  useFocusEffect(
    React.useCallback(() => {
      if (automation.status === "draft" && (blockedOn === "WALLET_NOT_SET_UP" || blockedOn === "WALLET_NOT_READY")) void controller.recheck();
    }, [automation.status, blockedOn, controller.recheck]),
  );
  const revokePending = automation.status === "canceled" && automation.grant?.status === "active";

  // The draft's asset (R1): a scheduled send's currency, or what a DCA buys.
  const [picking, setPicking] = React.useState(false);
  const dca = automation.dca ?? null;
  const assetToken = a
    ? stableToken(automation.network, a.asset)
    : dca
      ? { chainId: ARC_CHAIN_IDS[automation.network], address: dca.tokenOut, symbol: dca.symbolOut, name: dca.symbolOut, decimals: dca.decimalsOut, logoUrl: null }
      : undefined;
  const pickable = automation.status === "draft" && Boolean(automation.id) && assetToken !== undefined;

  const fix =
    blocking?.code === "SIGN_IN_REQUIRED"
      ? { label: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : blocking?.code === "RECIPIENT_UNKNOWN" && a
        ? { label: t("policy.fixAddContact", { name: nameFromWords(a.recipientWords) }), onPress: () => setAdding(true) }
        : blocking?.code === "AUTO_SAVE_EXISTS"
          ? { label: t("automation.manage"), onPress: () => router.push("/automations") }
          : blocking?.code === "WALLET_NOT_SET_UP" || blocking?.code === "WALLET_NOT_READY"
            ? { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
            : undefined;

  return (
    <AgentCard eyebrow={eyebrow}>
      <AutomationSummary automation={automation} compact />
      {pickable && assetToken ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("automation.asset")}: ${assetToken.symbol}`}
          disabled={controller.busy}
          onPress={() => setPicking(true)}
          className="border-border active:bg-muted flex-row items-center gap-2 self-start rounded-full border py-1 pe-3 ps-1"
        >
          <TokenMark token={assetToken} size={24} />
          <Text className="text-foreground text-sm font-semibold">{dca ? t("automation.buys", { asset: assetToken.symbol }) : assetToken.symbol}</Text>
          <Icon as={ChevronDown} className="text-muted-foreground size-4" />
        </Pressable>
      ) : null}
      {blocking ? (
        <View className="gap-2">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, automation.network)}</Text>
          {fix ? (
            <Button variant="secondary" onPress={fix.onPress}>
              <Text>{fix.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : automation.status === "draft" ? (
        <Button size="lg" disabled={controller.busy || !automation.id} onPress={() => void controller.turnOn(prompt)}>
          {automation.rule?.step.type === "notify" ? null : <Icon as={ScanFace} className="text-primary-foreground size-5" />}
          <Text>{controller.busy ? t("automation.turningOn") : automation.rule?.step.type === "notify" ? t("automation.turnOnTap") : turnOnLabel}</Text>
        </Button>
      ) : revokePending ? (
        <Button size="lg" variant="secondary" disabled={controller.busy} onPress={() => void controller.cancel(t("automation.revokePrompt"))}>
          <Icon as={ScanFace} className="text-foreground size-5" />
          <Text>{t("automation.revokeNow")}</Text>
        </Button>
      ) : (
        <View className="gap-2">
          {automation.status === "active" ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.onBody")}</Text> : null}
          <Button variant="secondary" onPress={() => router.push("/automations")}>
            <Text>{t("automation.manage")}</Text>
          </Button>
        </View>
      )}
      {/* 8c: practise first, go live from practice, and what the next runs would do. */}
      {!blocking || blocking.code === "WALLET_NOT_SET_UP" ? <PracticeActions controller={{ ...controller, automation }} goLivePrompt={prompt} /> : null}
      {pickable && assetToken ? (
        <AssetPickerSheet
          open={picking}
          onClose={() => setPicking(false)}
          title={t("automation.asset")}
          mode={dca ? "any" : "held"}
          selected={assetToken.address.toLowerCase()}
          onSelect={({ token }) => {
            setPicking(false);
            if (dca) void controller.edit({ to: token.address }, prompt);
            else if (token.symbol === "USDC" || token.symbol === "EURC") void controller.edit({ asset: token.symbol }, prompt);
          }}
          unavailable={(token) => {
            if (token.status === "impersonator") return t("tokenPage.n_blocked");
            if (dca) return token.kind === "permissioned" ? t("tokenPage.n_permissioned") : undefined;
            const stable = token.address.toLowerCase() === stableToken(automation.network, "USDC").address.toLowerCase() || token.address.toLowerCase() === stableToken(automation.network, "EURC").address.toLowerCase();
            return stable ? undefined : t("automation.stableOnly");
          }}
        />
      ) : null}
      {a ? (
        <AddContactSheet open={adding} onClose={() => setAdding(false)} initialName={nameFromWords(a.recipientWords)} onSaved={() => {
          setAdding(false);
          void controller.recheck();
        }} />
      ) : null}
    </AgentCard>
  );
}
