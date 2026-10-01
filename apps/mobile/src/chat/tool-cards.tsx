// Generative UI (L1–L12, the card base): each agent tool's result rendered as a card in the conversation, from the
// same real data the tool returned, under the network that data was read on (never the one the person is on now:
// a card reopened after a switch keeps its own network, and its actions only show while that is the active one) — balances with real marks, history rows, what each network can do, the faucet's
// result, the receive address, the authority receipt — and the network-switch card, which runs on the device: the
// person taps, the app switches (with the real-money sheet for mainnet), and the agent continues with the answer.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowDownToLine, Copy, ExternalLink, QrCode, Waypoints } from "lucide-react-native";
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
  ProposeBridgeOutput,
  ProposeEarnOutput,
  ProposeSwapOutput,
  WalletSummary,
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

function CapabilitiesCard({ output }: { output: { network: Network; capabilities: CapabilityLine[] } }) {
  const { t } = useT();
  const name = useNetworkName();
  // Available first, then what is coming; what is unavailable everywhere is left out.
  const order = { available: 0, coming: 1, unavailable: 2 } as const;
  const lines = output.capabilities
    .filter((line) => line.here !== "unavailable" || line.otherNetwork !== "unavailable")
    .sort((a, b) => order[a.here] - order[b.here]);
  return (
    <AgentCard eyebrow={`${t("chat.cardCapabilities")} · ${name(output.network)}`}>
      {lines.map((line) => (
        <View key={line.id} className="flex-row items-center gap-3">
          <Text className={cn("text-foreground flex-1 text-base", TEXT_START)}>{t(`capability.${line.id}`)}</Text>
          <CapabilityChip state={line.here} otherNetwork={line.otherNetwork} here={output.network} />
        </View>
      ))}
    </AgentCard>
  );
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
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("receive.warning")}</Text>
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
  get_wallet: "chat.loadingWallet",
  get_activity: "chat.loadingActivity",
  get_capabilities: "chat.loadingCapabilities",
  claim_test_money: "fund.testSending",
  show_receive: "chat.loadingWallet",
  get_authority: "chat.loadingAuthority",
  propose_send: "chat.loadingSend",
  propose_swap: "chat.loadingSwap",
  propose_bridge: "chat.loadingBridge",
  get_earn: "chat.loadingEarn",
  propose_earn: "chat.loadingEarn",
  draft_automation: "chat.loadingAutomation",
  find_contacts: "chat.loadingContacts",
  create_payment_request: "chat.loadingRequest",
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
      return <SwapCard output={part.output as ProposeSwapOutput} />;
    case "propose_bridge":
      return <BridgeCard output={part.output as ProposeBridgeOutput} />;
    case "get_earn":
      return <EarnOverviewCard output={part.output as EarnOverviewLine} />;
    case "propose_earn":
      return <EarnCard output={part.output as ProposeEarnOutput} />;
    case "draft_automation":
      return <AutomationCard output={part.output as ProposeAutomationOutput} />;
    case "find_contacts":
      return <ContactsCard output={part.output as { contacts: ContactLine[] }} />;
    case "create_payment_request":
      return <RequestCard output={part.output as Parameters<typeof RequestCard>[0]["output"]} />;
    default:
      return null;
  }
}
