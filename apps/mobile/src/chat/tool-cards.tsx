// Generative UI (L1–L12, the card base): each agent tool's result rendered as a card in the conversation, from the
// same real data the tool returned, under the network that data was read on (never the one the person is on now:
// a card reopened after a switch keeps its own network, and its actions only show while that is the active one) — balances with real marks, history rows, what each network can do, the faucet's
// result, the receive address, the authority receipt — and the network-switch card, which runs on the device: the
// person taps, the app switches (with the real-money sheet for mainnet), and the agent continues with the answer.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  AudioLines,
  Brain,
  CalendarClock,
  CandlestickChart,
  Copy,
  CreditCard,
  Droplets,
  ExternalLink,
  HandCoins,
  Link2,
  QrCode,
  Route,
  Sparkles,
  Sprout,
  Store,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { toast } from "sonner-native";

import type {
  ActivityItem,
  ActivityLine,
  AuthoritySummary,
  CapabilityLine,
  ContactLine,
  FaucetResult,
  Money,
  OnNetwork,
  ProposeSendOutput,
  EarnOverviewLine,
  ProposeAutomationOutput,
  ListAutomationsOutput,
  ProposeBridgeOutput,
  ProposeEarnOutput,
  ProposeSwapOutput,
  WalletSummary,
  MarginMarketsOutput,
  MarginPositionsOutput,
  ProposeMarginOutput,
  BuyProposalOutput,
  ProposeCrossChainOutput,
  CompareYieldOutput,
  ProtectPositionOutput,
  ProposeLendOutput,
  WithdrawProposalOutput,
} from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { AuthorityReceipt } from "@kawase/ui-native/components/authority-receipt";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { CounterpartyAvatar, shortAddress, useCounterpartyName, useSignedAmount } from "@/activity/activity-row";
import { MainnetConsentSheet } from "@/components/network-pill";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { AgentCard, AgentCardLoading } from "./card";
import { RequestCard } from "./request-card";
import { ContactsCard, SendCard } from "./send-card";
import { AutomationCard } from "./automation-card";
import { BridgeCard } from "./bridge-card";
import { EarnCard, EarnOverviewCard } from "./earn-card";
import { SwapCard } from "./swap-card";
import { MarginMarketsCard, MarginOrderCard, MarginPositionsCard, ProtectCard } from "./margin-card";
import { OnrampBuyCard } from "./buy-card";
import { MoveCard } from "./move-card";
import { LendOrderCard, YieldOptionsCard } from "./lend-card";
import { WithdrawCard } from "./withdraw-card";
import { AgentWalletCard, BuyCard, ServiceCard, ServicesCard, TopUpCard } from "./marketplace-card";
import { InvoiceCard } from "./invoice-card";
import { BUSINESS_LOADING_LABELS, BusinessToolCard } from "./business-cards";
import { ReportCard } from "@/history/report-card";
import type { AutomationEditResponse, AutomationView, ReportView, SimulationView } from "@kawase/api-client";
import { useChatResume } from "./resume";
import { SafetyCard } from "./safety-card";
import type { AgentTopUpProposal, AgentWalletLine, BuyOutcome, InspectServiceResult, ServiceSearchResult } from "@kawase/api-client";
import type { SafetyToolOutput } from "@kawase/api-client";
import type { ChartOutput, DecisionView, HistorySearchOutput, MemoryToolOutput, SettingDiff, StatusView, SuggestionsView } from "@kawase/api-client";
import { MemoryCard } from "./memory-card";
import { ChartCard, DecisionCard, ForYouChatCard, HistorySearchCard, KnowledgeCard, SettingDiffCard, StatusCard } from "./insight-cards";
import type { PayCodeView } from "@kawase/api-client";
import { PayCodeCard, SplitBillCard } from "./pay-code-card";

