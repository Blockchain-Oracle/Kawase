// The marketplace in the conversation (cards/marketplace.md "How it comes into play"): the services the agent found
// (seller mark, what it returns, price), the receipt when it paid ("Paid $0.009 to Exa"), the consent card above the
// per-call cap, the "Top up your agent wallet" card when it is short (R12: after the tap the same request carries on),
// refusals that name the rule, and the agent wallet itself. A seller's answer shown here is labelled as the seller's.
import { useRouter } from "expo-router";
import { Bot, ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type {
  AgentTopUpProposal,
  AgentWalletLine,
  BuyOutcome,
  InspectServiceResult,
  ServiceListing,
  ServiceSearchResult,
} from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { SellerMark, TopUpPresets } from "@/marketplace/parts";
import { useAgentWallet, usePrice } from "@/marketplace/use-agent-wallet";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { AgentCard } from "./card";

type Network = "mainnet" | "testnet";
const PREVIEW_CHARS = 280;

function useEyebrow() {
  const { t } = useT();
  return (label: string, network: Network) => `${label} · ${network === "testnet" ? t("network.arcTestnet") : t("network.arc")}`;
}

function ServiceLine({ service }: { service: ServiceListing }) {
  const { t } = useT();
  const price = usePrice();
  return (
    <View className="flex-row items-center gap-3">
      <SellerMark name={service.provider.name} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
          {service.description || service.provider.name}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {`${service.provider.name} · ${t(`agentWallet.category.${service.provider.category}`)}`}
        </Text>
      </View>
      <Amount className="text-foreground text-sm font-semibold">{price(service.price)}</Amount>
    </View>
  );
}

export function ServicesCard({ output }: { output: ServiceSearchResult }) {
  const { t } = useT();
  const eyebrow = useEyebrow();
  return (
    <AgentCard eyebrow={eyebrow(t("market.servicesEyebrow"), output.network)}>
      {output.services.length === 0 ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("market.servicesEmpty")}</Text>
      ) : (
        output.services.map((service) => <ServiceLine key={`${service.method} ${service.url}`} service={service} />)
      )}
    </AgentCard>
  );
}

export function ServiceCard({ output }: { output: { result: InspectServiceResult } }) {
  const { t } = useT();
  const price = usePrice();
  const eyebrow = useEyebrow();
  const result = output.result;
  if (result.status !== "listed") {
    return (
      <AgentCard eyebrow={t("market.serviceEyebrow")}>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t(`market.refused.${result.status === "not_listed" ? "not_listed" : "unavailable"}`)}</Text>
      </AgentCard>
    );
  }
  return (
    <AgentCard eyebrow={eyebrow(t("market.serviceEyebrow"), result.network)}>
      <ServiceLine service={result.service} />
      {result.livePrice ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {`${t("market.livePrice", { amount: price(result.livePrice) })} · ${result.withinPerCallCap === false ? t("market.overCap") : t("market.withinCap")}`}
        </Text>
      ) : null}
    </AgentCard>
  );
}

