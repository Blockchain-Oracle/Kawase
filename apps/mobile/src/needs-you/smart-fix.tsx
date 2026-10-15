// The smart sheet (resolve and resume, D13): when a run stops on a
// typed blocker, its card shows one button that names the fix ("Add Alex's address", "Add money", "Set a budget",
// "Switch to Arc Testnet", "Sign in"), and the button opens a sheet with exactly that fix — never an error page.
// When the fix is done the SAME run carries on from the step that stopped: `onFixed` re-checks every fact (a new
// version of the same intent), and nothing is sent beyond the budget by itself. A policy refusal (an over-limit, a
// blocked token) is terminal: the sheet cites the rule and offers the rule's screen, never a way around it.
//
// Kinds (SMART-PRECONDITIONS §2): clarification (an unknown name → the add-contact form, prefilled with the name),
// precondition (no balance, not signed in, no wallet, wrong network, no budget) and policy (limits). Out-of-band fixes
// (adding money arrives later) wait with "I've added it · Check again" and also re-check by themselves when the money
// lands or the person comes back.
import { useRouter, type Href } from "expo-router";
import * as React from "react";
import { StyleSheet, View } from "react-native";

import type { PolicyResultView } from "@kawase/api-client";

import { BlockedCta, type Blocker } from "@/components/tx";
import { Button, SPACE, type BlockerFixKind } from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { MainnetConsentSheet } from "@/components/network-pill";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { fixedElsewhere, useResumeWhenFixed } from "@/intents/use-resume";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

/** The Budget lane's screen (D38): one Face ID sets the week's budget. */
export const BUDGET_HREF = "/budget" as Href;

export type SmartFixKind = "add-contact" | "add-money" | "sign-in" | "setup-wallet" | "switch-network" | "set-budget" | "open-rule" | "retry";

/** Which fix a blocking code needs (null: nothing the person can fix here; the card says why). */
export function fixKindOf(code: string): SmartFixKind | null {
  if (code === "RECIPIENT_UNKNOWN" || code === "RECIPIENT_MISSING") return "add-contact";
  if (code === "INSUFFICIENT_BALANCE" || code === "INSUFFICIENT_GAS" || code === "GAS_RELAY_BUDGET_SPENT") return "add-money";
  if (code === "SIGN_IN_REQUIRED" || code === "ACCOUNT_REQUIRED") return "sign-in";
  if (code === "WALLET_NOT_READY" || code === "WALLET_NOT_SET_UP" || code === "NO_WALLET") return "setup-wallet";
  if (code === "WRONG_NETWORK" || code === "NETWORK_MISMATCH" || code === "NOT_ON_NETWORK") return "switch-network";
  if (code === "NO_BUDGET" || code === "BUDGET_REQUIRED") return "set-budget";
  if (code.startsWith("OVER_") || code.startsWith("TOKEN_RULE_") || code === "TOKEN_BLOCKED") return "open-rule";
  if (code === "QUOTE_UNAVAILABLE" || code === "QUOTE_EXPIRED") return "retry";
  return null;
}

/** The kit's fix kinds, for the blocked CTA's own button (the ones the kit names). */
const KIT_FIX: Partial<Record<SmartFixKind, BlockerFixKind>> = {
  "add-money": "add-money",
  "sign-in": "sign-in",
  "setup-wallet": "setup-wallet",
  "switch-network": "switch-network",
  "set-budget": "set-budget",
  "open-rule": "raise-limit",
  retry: "retry",
};

type SmartFixProps = {
  blocking: PolicyResultView;
  /** The blocker in words (the card's policy text). */
  reason: string;
  /** The name the person used, for an unknown contact ("Alex"). */
  name?: string | null | undefined;
  /** The network the run is on (a switch goes there). */
  network: "mainnet" | "testnet";
  /** Re-check the same run with fresh facts (a new version of the same intent). Never sends by itself. */
  onFixed: () => void;
};

/**
 * The blocked step: the reason, and one button naming the fix that opens the smart sheet. Re-checks by itself when the
 * fix happens elsewhere (signed in, back from wallet setup or limits, money landed).
 */