type Network = "mainnet" | "testnet";
const ROW_MARK = 32;
const KOBAN_WIDTH = 64;
const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1_000;
/** A faucet result this fresh came from this conversation just now (not an old thread being reopened). */
const FRESH_CLAIM_MS = 120_000;
const CLAIM_WINDOW_MS = SECONDS_PER_DAY * MS_PER_SECOND;

/** A tool part as the AI SDK puts it in a message. */
export type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

/** "5,000.00 USDC" → "5,000 USDC": limits read as whole amounts. */
const wholeAmount = (display: string) => display.replace(/\.00(?= )/, "");

function useNetworkName() {
  const { t } = useT();
  return (network: Network) => (network === "testnet" ? t("network.arcTestnet") : t("network.arc"));
}

/** The network a stored activity line was read on, from its explorer link, for lines saved before cards recorded it. */
const networkOfExplorerUrl = (url: string): Network => (url.includes("testnet") ? "testnet" : "mainnet");

function MoneyRow({ money, network }: { money: Money; network: Network | undefined }) {
  // Without a recorded network the token's own mark is shown, with no chain badge to claim one.
  const ids = arcIdentity(network ?? "mainnet");
  return (
    <View className="flex-row items-center gap-3">
      <Mark entity={money.asset === "USDC" ? ids.usdc : ids.eurc} {...(network ? { chainBadge: ids.chain } : {})} size={ROW_MARK} />
      <Text className="text-foreground flex-1 text-base font-semibold">{money.asset}</Text>
      <Amount className="text-foreground text-base">{money.display.replace(` ${money.asset}`, "")}</Amount>
    </View>
  );
}

function WalletCard({ output, active }: { output: WalletSummary & OnNetwork; active: Network }) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const fund = useFund();
  const name = useNetworkName();
  const network = output.network;
  if (output.status === "guest") {
    return (
      <AgentCard eyebrow={t("chat.cardWallet")}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("receive.noWallet")}</Text>
        <Button onPress={signIn.open}>
          <Text>{t("signIn.title")}</Text>
        </Button>
      </AgentCard>
    );
  }
  if (output.status === "no_wallet") {
    return (
      <AgentCard eyebrow={t("chat.cardWallet")}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("receive.setUpFirst")}</Text>
        <Button onPress={() => router.push("/wallet")}>
          <Text>{t("wallet.setUp")}</Text>
        </Button>
      </AgentCard>
    );
  }
  return (
    <AgentCard eyebrow={network ? `${t("chat.cardWallet")} · ${name(network)}` : t("chat.cardWallet")}>
      {output.balances.map((money) => (
        <MoneyRow key={money.asset} money={money} network={network} />
      ))}
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {output.allowance
          ? t("chat.allowanceOn", { amount: wholeAmount(output.allowance.perDay.display) })
          : t("chat.allowanceOff")}
      </Text>
      {/* Fund and Receive act on the active network, so they only sit on a card read on that network. */}
      {network === active ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" onPress={fund.open}>
            <Icon as={ArrowDownToLine} className="text-primary-foreground size-4" />
            <Text>{t("home.fund")}</Text>
          </Button>
          <Button className="flex-1" variant="secondary" onPress={() => router.push("/wallet/receive")}>
            <Icon as={QrCode} className="size-4" />
            <Text>{t("home.receive")}</Text>
          </Button>
        </View>
      ) : null}
    </AgentCard>
  );
}