/** The top-up panel: presets and one tap; on success the conversation carries on (R12). */
function TopUpPanel({ presets, suggested, onDone }: { presets: string[]; suggested: string; onDone: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const wallet = useAgentWallet({ load: false });
  const [value, setValue] = React.useState(suggested);
  const [done, setDone] = React.useState(false);
  const options = presets.includes(suggested) ? presets : [...presets, suggested].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  if (done) {
    return <Text className={cn("text-success text-sm font-semibold", TEXT_START)}>{t("agentWallet.toppedUp", { amount: wallet.price(value) })}</Text>;
  }
  return (
    <View className="gap-3">
      <TopUpPresets presets={options} value={value} onChange={setValue} disabled={Boolean(wallet.busy)} />
      <Button
        disabled={Boolean(wallet.busy)}
        onPress={() =>
          void wallet.topUp(value).then((ok) => {
            if (!ok) return;
            setDone(true);
            onDone();
          })
        }
      >
        <Text>{wallet.busy ? t("common.loading") : `${t("agentWallet.topUp")} ${wallet.price(value)}`}</Text>
      </Button>
      <Button variant="ghost" size="sm" onPress={() => router.push("/agent-wallet")}>
        <Text className="text-muted-foreground">{t("market.openWallet")}</Text>
      </Button>
    </View>
  );
}

function SignInNeeded() {
  const { t } = useT();
  const signIn = useSignIn();
  return (
    <AgentCard eyebrow={t("agentWallet.title")}>
      <Text className={cn("text-foreground text-base", TEXT_START)}>{t("market.signInBody")}</Text>
      <Button onPress={signIn.open}>
        <Text>{t("signIn.title")}</Text>
      </Button>
    </AgentCard>
  );
}

function Consent({ outcome, onSend }: { outcome: Extract<BuyOutcome, { status: "needs_consent" }>; onSend: ((text: string) => void) | undefined }) {
  const { t } = useT();
  const price = usePrice();
  const eyebrow = useEyebrow();
  const [state, setState] = React.useState<"open" | "busy" | "approved" | "declined">("open");
  const decide = async (decision: "approve" | "decline") => {
    setState("busy");
    try {
      await api.marketplace.decide(outcome.purchase.id, decision);
      setState(decision === "approve" ? "approved" : "declined");
      if (decision === "approve") onSend?.(t("market.approvedResume"));
    } catch {
      setState("open");
      toast(t("common.error"));
    }
  };
  const amount = price(outcome.purchase.amount);
  return (
    <AgentCard eyebrow={eyebrow(t("market.consentEyebrow"), outcome.network)}>
      <View className="flex-row items-center gap-3">
        <SellerMark name={outcome.purchase.provider} />
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{t("market.consentTitle", { amount, seller: outcome.purchase.provider })}</Text>
      </View>
      {outcome.purchase.description ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{outcome.purchase.description}</Text> : null}
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {outcome.why === "over_per_call" ? t("market.consentOverCap", { cap: price(outcome.caps.perCallCap) }) : outcome.why === "ask_first" ? t("market.consentAskFirst") : t("market.consentAfterData")}
      </Text>
      {state === "approved" ? (
        <Text className={cn("text-success text-sm font-semibold", TEXT_START)}>{t("market.approved")}</Text>
      ) : state === "declined" ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("market.declinedNote")}</Text>
      ) : (
        <View className="flex-row gap-2">
          <Button className="flex-1" disabled={state === "busy"} onPress={() => void decide("approve")}>
            <Text>{t("market.pay", { amount })}</Text>
          </Button>
          <Button className="flex-1" variant="secondary" disabled={state === "busy"} onPress={() => void decide("decline")}>
            <Text>{t("market.decline")}</Text>
          </Button>
        </View>
      )}
    </AgentCard>
  );
}

/** What buy_service did: a receipt, a consent card, the top-up card, or the rule that stopped it. */
export function BuyCard({ output, onSend }: { output: { outcome: BuyOutcome }; onSend?: ((text: string) => void) | undefined }) {
  const { t } = useT();
  const router = useRouter();
  const price = usePrice();
  const eyebrow = useEyebrow();
  const outcome = output.outcome;
  switch (outcome.status) {
    case "needs_sign_in":
      return <SignInNeeded />;
    case "needs_wallet":
      return (
        <AgentCard eyebrow={t("agentWallet.title")}>
          <Text className={cn("text-foreground text-base", TEXT_START)}>{t("receive.setUpFirst")}</Text>
          <Button onPress={() => router.push("/wallet")}>
            <Text>{t("wallet.setUp")}</Text>
          </Button>
        </AgentCard>
      );
    case "needs_consent":
      return <Consent outcome={outcome} onSend={onSend} />;
    case "needs_top_up": {
      const have = (BigInt(outcome.wallet.onHand) + BigInt(outcome.wallet.inGateway)).toString();
      return (
        <AgentCard eyebrow={eyebrow(t("agentWallet.topUpTitle"), outcome.network)}>
          <ServiceLine service={outcome.service} />
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("market.needsTopUp", { have: price(have), price: price(outcome.price) })}</Text>
          <TopUpPanel presets={outcome.presets} suggested={outcome.suggested} onDone={() => onSend?.(t("market.topUpResume"))} />
        </AgentCard>
      );
    }
    case "refused":
      return (
        <AgentCard eyebrow={eyebrow(t("market.serviceEyebrow"), outcome.network)}>
          {outcome.service ? <ServiceLine service={outcome.service} /> : null}
          <View className="flex-row items-start gap-3">
            <Icon as={ShieldAlert} className="text-muted-foreground mt-0.5 size-5" />
            <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>
              {t(`market.refused.${outcome.reason}`, outcome.caps ? { budget: price(outcome.caps.dailyBudget), spent: price(outcome.caps.spentToday) } : {})}
            </Text>
          </View>
          {outcome.reason === "over_budget" || outcome.reason === "blocked_seller" || outcome.reason === "category_off" ? (
            <Button variant="secondary" onPress={() => router.push("/agent-wallet")}>
              <Text>{t("market.openWallet")}</Text>
            </Button>
          ) : null}
        </AgentCard>
      );
    case "failed":
      return (
        <AgentCard eyebrow={eyebrow(t("market.serviceEyebrow"), outcome.network)}>
          {outcome.service ? <ServiceLine service={outcome.service} /> : null}
          <Text className={cn("text-destructive text-sm", TEXT_START)}>
            {t(`market.failed.${outcome.reason}`, { amount: outcome.purchase ? price(outcome.purchase.amount) : "" })}
          </Text>
        </AgentCard>
      );
    case "free":
    case "paid": {
      const seller = outcome.status === "paid" ? outcome.purchase.provider : outcome.service.provider.name;
      const preview = outcome.content.slice(0, PREVIEW_CHARS);
      return (
        <AgentCard eyebrow={eyebrow(t("market.receiptEyebrow"), outcome.network)}>
          <View className="flex-row items-center gap-3">
            <SellerMark name={seller} />
            <View className="min-w-0 flex-1">
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>
                {outcome.status === "paid" ? t("market.paid", { amount: price(outcome.purchase.amount), seller }) : t("market.free", { seller })}
              </Text>
              {outcome.status === "paid" && outcome.purchase.description ? (
                <Text numberOfLines={2} className={cn("text-muted-foreground text-xs", TEXT_START)}>
                  {outcome.purchase.description}
                </Text>
              ) : null}
            </View>
          </View>
          {preview ? (
            <View className="bg-muted gap-1 rounded-2xl p-3">
              <Text className={cn("text-muted-foreground text-xs font-semibold", TEXT_START)}>{t("market.untrustedLabel")}</Text>
              <Amount numberOfLines={4} className="text-muted-foreground text-xs">
                {preview}
              </Amount>
            </View>
          ) : null}
          {outcome.status === "paid" && outcome.purchase.rail ? (
            <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t(`agentWallet.rail.${outcome.purchase.rail}`)}</Text>
          ) : null}
        </AgentCard>
      );
    }
    default:
      return null;
  }
}