export function SmartFix({ blocking, reason, name, network, onFixed }: SmartFixProps) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const fund = useFund();
  const { status } = useSession();
  const networkSwitch = useNetworkSwitch();
  const kind = fixKindOf(blocking.code);
  const [open, setOpen] = React.useState<SmartFixKind | null>(null);
  const [waiting, setWaiting] = React.useState(false);
  const latest = React.useRef(onFixed);
  latest.current = onFixed;

  // Fixed on another screen, or signed in: the same run is checked again.
  useResumeWhenFixed(blocking.code, () => latest.current());
  // Money landed (the fund hub sent test money, or the person came back after adding it): check again.
  const fundedAt = fund.fundedAt;
  const seenFunding = React.useRef(fundedAt);
  React.useEffect(() => {
    if (fundedAt === seenFunding.current) return;
    seenFunding.current = fundedAt;
    if (kind === "add-money") latest.current();
  }, [fundedAt, kind]);
  // The network the run is on became the active one: check again.
  const active = networkSwitch.network;
  const wasActive = React.useRef(active);
  React.useEffect(() => {
    if (active === wasActive.current) return;
    wasActive.current = active;
    if (kind === "switch-network" && active === network) latest.current();
  }, [active, kind, network]);

  const label = (() => {
    switch (kind) {
      case "add-contact":
        return name ? t("feed.fix.addContactNamed", { name }) : t("feed.fix.addContact");
      case "add-money":
        return t("feed.fix.addMoney");
      case "sign-in":
        return t("feed.fix.signIn");
      case "setup-wallet":
        return t("feed.fix.setUp");
      case "switch-network":
        return t("feed.fix.switchTo", { network: network === "testnet" ? t("network.arcTestnet") : t("network.arc") });
      case "set-budget":
        return t("feed.fix.setBudget");
      case "open-rule":
        return t("feed.fix.openRule");
      case "retry":
        return t("feed.fix.retry");
      default:
        return null;
    }
  })();

  // The plate wears our own label for every fix (the kit has no "add a contact" kind; the label names it).
  const blocker: Blocker = { label: reason, reason, ...(kind ? { fix: { kind: KIT_FIX[kind] ?? "retry" } } : {}) };
  const start = () => {
    if (!kind) return;
    // A retry needs no sheet: the same run is quoted again at once.
    if (kind === "retry") return onFixed();
    if (kind === "sign-in" && status !== "account") return signIn.open();
    setOpen(kind);
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <BlockedCta blocker={blocker} onFix={() => start()} fixLabel={label} />
      ) : (
        <BlockedCta blocker={blocker} />
      )}

      {open === "add-contact" ? (
        <AddContactSheet
          open
          initialName={name ?? undefined}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            onFixed();
          }}
        />
      ) : null}

      {open && open !== "add-contact" ? (
        <Sheet onClose={() => setOpen(null)} closeLabel={t("shell.kit.closeNamed", { name: label ?? "" })}>
          <SheetHeading title={t(`feed.fix.title_${open.replaceAll("-", "_")}`)} body={reason} />
          <View style={styles.actions}>
            {open === "add-money" ? (
              <>
                <Button
                  label={t("feed.fix.addMoney")}
                  onPress={() => {
                    setWaiting(true);
                    fund.open();
                  }}
                />
                {waiting ? (
                  <Button
                    label={t("feed.fix.checkAgain")}
                    variant="secondary"
                    onPress={() => {
                      setOpen(null);
                      onFixed();
                    }}
                  />
                ) : null}
              </>
            ) : open === "setup-wallet" ? (
              <Button
                label={t("feed.fix.setUp")}
                onPress={() => {
                  setOpen(null);
                  router.push("/wallet");
                }}
              />
            ) : open === "switch-network" ? (
              <Button
                label={label ?? ""}
                loading={networkSwitch.busy}
                onPress={() => {
                  void networkSwitch.switchNetwork(network).then(() => setOpen(null));
                }}
              />
            ) : open === "set-budget" ? (
              <Button
                label={t("feed.fix.setBudget")}
                onPress={() => {
                  setOpen(null);
                  router.push(BUDGET_HREF);
                }}
              />
            ) : open === "open-rule" ? (
              <Button
                label={t("feed.fix.openRule")}
                variant="secondary"
                onPress={() => {
                  setOpen(null);
                  router.push((blocking.code.startsWith("TOKEN_") ? "/token-rules" : "/limits") as Href);
                }}
              />
            ) : open === "sign-in" ? (
              <Button
                label={t("feed.fix.signIn")}
                onPress={() => {
                  setOpen(null);
                  signIn.open();
                }}
              />
            ) : null}
          </View>
        </Sheet>
      ) : null}
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
  );
}

/** Whether a blocker is fixed somewhere the person comes back from (so the run re-checks on focus). */
export const fixedOnReturn = fixedElsewhere;

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  actions: { gap: SPACE.sm, paddingTop: SPACE.md },
});