function ActivityCard({ output }: { output: { items: ActivityLine[] } & OnNetwork }) {
  const { t } = useT();
  const networkName = useNetworkName();
  const { locale } = useLocale();
  const router = useRouter();
  const name = useCounterpartyName();
  const signed = useSignedAmount();
  if (output.items.length === 0) {
    return (
      <AgentCard eyebrow={t("activity.title")}>
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("activity.emptyBody")}</Text>
      </AgentCard>
    );
  }
  const cardNetwork = output.network ?? (output.items[0] ? networkOfExplorerUrl(output.items[0].explorerUrl) : undefined);
  return (
    <AgentCard eyebrow={cardNetwork ? `${t("activity.title")} · ${networkName(cardNetwork)}` : t("activity.title")} className="pb-1">
      <View className="-mx-4">
        {output.items.map((line) => {
          // The card's rows share the Activity tab's look, so the same facts read the same everywhere.
          const item: ActivityItem = {
            id: `${line.at}:${line.counterparty}:${line.amount.asset}`,
            network: output.network ?? networkOfExplorerUrl(line.explorerUrl),
            direction: line.direction,
            asset: line.amount.asset,
            amount: line.amount.baseUnits,
            counterparty: line.counterparty,
            counterpartyLabel: line.label,
            // A known wallet's name comes from its label; otherwise the name is the person's contact, if any.
            contactName: line.label ? null : line.counterpartyName,
            txHash: "",
            at: line.at,
            explorerUrl: line.explorerUrl,
          };
          const when = new Intl.DateTimeFormat(locale, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(line.at));
          return (
            <ListRow
              key={item.id}
              leading={<CounterpartyAvatar item={item} />}
              title={
                line.direction === "in"
                  ? t("activity.fromName", { name: name(item) })
                  : t("activity.toName", { name: name(item) })
              }
              subtitle={when}
              trailing={
                <Amount
                  className={
                    line.direction === "in"
                      ? "text-success text-sm font-semibold"
                      : "text-foreground text-sm font-semibold"
                  }
                >
                  {signed(item)}
                </Amount>
              }
              onPress={() => void Linking.openURL(line.explorerUrl)}
            />
          );
        })}
      </View>
      <Button variant="ghost" size="sm" onPress={() => router.navigate("/activity")}>
        <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
      </Button>
    </AgentCard>
  );
}

function CapabilityChip({
  state,
  otherNetwork,
  here,
}: {
  state: CapabilityLine["here"];
  otherNetwork: CapabilityLine["otherNetwork"];
  here: Network;
}) {
  const { t } = useT();
  const label =
    state === "available"
      ? t("chat.capAvailable")
      : state === "coming"
        ? t("fund.coming")
        : otherNetwork === "available"
          ? here === "testnet"
            ? t("chat.capMainnetOnly")
            : t("chat.capTestnetOnly")
          : t("chat.capUnavailable");
  return (
    <View className={cn("rounded-full px-2.5 py-1", state === "available" ? "bg-success/15" : "bg-secondary")}>
      <Text className={cn("text-xs font-semibold", state === "available" ? "text-success" : "text-muted-foreground")}>
        {label}
      </Text>
    </View>
  );
}

/** One icon per capability; anything new falls back to the spark until it gets its own. */
const CAPABILITY_ICON: Record<string, LucideIcon> = {
  send: ArrowUpRight,
  request: HandCoins,
  contacts: Users,
  swap: ArrowLeftRight,
  bridge: Route,
  yield: Sprout,
  automations: CalendarClock,
  marketplace: Store,
  voice: AudioLines,
  faucet: Droplets,
  payment_links: Link2,
  margin: CandlestickChart,
  buy: CreditCard,
  memory: Brain,
};
/** How many tiles show before "See all": three rows of two. */
const CAPABILITY_PREVIEW = 6;