export function AgentWalletCard({ output }: { output: { wallet: AgentWalletLine } }) {
  const { t } = useT();
  const router = useRouter();
  const price = usePrice();
  const eyebrow = useEyebrow();
  const line = output.wallet;
  if (line.status === "needs_sign_in") return <SignInNeeded />;
  if (line.status !== "ready") {
    return (
      <AgentCard eyebrow={t("agentWallet.title")}>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("market.refused.unavailable")}</Text>
      </AgentCard>
    );
  }
  return (
    <AgentCard eyebrow={eyebrow(t("agentWallet.title"), line.network)}>
      <View className="flex-row items-center gap-3">
        <Icon as={Bot} className="text-muted-foreground size-6" />
        <Amount className="text-foreground flex-1 text-2xl font-semibold">{price(line.balances.total)}</Amount>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {`${t("agentWallet.dailyBudget")}: ${price(line.settings.dailyBudget)} · ${t("agentWallet.perCallCap")}: ${price(line.settings.perCallCap)}`}
      </Text>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("agentWallet.spentToday", { amount: price(line.spentToday) })}</Text>
      <Button variant="secondary" onPress={() => router.push("/agent-wallet")}>
        <Text>{t("market.openWallet")}</Text>
      </Button>
    </AgentCard>
  );
}

export function TopUpCard({ output, onSend }: { output: { proposal: AgentTopUpProposal }; onSend?: ((text: string) => void) | undefined }) {
  const { t } = useT();
  const price = usePrice();
  const eyebrow = useEyebrow();
  const { user } = useSession();
  const proposal = output.proposal;
  if (proposal.status === "needs_sign_in") return <SignInNeeded />;
  if (proposal.status !== "proposed") {
    return (
      <AgentCard eyebrow={t("agentWallet.topUpTitle")}>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{proposal.status === "needs_wallet" ? t("receive.setUpFirst") : t("market.refused.unavailable")}</Text>
      </AgentCard>
    );
  }
  const active = user?.activeNetwork === proposal.network;
  return (
    <AgentCard eyebrow={eyebrow(t("agentWallet.topUpTitle"), proposal.network)}>
      <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
        {proposal.grantPerDay ? t("agentWallet.topUpBody", { perDay: price(proposal.grantPerDay) }) : t("agentWallet.topUpFirstBody")}
      </Text>
      <Text className={cn("text-foreground text-sm", TEXT_START)}>{`${t("agentWallet.balance")}: ${price(proposal.wallet.total)}`}</Text>
      {active ? <TopUpPanel presets={proposal.presets} suggested={proposal.suggested} onDone={() => onSend?.(t("market.topUpResume"))} /> : null}
    </AgentCard>
  );
}
