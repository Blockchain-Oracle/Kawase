// `/i/<id>` (plan §A.4.11): the exact card of one money action, opened from a push, the inbox or an email — the same
// card as in chat, live (a draft still waiting can be fixed and approved here; a finished one shows what happened),
// under the network it happened on. When that is not the network the person is on, it says so and offers the
// switch; the card's own actions apply once they match. A guest who opens an account's link signs in in place and
// the card loads (signed-out links come back here after onboarding). A margin order opens its position; an automation
// shows its live card and a Buy order its own; a run, an invoice, a split or a request opens its page (A5-3).
import { useRouter } from "expo-router";
import { CloudOff, Waypoints } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

import {
  ApiError,
  type IntentLookup,
  type ProposeAutomationOutput,
  type ProposeBridgeOutput,
  type ProposeEarnOutput,
  type ProposeSendOutput,
  type ProposeSwapOutput,
} from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page } from "@/account/page";
import { AutomationCard } from "@/chat/automation-card";
import { BridgeCard } from "@/chat/bridge-card";
import { EarnCard } from "@/chat/earn-card";
import { SendCard } from "@/chat/send-card";
import { SwapCard } from "@/chat/swap-card";
import { useT } from "@/i18n";
import { OnrampOrderCard } from "@/onramp/order-card";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

type Load = { status: "loading" } | { status: "ready"; found: IntentLookup } | { status: "not_found" } | { status: "failed" };

export function IntentScreen({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { switchNetwork, busy } = useNetworkSwitch();
  const [load, setLoad] = React.useState<Load>({ status: "loading" });

  const read = React.useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const found = await api.intents.get(id);
      // A margin order lives on its position page; a run, an invoice, a split and a request on their own pages.
      if (found.kind === "margin") {
        router.replace(found.positionId ? { pathname: "/position/[id]", params: { id: found.positionId } } : "/margin");
        return;
      }
      if (found.kind === "automation_run") return void router.replace({ pathname: "/why/run/[id]", params: { id: found.runId } });
      if (found.kind === "invoice") return void router.replace({ pathname: "/business/invoice/[id]", params: { id: found.invoiceId } });
      if (found.kind === "split") return void router.replace({ pathname: "/split/[id]", params: { id: found.splitId } });
      if (found.kind === "request") return void router.replace({ pathname: "/request", params: { id: found.requestId } });
      setLoad({ status: "ready", found });
    } catch (error) {
      setLoad({ status: error instanceof ApiError && error.code === "not_found" ? "not_found" : "failed" });
    }
  }, [id, router]);

  // Read again when the session changes: a guest who signs in here sees their card.
  React.useEffect(() => {
    void read();
  }, [read, status]);

  const titles: Partial<Record<IntentLookup["kind"], string>> = {
    send: t("send.title"),
    swap: t("swap.title"),
    bridge: t("bridge.title"),
    earn: t("earn.title"),
    automation: t("automation.title"),
    onramp: t("buy.title"),
  };
  const title = (load.status === "ready" ? titles[load.found.kind] : undefined) ?? t("resume.title");
  const active = user?.activeNetwork ?? "testnet";

  return (
    <Page title={title}>
      {load.status === "loading" ? (
        <ActivityIndicator />
      ) : load.status === "not_found" ? (
        <View className="gap-3">
          <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{status === "account" ? t("resume.notFound") : t("resume.signInToOpen")}</Text>
          {status !== "account" ? (
            <Button onPress={() => signIn.open()}>
              <Text>{t("signIn.title")}</Text>
            </Button>
          ) : null}
        </View>
      ) : load.status === "failed" ? (
        <View className="items-center gap-3">
          <Icon as={CloudOff} className="text-muted-foreground size-8" />
          <Text className="text-muted-foreground text-center">{t("resume.failed")}</Text>
          <Button variant="secondary" onPress={() => void read()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : (
        <View className="gap-4">
          {load.found.network !== active ? (
            <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
              <Icon as={Waypoints} className="text-network size-5" />
              <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>
                {t("resume.otherNetwork", { network: load.found.network === "testnet" ? t("network.arcTestnet") : t("network.arc") })}
              </Text>
              <Button size="sm" variant="secondary" disabled={busy} onPress={() => void switchNetwork(load.found.network)}>
                <Text>{t("resume.switch")}</Text>
              </Button>
            </View>
          ) : null}
          {load.found.kind === "send" ? (
            <SendCard output={{ intent: load.found.intent } as ProposeSendOutput} />
          ) : load.found.kind === "swap" ? (
            <SwapCard output={{ intent: load.found.intent } as ProposeSwapOutput} />
          ) : load.found.kind === "bridge" ? (
            <BridgeCard output={{ intent: load.found.intent } as ProposeBridgeOutput} />
          ) : load.found.kind === "earn" ? (
            <EarnCard output={{ intent: load.found.intent } as ProposeEarnOutput} />
          ) : load.found.kind === "automation" ? (
            <AutomationCard output={{ automation: load.found.automation } as ProposeAutomationOutput} />
          ) : load.found.kind === "onramp" ? (
            <OnrampOrderCard order={load.found.order} />
          ) : null}
          {load.found.threadId ? (
            <Button variant="ghost" onPress={() => router.navigate({ pathname: "/chat", params: { thread: load.found.threadId! } })}>
              <Text className="text-muted-foreground">{t("resume.openConversation")}</Text>
            </Button>
          ) : null}
        </View>
      )}
    </Page>
  );
}
