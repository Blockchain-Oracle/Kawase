// What stops a send, in one sentence, with its fix next to it (D13 "resolve and resume"; T1–T3: the same words and
// the same fix in the app, the chat and later voice). A fix never sends anything: it makes a new version of the
// same send (a saved contact, a chosen currency, a new network), and the person still taps Send. A policy refusal
// offers only what the rules allow: change the amount, open the rule, or cancel — never "split it" (ARCHITECTURE §3).
import { useRouter } from "expo-router";
import { CircleAlert, ShieldAlert, UserPlus } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { SendIntent } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { MainnetConsentSheet } from "@/components/network-pill";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { nameFromWords, usePolicyText } from "./copy";
import type { SendController } from "./use-send";

const ASSET_MARK = 24;

export function SendBlocker({ controller, onEditAmount }: { controller: SendController; onEditAmount?: (() => void) | undefined }) {
  const { t } = useT();
  const router = useRouter();
  const { status } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const policyText = usePolicyText();
  const { switchNetwork, network, busy: switching, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const [adding, setAdding] = React.useState(false);
  const intent = controller.intent as SendIntent;
  const blocking = intent.blocking;

  // Sign-in happens elsewhere; once it does, the same send is checked again.
  const signedInNow = status === "account";
  const wasBlockedBySignIn = blocking?.code === "SIGN_IN_REQUIRED";
  React.useEffect(() => {
    if (signedInNow && wasBlockedBySignIn) void controller.revise({});
  }, [signedInNow, wasBlockedBySignIn]);

  // After a network switch the request starts over on the new network (mainnet sends are always re-confirmed). The
  // original request is kept until the new send exists, so a failed attempt can be retried (review R17.5).
  const [switchedTo, setSwitchedTo] = React.useState<SendIntent["network"]>();
  const [carryFailed, setCarryFailed] = React.useState(false);
  const carryOver = React.useCallback(async () => {
    setCarryFailed(false);
    try {
      const { intent: fresh } = await api.sends.create(intent.request);
      setSwitchedTo(undefined);
      controller.set(fresh);
    } catch {
      setCarryFailed(true);
    }
  }, [controller, intent.request]);
  React.useEffect(() => {
    if (switchedTo && network === switchedTo) void carryOver();
  }, [network, switchedTo]);

  if (!blocking) return null;
  const ids = arcIdentity(intent.network);
  const text = policyText(blocking, intent.network);
  const other = intent.network === "testnet" ? "mainnet" : "testnet";
  const recheck = () => void controller.revise({});

  let fix: React.ReactNode;
  switch (blocking.code) {
    case "SIGN_IN_REQUIRED":
      fix = (
        <Button onPress={() => signIn.open()}>
          <Text>{t("policy.fixSignIn")}</Text>
        </Button>
      );
      break;
    case "RECIPIENT_UNKNOWN":
      fix = (
        <View className="gap-2">
          <Button onPress={() => setAdding(true)}>
            <Icon as={UserPlus} className="text-primary-foreground size-4" />
            <Text>{t("policy.fixAddContact", { name: nameFromWords(blocking.params?.query ?? "") })}</Text>
          </Button>
          {intent.suggestions.map((match) =>
            match.kind === "handle" ? (
              <Button key={match.handle} variant="secondary" onPress={() => void controller.revise({ recipient: `@${match.handle}` })}>
                <Text>{t("send.didYouMean", { handle: match.handle })}</Text>
              </Button>
            ) : null,
          )}
        </View>
      );
      break;
    case "ASSET_UNCLEAR":
      fix = (
        <View className="flex-row gap-2">
          {(["USDC", "EURC"] as const).map((asset) => (
            <Pressable
              key={asset}
              accessibilityRole="button"
              disabled={controller.busy}
              onPress={() => void controller.revise({ asset })}
              className="bg-muted active:bg-secondary flex-1 flex-row items-center justify-center gap-2 rounded-full py-3"
            >
              <Mark entity={asset === "USDC" ? ids.usdc : ids.eurc} size={ASSET_MARK} />
              <Text className="text-foreground text-base font-semibold">{asset}</Text>
            </Pressable>
          ))}
        </View>
      );
      break;
    case "INSUFFICIENT_BALANCE":
    case "INSUFFICIENT_GAS":
      fix = (
        <View className="flex-row gap-2">
          <Button className="flex-1" onPress={() => fund.open()}>
            <Text>{t("policy.fixAddMoney")}</Text>
          </Button>
          <Button variant="secondary" className="flex-1" disabled={controller.busy} onPress={recheck}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      );
      break;
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      fix = (
        <Button onPress={() => router.push("/wallet")}>
          <Text>{t("policy.fixSetUp")}</Text>
        </Button>
      );
      break;
    case "ON_OTHER_NETWORK":
      fix = carryFailed ? (
        <Button variant="secondary" onPress={() => void carryOver()}>
          <Text>{t("common.retry")}</Text>
        </Button>
      ) : (
        <Button
          disabled={switching}
          onPress={() => {
            setSwitchedTo(other);
            void switchNetwork(other);
          }}
        >
          <Text>{t("policy.fixSwitch", { network: other === "testnet" ? t("network.arcTestnet") : t("network.arc") })}</Text>
        </Button>
      );
      break;
    case "OVER_PER_TX_LIMIT":
    case "OVER_DAILY_LIMIT":
    case "OVER_WEEKLY_LIMIT":
    case "AMOUNT_INVALID":
    case "AMOUNT_MISSING":
      fix = onEditAmount ? (
        <Button variant="secondary" onPress={onEditAmount}>
          <Text>{t("policy.fixEditAmount")}</Text>
        </Button>
      ) : null;
      break;
    case "ADDRESS_CHANGE_HOLD":
      fix = intent.draft?.recipient.contactId ? (
        <Button variant="secondary" onPress={() => router.push(`/contacts/${intent.draft!.recipient.contactId}`)}>
          <Text>{t("policy.fixOpenContact")}</Text>
        </Button>
      ) : null;
      break;
    default:
      fix = null;
  }

  return (
    <View className="gap-3">
      <View accessibilityRole="alert" className="bg-muted flex-row items-start gap-3 rounded-2xl px-4 py-3">
        <Icon as={blocking.kind === "policy" ? ShieldAlert : CircleAlert} className="text-foreground mt-0.5 size-5" />
        <Text className={cn("text-foreground flex-1 text-base leading-6", TEXT_START)}>{text}</Text>
      </View>
      {fix}
      <AddContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        initialName={blocking.params?.query ? nameFromWords(blocking.params.query) : undefined}
        onSaved={() => {
          setAdding(false);
          recheck();
        }}
      />
      <MainnetConsentSheet open={consentNeeded} busy={switching} onAccept={() => void acceptMainnet()} onClose={dismissConsent} />
    </View>
  );
}