function CapabilitiesCard({ output }: { output: { network: Network; capabilities: CapabilityLine[] } }) {
  const { t } = useT();
  const name = useNetworkName();
  const [all, setAll] = React.useState(false);
  // Available first, then what is coming; what is unavailable everywhere is left out.
  const order = { available: 0, coming: 1, unavailable: 2 } as const;
  const lines = output.capabilities
    .filter((line) => line.here !== "unavailable" || line.otherNetwork !== "unavailable")
    .sort((a, b) => order[a.here] - order[b.here]);
  const shown = all ? lines : lines.slice(0, CAPABILITY_PREVIEW);
  return (
    <AgentCard eyebrow={`${t("chat.cardCapabilities")} · ${name(output.network)}`}>
      <View className="flex-row flex-wrap gap-2">
        {shown.map((line) => (
          <View key={line.id} className="bg-secondary basis-[48%] grow gap-2 rounded-2xl p-3">
            <View className="flex-row items-center justify-between">
              <Icon as={CAPABILITY_ICON[line.id] ?? Sparkles} className="text-foreground size-5" />
              <CapabilityDot state={line.here} />
            </View>
            <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)} numberOfLines={1}>
              {t(`capability.${line.id}`)}
            </Text>
            {line.here !== "available" ? (
              <CapabilityChip state={line.here} otherNetwork={line.otherNetwork} here={output.network} />
            ) : null}
          </View>
        ))}
      </View>
      {lines.length > CAPABILITY_PREVIEW ? (
        <Button variant="ghost" size="sm" className="self-start" onPress={() => setAll((open) => !open)}>
          <Text>{all ? t("chatHome.seeLess") : t("chatHome.seeAll", { count: lines.length })}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}

/** Mint when it works here, muted when it doesn't (the words are on the chip; colour is never the only signal). */
function CapabilityDot({ state }: { state: CapabilityLine["here"] }) {
  return <View className={cn("size-2 rounded-full", state === "available" ? "bg-success" : "bg-muted-foreground/40")} />;
}

function FaucetCard({ output }: { output: FaucetResult }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const signIn = useSignIn();
  const fund = useFund();
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  // Money just sent from this conversation: home and the card behind watch for the credit, as after the fund hub.
  const fresh =
    output.status === "sent" && Date.now() - (new Date(output.nextAt).getTime() - CLAIM_WINDOW_MS) < FRESH_CLAIM_MS;
  const markFunded = fund.markFunded;
  React.useEffect(() => {
    if (fresh) markFunded();
  }, [fresh, markFunded]);

  return (
    <AgentCard eyebrow={t("fund.testTitle")}>
      <View className="flex-row items-center gap-3">
        <Koban width={KOBAN_WIDTH} metal={output.status === "sent" ? "gold" : "silver"} id="chat-faucet-koban" />
        <View className="min-w-0 flex-1 gap-1">
          {output.status === "sent" ? (
            <>
              <Amount className="text-success text-lg font-semibold">
                {output.amounts.map((money) => `+${money.display}`).join("  ")}
              </Amount>
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("fund.testSent")}</Text>
            </>
          ) : output.status === "claimed_today" ? (
            <Text className={cn("text-foreground text-base", TEXT_START)}>
              {t("fund.testClaimed", { time: time(output.nextAt) })}
            </Text>
          ) : output.status === "needs_sign_in" ? (
            <Text className={cn("text-foreground text-base", TEXT_START)}>{t("fund.testSignIn")}</Text>
          ) : output.status === "needs_wallet" ? (
            <Text className={cn("text-foreground text-base", TEXT_START)}>{t("fund.testSetUpFirst")}</Text>
          ) : output.status === "not_testnet" ? (
            <Text className={cn("text-foreground text-base", TEXT_START)}>{t("chat.faucetTestnetOnly")}</Text>
          ) : (
            <Text className={cn("text-destructive text-base", TEXT_START)}>{t("fund.testFailed")}</Text>
          )}
        </View>
      </View>
      {output.status === "needs_sign_in" ? (
        <Button onPress={signIn.open}>
          <Text>{t("signIn.title")}</Text>
        </Button>
      ) : output.status === "needs_wallet" ? (
        <Button onPress={() => router.push("/wallet")}>
          <Text>{t("wallet.setUp")}</Text>
        </Button>
      ) : output.status === "failed" ? (
        <Button variant="secondary" onPress={() => void Linking.openURL(output.fallbackUrl)}>
          <Icon as={ExternalLink} className="size-4" />
          <Text>{t("fund.openCircle")}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}

function ReceiveCard({
  output,
}: {
  output: { status: string; address?: string; handle?: string | null; network?: Network };
}) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const name = useNetworkName();
  if (output.status !== "ready" || !output.address || !output.network) {
    return (
      <AgentCard eyebrow={t("receive.title")}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>
          {output.status === "guest" ? t("receive.noWallet") : t("receive.setUpFirst")}
        </Text>
        <Button onPress={output.status === "guest" ? signIn.open : () => router.push("/wallet")}>
          <Text>{output.status === "guest" ? t("signIn.title") : t("wallet.setUp")}</Text>
        </Button>
      </AgentCard>
    );
  }
  const address = output.address;
  const copy = async () => {
    await Clipboard.setStringAsync(address);
    toast(t("home.addressCopied"));
  };
  return (
    <AgentCard eyebrow={`${t("receive.title")} · ${name(output.network)}`}>
      <View className="flex-row items-center gap-3">
        <Mark entity={arcIdentity(output.network).chain} size={ROW_MARK} />
        <View className="min-w-0 flex-1">
          {output.handle ? <Text className="text-foreground text-base font-semibold">@{output.handle}</Text> : null}
          <Amount className="text-muted-foreground text-sm">{shortAddress(address)}</Amount>
        </View>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("receive.anyToken")}</Text>
      <View className="flex-row gap-2">
        <Button className="flex-1" onPress={() => void copy()}>
          <Icon as={Copy} className="text-primary-foreground size-4" />
          <Text>{t("receive.copy")}</Text>
        </Button>
        <Button className="flex-1" variant="secondary" onPress={() => router.push("/wallet/receive")}>
          <Icon as={QrCode} className="size-4" />
          <Text>{t("chat.showQr")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}

function AuthorityCard({ output }: { output: { network: Network; authority: AuthoritySummary } }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const name = useNetworkName();
  const authority = output.authority;
  if (!authority) {
    return (
      <AgentCard eyebrow={t("wallet.allowanceTitle")}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("limits.offBody")}</Text>
        <Button onPress={() => router.push("/wallet")}>
          <Text>{t("limits.turnOn")}</Text>
        </Button>
      </AgentCard>
    );
  }
  const amount = wholeAmount(authority.perPeriod.display);
  const until = authority.until
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(authority.until),
      )
    : undefined;
  const daily = authority.periodSeconds === SECONDS_PER_DAY;
  return (
    <AuthorityReceipt
      labels={{ can: t("authority.can"), never: t("authority.never"), worst: t("authority.worst") }}
      can={[
        daily ? t("authority.canSendDaily", { amount }) : t("authority.canSendPeriod", { amount }),
        t("authority.canNoPrompt"),
      ]}
      never={[
        t("authority.neverMore", { amount }),
        ...(authority.onlyThisToken ? [t("authority.neverOtherTokens")] : []),
        t("authority.neverLimits"),
      ]}
      worst={t("authority.worstCase", { amount })}
      meta={until ? t("authority.meta", { network: name(output.network), date: until }) : name(output.network)}
      {...(authority.unknownTerms ? { warning: t("authority.unknownTerms") } : {})}
    />
  );
}

function NetworkSwitchCard({
  part,
  onAnswer,
}: {
  part: ToolPart;
  onAnswer: (output: { switched: boolean; network?: Network }) => void;
}) {
  const { t } = useT();
  const { network, next, nextName, busy, switchNetwork, consentNeeded, acceptMainnet, dismissConsent } =
    useNetworkSwitch();
  const name = useNetworkName();
  const [asked, setAsked] = React.useState<Network>();
  const reason = (part.input as { reason?: string } | undefined)?.reason;

  // The switch is done when the session says so; then the agent hears the answer and carries on.
  React.useEffect(() => {
    if (asked && network === asked) {
      setAsked(undefined);
      onAnswer({ switched: true, network: asked });
    }
  }, [asked, network, onAnswer]);

  if (part.state === "output-available") {
    const output = part.output as { switched: boolean; network?: Network };
    return (
      <AgentCard eyebrow={t("settings.network")}>
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>
          {output.switched && output.network
            ? t("chat.switched", { network: name(output.network) })
            : t("chat.notSwitched")}
        </Text>
      </AgentCard>
    );
  }
  return (
    <AgentCard eyebrow={t("settings.network")}>
      <View className="flex-row items-start gap-3">
        <Icon as={Waypoints} className="text-network mt-0.5 size-5" />
        <Text className={cn("text-foreground flex-1 text-base leading-6", TEXT_START)}>{reason}</Text>
      </View>
      <Button
        disabled={busy}
        onPress={() => {
          setAsked(next);
          void switchNetwork(next);
        }}
      >
        <Text>{t("network.switchTo", { network: nextName })}</Text>
      </Button>
      <Button variant="ghost" disabled={busy} onPress={() => onAnswer({ switched: false })}>
        <Text className="text-muted-foreground">{t("setup.notNow")}</Text>
      </Button>
      <MainnetConsentSheet
        open={consentNeeded}
        busy={busy}
        onAccept={() => void acceptMainnet()}
        onClose={dismissConsent}
      />
    </AgentCard>
  );
}

const LOADING_LABELS: Record<string, string> = {
  get_limits: "safety.loading",
  pause_all: "safety.loading",
  set_risk_mode: "safety.loading",
  propose_limit_change: "safety.loading",
  propose_allowlist_change: "safety.loading",
  revoke_grant: "safety.loading",
  get_wallet: "chat.loadingWallet",
  get_activity: "chat.loadingActivity",
  get_capabilities: "chat.loadingCapabilities",
  claim_test_money: "fund.testSending",
  show_receive: "chat.loadingWallet",
  get_authority: "chat.loadingAuthority",
  propose_send: "chat.loadingSend",
  propose_swap: "chat.loadingSwap",
  propose_trade: "chat.loadingSwap",
  propose_bridge: "chat.loadingBridge",
  get_earn: "chat.loadingEarn",
  propose_earn: "chat.loadingEarn",
  draft_automation: "chat.loadingAutomation",
  draft_auto_save: "chat.loadingAutoSave",
  draft_rule: "chat.loadingRule",
  list_automations: "chat.loadingAutomations",
  change_automation: "chat.loadingAutomationChange",
  find_contacts: "chat.loadingContacts",
  create_payment_request: "chat.loadingRequest",
  search_services: "market.loadingSearch",
  inspect_service: "market.loadingSearch",
  buy_service: "market.loadingBuy",
  get_agent_wallet: "market.loadingWallet",
  top_up_agent_wallet: "market.loadingWallet",
  create_invoice: "business.loadingInvoice",
  get_report: "report.loading",
  remember_fact: "memory.loadingRemember",
  forget_fact: "memory.loadingForget",
  search_history: "insight.searching",
  get_for_you: "forYou.loading",
  arc_knowledge: "insight.lookingUp",
  show_chart: "insight.loadingChart",
  explain_choice: "insight.loadingDecision",
  propose_setting_change: "insight.loadingSetting",
  get_status: "insight.loadingStatus",
  pay_from_code: "scan.reading",
  split_bill: "split.loading",
  ...BUSINESS_LOADING_LABELS,
};

/** One tool part, as a card (or its loading or error state). */
export function ToolCard({
  part,
  onToolOutput,
}: {
  part: ToolPart;
  onToolOutput: (tool: string, toolCallId: string, output: unknown) => void;
}) {
  const { t } = useT();
  const { user } = useSession();
  const tool = part.type.replace(/^tool-/, "");
  const resume = useChatResume();
  // The network the person is on now: only for whether a stored card's actions apply, never for its contents.
  const active: Network = user?.activeNetwork ?? "testnet";

  if (tool === "propose_network_switch") {
    return <NetworkSwitchCard part={part} onAnswer={(output) => onToolOutput(tool, part.toolCallId, output)} />;
  }
  if (part.state === "output-error") {
    return (
      <AgentCard>
        <Text className={cn("text-destructive text-sm", TEXT_START)}>{t("common.error")}</Text>
      </AgentCard>
    );
  }
  if (part.state !== "output-available")
    return <AgentCardLoading label={t(LOADING_LABELS[tool] ?? "common.loading")} />;

  switch (tool) {
    case "get_wallet":
      return <WalletCard output={part.output as WalletSummary & OnNetwork} active={active} />;
    case "get_activity":
      return <ActivityCard output={part.output as { items: ActivityLine[] } & OnNetwork} />;
    case "get_capabilities":
      return <CapabilitiesCard output={part.output as { network: Network; capabilities: CapabilityLine[] }} />;
    case "claim_test_money":
      return <FaucetCard output={part.output as FaucetResult} />;
    case "show_receive":
      return <ReceiveCard output={part.output as { status: string }} />;
    case "get_authority":
      return <AuthorityCard output={part.output as { network: Network; authority: AuthoritySummary }} />;
    case "propose_send":
      return <SendCard output={part.output as ProposeSendOutput} />;
    case "propose_swap":
    case "propose_trade":
      return <SwapCard output={part.output as ProposeSwapOutput} />;
    case "propose_bridge":
      // Threads from before route options keep their CCTP card; new ones carry `crosschain`.
      return (part.output as { crosschain?: boolean }).crosschain ? <MoveCard output={part.output as ProposeCrossChainOutput} /> : <BridgeCard output={part.output as ProposeBridgeOutput} />;
    case "bring_to_arc":
      return (part.output as { crosschain?: boolean }).crosschain ? <MoveCard output={part.output as ProposeCrossChainOutput} /> : null;
    case "get_earn":
      return <EarnOverviewCard output={part.output as EarnOverviewLine} />;
    case "propose_earn":
      return <EarnCard output={part.output as ProposeEarnOutput} />;
    case "draft_automation":
    case "draft_auto_save":
    case "draft_rule":
    case "draft_dca":
    case "draft_payroll":
    case "change_automation":
      return (part.output as Partial<ProposeAutomationOutput>).automation ? <AutomationCard output={part.output as ProposeAutomationOutput} /> : null;
    // An edit: the automation as changed, and its new permission to sign when it gives Kawase more.
    case "edit_automation": {
      const out = part.output as Partial<ProposeAutomationOutput> & { edit?: AutomationEditResponse };
      return out.automation ? <AutomationCard output={{ automation: out.automation, edit: out.edit }} /> : null;
    }
    // What the next runs would do, on the automation's own card.
    case "simulate_automation": {
      const out = part.output as { automation?: AutomationView; simulation?: SimulationView };
      return out.automation && out.simulation ? <AutomationCard output={{ automation: out.automation, simulation: out.simulation }} /> : null;
    }
    case "get_automation_runs":
    case "list_automations": {
      const list = part.output as ListAutomationsOutput;
      return list.automations.length > 0 ? (
        <View className="gap-3">
          {list.automations.map((entry) => (
            <AutomationCard key={entry.automation.id} output={entry} />
          ))}
        </View>
      ) : (
        <AgentCard eyebrow={t("automation.title")}>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("automation.noneOn")}</Text>
        </AgentCard>
      );
    }
    case "find_contacts":
      return <ContactsCard output={part.output as { contacts: ContactLine[] }} />;
    case "create_payment_request":
      return <RequestCard output={part.output as Parameters<typeof RequestCard>[0]["output"]} />;
    case "propose_perp_order":
    case "close_position":
      return (part.output as Partial<ProposeMarginOutput>).intent ? <MarginOrderCard output={part.output as ProposeMarginOutput} /> : null;
    case "get_markets":
      return (part.output as Partial<MarginMarketsOutput>).markets ? <MarginMarketsCard output={part.output as MarginMarketsOutput} /> : null;
    case "start_buy":
      return (part.output as Partial<BuyProposalOutput>).asset ? <OnrampBuyCard output={part.output as BuyProposalOutput} /> : null;
    case "propose_withdraw":
      return (part.output as Partial<WithdrawProposalOutput>).withdraw ? <WithdrawCard output={part.output as WithdrawProposalOutput} /> : null;
    case "get_positions":
      return (part.output as Partial<MarginPositionsOutput>).positions ? <MarginPositionsCard output={part.output as MarginPositionsOutput} /> : null;
    case "protect_position":
      return (part.output as Partial<ProtectPositionOutput>).network ? <ProtectCard output={part.output as ProtectPositionOutput} /> : null;
    case "compare_yield":
      return (part.output as Partial<CompareYieldOutput>).options ? <YieldOptionsCard output={part.output as CompareYieldOutput} /> : null;
    case "propose_supply":
    case "propose_borrow":
    case "propose_repay":
      return (part.output as Partial<ProposeLendOutput>).intent ? <LendOrderCard output={part.output as ProposeLendOutput} /> : null;
    case "search_services":
      return <ServicesCard output={part.output as ServiceSearchResult} />;
    case "inspect_service":
      return <ServiceCard output={part.output as { result: InspectServiceResult }} />;
    case "buy_service":
      return <BuyCard output={part.output as { outcome: BuyOutcome }} onSend={resume} />;
    case "get_agent_wallet":
      return <AgentWalletCard output={part.output as { wallet: AgentWalletLine }} />;
    case "top_up_agent_wallet":
      return <TopUpCard output={part.output as { proposal: AgentTopUpProposal }} onSend={resume} />;
    case "get_limits":
    case "pause_all":
    case "set_risk_mode":
    case "propose_limit_change":
    case "propose_allowlist_change":
    case "revoke_grant":
      return <SafetyCard output={part.output as SafetyToolOutput} />;
    case "create_invoice":
      return <InvoiceCard output={part.output as Parameters<typeof InvoiceCard>[0]["output"]} />;
    // Cards stored before the tool became weekly_report.
    case "get_report": {
      const report = (part.output as { report: ReportView | null }).report;
      return report ? (
        <AgentCard eyebrow={`${t("report.title")} · ${report.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}`}>
          <ReportCard report={report} compact />
        </AgentCard>
      ) : null;
    }
    case "remember_fact":
    case "forget_fact":
      return <MemoryCard output={part.output as MemoryToolOutput} />;
    case "search_history":
      return <HistorySearchCard output={part.output as HistorySearchOutput} />;
    case "get_for_you":
      return <ForYouChatCard output={part.output as SuggestionsView} />;
    case "arc_knowledge":
      return <KnowledgeCard output={part.output as { passages: { title: string; source: string }[] }} />;
    case "show_chart":
      return <ChartCard output={part.output as ChartOutput} />;
    case "explain_choice":
      return <DecisionCard output={part.output as DecisionView} />;
    case "propose_setting_change":
      return <SettingDiffCard output={part.output as SettingDiff} />;
    case "get_status":
      return <StatusCard output={part.output as StatusView} />;
    case "split_bill":
      return <SplitBillCard output={part.output as Parameters<typeof SplitBillCard>[0]["output"]} />;
    case "pay_from_code": {
      const paid = part.output as { code: PayCodeView; send: ProposeSendOutput | null };
      return paid.send ? <SendCard output={paid.send} /> : <PayCodeCard view={paid.code} />;
    }
    default:
      return <BusinessToolCard tool={tool} output={part.output} />;
  }
}
