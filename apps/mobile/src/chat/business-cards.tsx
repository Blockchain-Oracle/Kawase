// The chat's business, history and account cards (B2-2: chat has the same reach as the screens). Each finishes on the
// card what the agent only proposed: a payout is paid with one Face ID and ends in its ticket receipt (21st 6492
// twin; invoices read as a journal (21st 27124 twin) that
// opens each one; the week is a stats card (21st 8412 twin); why a movement happened is its process timeline (21st
// 28381 twin); a month's export is a file to share; devices are an item-action list (21st 28284 twin) where the
// person taps Sign out; deleting the account opens its own screen, where the @handle is typed.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { FileSpreadsheet, Laptop, ShieldAlert, Smartphone, Trash2 } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { toast } from "sonner-native";
import { arc, arcTestnet } from "viem/chains";

import type {
  DeleteAccountProposal,
  DeviceSignOutProposal,
  DeviceView,
  ExplainOutput,
  ExportLinkOutput,
  FeeReserveView,
  InvoiceFilter,
  InvoiceListOutput,
  PayoutProposal,
  PayoutView,
  WeeklyReportOutput,
} from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { ItemActionList } from "@kawase/ui-native/components/item-action-list";
import { JournalTable, type JournalTone } from "@kawase/ui-native/components/journal-table";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { StatsCard } from "@kawase/ui-native/components/stats-card";
import { TicketCard } from "@kawase/ui-native/components/ticket-card";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useAccountMethods } from "@/account/use-account-methods";
import { signAndSubmitPayout } from "@/business/sign-payout";
import { shareTextFile } from "@/history/share-file";
import { useWhyHeadline, WhyTimeline } from "@/history/why-timeline";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { usePrice } from "@/marketplace/use-agent-wallet";
import { shortAddress } from "@/send/copy";
import { API_URL, api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { FeeReserveChip } from "@/wallet/fee-reserve";

import { AgentCard } from "./card";

type Network = "mainnet" | "testnet";

const EXPLORER = { testnet: `${arcTestnet.blockExplorers?.default.url ?? ""}/tx/`, mainnet: `${arc.blockExplorers?.default.url ?? ""}/tx/` } as const;
const STABLE_DECIMALS = 6;
const SHOWN_DECIMALS_MAX = 6;
const HASH_HEAD = 10;
const HASH_TAIL = 8;
const INVOICES_SHOWN = 8;
const WHY_STEPS_SHOWN = 6;
const PLATFORM_NAMES = { ios: "iOS", android: "Android", web: "Web", desktop: "Desktop" } as const;
const PROBLEMS = ["amount", "self", "lookalike", "token_contract", "invalid"];

export const BUSINESS_LOADING_LABELS: Record<string, string> = {
  propose_payout: "chatCards.loadingPayout",
  list_invoices: "chatCards.loadingInvoices",
  export_history: "chatCards.loadingExport",
  weekly_report: "report.loading",
  explain_transaction: "chatCards.loadingWhy",
  sign_out_device: "chatCards.loadingDevices",
  get_fee_reserve: "fees.loading",
  delete_account: "common.loading",
};

function useNetworkName() {
  const { t } = useT();
  return (network: Network) => (network === "testnet" ? t("network.arcTestnet") : t("network.arc"));
}

function useTokenMoney() {
  const { locale } = useLocale();
  // Dollars and euros read like money (two places); any other token keeps the places that matter (0.015 cirBTC).
  return (baseUnits: string, decimals: number, symbol: string) =>
    formatTokenAmount(BigInt(baseUnits), decimals, symbol, locale, symbol === "USDC" || symbol === "EURC" ? {} : { fractionDigits: Math.min(decimals, SHOWN_DECIMALS_MAX), trimZeros: true });
}

/** A guest, a missing wallet or a service that is off: what to do first, in one line. */
function Blocked({ status, eyebrow }: { status: string; eyebrow: string }) {
  const { t } = useT();
  const signIn = useSignIn();
  return (
    <AgentCard eyebrow={eyebrow}>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {status === "needs_sign_in" ? t("chatCards.needsSignIn") : status === "needs_wallet" ? t("chatCards.needsWallet") : t("chatCards.unavailable")}
      </Text>
      {status === "needs_sign_in" ? (
        <Button size="sm" onPress={() => signIn.open()}>
          <Text>{t("pay.signInToPay")}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}

// ── Payout ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function PayoutReceipt({ payout }: { payout: PayoutView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useTokenMoney();
  const networkName = useNetworkName();
  const confirmed = payout.status === "confirmed";
  return (
    <TicketCard
      tone={confirmed ? "success" : "neutral"}
      title={confirmed ? t("business.payoutSent", { count: String(payout.lines.length) }) : t("business.payoutFailed")}
      subtitle={networkName(payout.network)}
      facts={[
        { label: t("chatCards.people"), value: String(payout.lines.length) },
        { label: t("business.total"), value: money(payout.total, payout.decimals, payout.asset), emphasis: true },
        { label: t("chatCards.when"), value: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(payout.createdAt)) },
        { label: t("chatCards.transfers"), value: t("chatCards.oneTransaction") },
      ]}
      strip={{ title: payout.lines.map((line) => line.name ?? shortAddress(line.address)).join(", "), detail: t("chatCards.payoutAllOrNothing") }}
      code={payout.txHash ?? undefined}
      codeLabel={payout.txHash ? `${payout.txHash.slice(0, HASH_HEAD)}…${payout.txHash.slice(-HASH_TAIL)}` : undefined}
      footer={
        payout.txHash ? (
          <Button variant="secondary" size="sm" onPress={() => void Linking.openURL(`${EXPLORER[payout.network]}${payout.txHash}`)}>
            <Text>{t("activity.viewExplorer")}</Text>
          </Button>
        ) : undefined
      }
    />
  );
}

export function PayoutProposalCard({ output }: { output: { proposal: PayoutProposal } }) {
  const { t } = useT();
  const money = useTokenMoney();
  const networkName = useNetworkName();
  const { user } = useSession();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const { proposal } = output;
  const [payout, setPayout] = React.useState<PayoutView | undefined>(proposal.status === "ready" ? proposal.payout : undefined);
  const [busy, setBusy] = React.useState(false);
  const eyebrow = `${t("business.payouts")} · ${networkName(proposal.network)}`;

  // A card reopened later shows what became of it (paid from this card or the Payouts screen).
  React.useEffect(() => {
    if (proposal.status !== "ready") return;
    void api.business
      .payouts()
      .then(({ payouts }) => {
        const now = payouts.find((entry) => entry.id === proposal.payout.id);
        if (now) setPayout(now);
      })
      .catch(() => undefined);
  }, [proposal]);

  if (proposal.status === "problems") {
    return (
      <AgentCard eyebrow={eyebrow}>
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("chatCards.payoutProblems")}</Text>
        {proposal.problems.map((entry) => (
          <Text key={`${entry.index}-${entry.recipient}`} className={cn("text-muted-foreground text-sm", TEXT_START)}>
            {t("business.lineProblem", { who: entry.recipient, problem: t(`business.problem.${PROBLEMS.includes(entry.problem) ? entry.problem : "unknown"}`) })}
          </Text>
        ))}
      </AgentCard>
    );
  }
  if (proposal.status !== "ready" || !payout) return <Blocked status={proposal.status} eyebrow={eyebrow} />;
  if (payout.status === "confirmed" || payout.status === "failed") return <PayoutReceipt payout={payout} />;

  const total = money(payout.total, payout.decimals, payout.asset);
  const onNetwork = user?.activeNetwork === proposal.network;
  const pay = async () => {
    if (!signer) return;
    const yes = await confirmWithBiometrics(t("business.payoutPrompt", { count: String(payout.lines.length), amount: total }), t("common.cancel"));
    if (yes !== "approved") return;
    setBusy(true);
    try {
      setPayout(await signAndSubmitPayout(signer, payout.id));
    } catch {
      toast(t("business.payoutFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentCard eyebrow={eyebrow}>
      <ListGroup>
        {payout.lines.map((line, index) => (
          <ListRow
            key={`${index}-${line.address}`}
            title={line.name ?? shortAddress(line.address)}
            subtitle={line.name ? shortAddress(line.address) : undefined}
            trailing={<Amount className="text-foreground text-sm">{money(line.amount, payout.decimals, payout.asset)}</Amount>}
          />
        ))}
      </ListGroup>
      <View className="flex-row items-baseline justify-between">
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("business.total")}</Text>
        <Amount className="text-foreground text-lg font-semibold">{total}</Amount>
      </View>
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("chatCards.payoutAllOrNothing")}</Text>
      {onNetwork ? (
        <Button disabled={busy || !signer || payout.status !== "ready"} onPress={() => void pay()}>
          <Text>{busy || payout.status === "submitted" ? t("common.loading") : t("business.payAll", { count: String(payout.lines.length), amount: total })}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}

// ── Invoices ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function InvoicesCard({ output }: { output: InvoiceListOutput }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const money = useTokenMoney();
  const networkName = useNetworkName();
  const [filter, setFilter] = React.useState<InvoiceFilter>(output.status === "ready" ? output.filter : "open");
  const [all, setAll] = React.useState(output.status === "ready" ? output.invoices : []);
  const eyebrow = `${t("business.invoices")} · ${networkName(output.network)}`;
  // Changing the range reads them all once; the card keeps the agent's own list until then.
  React.useEffect(() => {
    if (output.status !== "ready" || filter === output.filter) return;
    void api.business
      .invoices()
      .then(({ invoices }) => setAll(invoices.filter((invoice) => invoice.network === output.network)))
      .catch(() => undefined);
  }, [filter, output]);
  if (output.status !== "ready") return <Blocked status={output.status} eyebrow={eyebrow} />;

  const open = (status: string) => status === "open" || status === "partially_paid";
  const shown = all
    .filter((invoice) => (filter === "all" ? true : filter === "paid" ? invoice.status === "paid" : filter === "overdue" ? open(invoice.status) && invoice.overdue : open(invoice.status)))
    .slice(0, INVOICES_SHOWN);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
  const status = (invoice: (typeof all)[number]): { label: string; tone: JournalTone } =>
    invoice.status === "paid"
      ? { label: t("chatCards.invoicePaid"), tone: "good" }
      : invoice.status === "canceled"
        ? { label: t("chatCards.invoiceCanceled"), tone: "muted" }
        : invoice.overdue
          ? { label: t("chatCards.invoiceOverdue"), tone: "bad" }
          : invoice.status === "partially_paid"
            ? { label: t("chatCards.invoicePartly"), tone: "open" }
            : { label: t("chatCards.invoiceOpen"), tone: "open" };

  return (
    <JournalTable
      title={t("business.invoices")}
      count={t("chatCards.invoiceCount", { count: String(shown.length) })}
      ranges={(["open", "overdue", "paid", "all"] as const).map((key) => ({ key, label: t(`chatCards.filter.${key}`) }))}
      range={filter}
      onRange={(key) => setFilter(key as InvoiceFilter)}
      head={{ date: t("chatCards.colDue"), item: t("chatCards.colInvoice"), amount: t("chatCards.colLeft"), status: t("chatCards.colStatus") }}
      empty={t("chatCards.noInvoices")}
      rows={shown.map((invoice) => ({
        key: invoice.id,
        date: day(invoice.dueAt),
        title: `${invoice.number} · ${invoice.clientName}`,
        sub: money(invoice.total, invoice.decimals, invoice.asset),
        amount: money(invoice.status === "paid" ? invoice.total : invoice.remaining, invoice.decimals, invoice.asset),
        amountTone: invoice.status === "paid" ? "good" : invoice.overdue ? "bad" : "default",
        status: status(invoice),
        onPress: () => router.push({ pathname: "/business/invoice/[id]", params: { id: invoice.id } }),
      }))}
    />
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function ExportCard({ output }: { output: ExportLinkOutput }) {
  const { t } = useT();
  const { locale } = useLocale();
  const networkName = useNetworkName();
  const [busy, setBusy] = React.useState(false);
  const eyebrow = `${t("chatCards.exportTitle")} · ${networkName(output.network)}`;
  if (output.status !== "ready") return <Blocked status={output.status} eyebrow={eyebrow} />;
  const url = `${API_URL}${output.path}`;
  const expired = new Date(output.expiresAt).getTime() < Date.now();
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${output.month}-01T00:00:00Z`));
  const share = async () => {
    setBusy(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      await shareTextFile({ filename: output.filename, body: await response.text(), mimeType: output.format === "csv" ? "text/csv" : "text/plain" });
    } catch {
      toast(t("chatCards.exportExpired"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AgentCard eyebrow={eyebrow}>
      <ItemActionList
        items={[
          {
            key: output.filename,
            media: <Icon as={FileSpreadsheet} className="text-foreground size-4" />,
            title: month,
            description: `${output.format === "csv" ? "CSV" : "Beancount"} · ${output.filename}`,
            action: { label: busy ? t("common.loading") : t("chatCards.shareFile"), onPress: () => void share(), variant: "default", disabled: busy || expired },
          },
        ]}
      />
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>
          {expired ? t("chatCards.exportExpired") : t("chatCards.exportUntil", { time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(output.expiresAt)) })}
        </Text>
        {!expired ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() =>
              void Clipboard.setStringAsync(url).then(() => {
                toast(t("chatCards.linkCopied"));
              })
            }
          >
            <Text>{t("chatCards.copyLink")}</Text>
          </Button>
        ) : null}
      </View>
    </AgentCard>
  );
}

// ── Weekly report ──────────────────────────────────────────────────────────────────────────────────────────────────

export function WeeklyReportCard({ output }: { output: WeeklyReportOutput }) {
  const { t } = useT();
  const money = useTokenMoney();
  const price = usePrice();
  const networkName = useNetworkName();
  const eyebrow = `${t("report.title")} · ${networkName(output.network)}`;
  if (output.status !== "ready") return <Blocked status={output.status} eyebrow={eyebrow} />;
  const { report } = output;
  const sums = (bucket: Record<string, string>) =>
    Object.entries(bucket)
      .map(([asset, baseUnits]) => money(baseUnits, report.decimals?.[asset] ?? STABLE_DECIMALS, asset))
      .join(" · ") || "—";
  const rows = [
    report.counts.swaps > 0 ? { label: t("chatCards.reportSwaps"), value: String(report.counts.swaps) } : null,
    report.counts.bridges > 0 ? { label: t("chatCards.reportBridges"), value: String(report.counts.bridges) } : null,
    report.counts.earn > 0 ? { label: t("chatCards.reportEarn"), value: String(report.counts.earn) } : null,
    report.services.purchases > 0 ? { label: t("chatCards.reportServices"), value: price(report.services.spent), sub: t("chatCards.reportCalls", { count: String(report.services.purchases) }) } : null,
    report.automations.ran + report.automations.skipped > 0
      ? { label: t("chatCards.reportAutomations"), value: String(report.automations.ran), sub: t("chatCards.reportRanSkipped", { ran: String(report.automations.ran), skipped: String(report.automations.skipped) }) }
      : null,
    report.invoices.paid > 0 ? { label: t("chatCards.reportInvoices"), value: sums(report.invoices.amount), sub: t("chatCards.invoiceCount", { count: String(report.invoices.paid) }) } : null,
  ].filter((row): row is { label: string; value: string; sub?: string } => row !== null);
  return (
    <StatsCard
      label={eyebrow}
      hero={sums(report.received)}
      change={Object.keys(report.sent).length > 0 ? { text: `−${sums(report.sent)}`, positive: false } : undefined}
      shares={[
        { label: t("report.in", { count: String(report.counts.received) }), value: report.counts.received, tone: "success" },
        { label: t("report.out", { count: String(report.counts.sent) }), value: report.counts.sent, tone: "foreground" },
      ]}
      rows={rows}
      footnote={!report.complete ? t("report.partial") : undefined}
    />
  );
}

// ── Why ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function WhyCard({ output }: { output: ExplainOutput }) {
  const { t } = useT();
  const router = useRouter();
  const money = useTokenMoney();
  const headline = useWhyHeadline();
  const networkName = useNetworkName();
  const eyebrow = `${t("why.title")} · ${networkName(output.network)}`;
  if (output.status === "not_found") {
    return (
      <AgentCard eyebrow={eyebrow}>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("why.noRecordBody")}</Text>
      </AgentCard>
    );
  }
  if (output.status !== "ready") return <Blocked status={output.status} eyebrow={eyebrow} />;
  const { why, movement } = output;
  return (
    <AgentCard eyebrow={eyebrow}>
      {movement ? (
        <Amount className={cn("text-2xl font-semibold", movement.direction === "in" ? "text-success" : "text-foreground")}>
          {`${movement.direction === "in" ? "+" : "−"}${money(movement.amount, STABLE_DECIMALS, movement.asset)}`}
        </Amount>
      ) : null}
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{headline(why)}</Text>
      <WhyTimeline why={why} max={WHY_STEPS_SHOWN} />
      <Button variant="secondary" size="sm" onPress={() => router.push({ pathname: "/why/[tx]", params: { tx: why.txHash, network: why.network } })}>
        <Text>{t("chatCards.fullRecord")}</Text>
      </Button>
    </AgentCard>
  );
}

// ── Devices ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function DeviceSignOutCard({ output }: { output: { proposal: DeviceSignOutProposal } }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const account = useAccountMethods();
  const { proposal } = output;
  const [devices, setDevices] = React.useState<DeviceView[]>(proposal.status === "proposed" ? proposal.devices : []);
  const [busy, setBusy] = React.useState<string>();
  // The live list knows which one is this phone (the agent does not), so it is read again here.
  React.useEffect(() => {
    void api.account
      .devices()
      .then((result) => setDevices(result.devices.filter((device) => device.signedIn)))
      .catch(() => undefined);
  }, []);
  if (proposal.status !== "proposed") return <Blocked status={proposal.status} eyebrow={t("devices.title")} />;

  const when = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const signOut = async (device: DeviceView) => {
    const name = device.name ?? PLATFORM_NAMES[device.platform];
    const yes = await confirmWithBiometrics(t("chatCards.signOutPrompt", { name }), t("common.cancel"));
    if (yes !== "approved") return;
    setBusy(device.id);
    try {
      const { turnkeyPublicKey } = await api.account.signOutDevice(device.id);
      // Its Turnkey session key goes too, so that device can't sign anything even with the app still open.
      await account.deleteSessionKeys(turnkeyPublicKey ? [turnkeyPublicKey] : []).catch(() => 0);
      toast(t("devices.signedOut", { name }));
      setDevices((current) => current.filter((entry) => entry.id !== device.id));
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(undefined);
    }
  };
  const ordered = [...devices].sort((a, b) => Number(b.id === proposal.target) - Number(a.id === proposal.target) || Number(a.current) - Number(b.current));
  return (
    <AgentCard eyebrow={t("devices.title")}>
      <ItemActionList
        items={ordered.map((device) => ({
          key: device.id,
          media: <Icon as={device.platform === "ios" || device.platform === "android" ? Smartphone : Laptop} className="text-foreground size-4" />,
          title: `${device.name ?? PLATFORM_NAMES[device.platform]}${device.current ? ` · ${t("chatCards.thisDevice")}` : ""}`,
          description: [device.location, when(device.lastSeenAt)].filter(Boolean).join(" · "),
          ...(device.current
            ? {}
            : { action: { label: busy === device.id ? t("common.loading") : t("chatCards.signOut"), onPress: () => void signOut(device), variant: device.id === proposal.target ? ("destructive" as const) : ("secondary" as const), disabled: Boolean(busy) } }),
        }))}
      />
      <Button variant="ghost" size="sm" onPress={() => router.push("/account/devices")}>
        <Text className="text-muted-foreground">{t("chatCards.allDevices")}</Text>
      </Button>
    </AgentCard>
  );
}

// ── Fee reserve ─────────────────────────────────────────────────────────────────────────────────────────────────

export function FeeReserveCard({ output }: { output: { reserve: FeeReserveView | null; summary: { status?: unknown } } }) {
  const { t } = useT();
  const money = useTokenMoney();
  const { reserve } = output;
  if (!reserve) return <Blocked status={String(output.summary.status ?? "unavailable")} eyebrow={t("fees.cardTitle")} />;
  return (
    <AgentCard eyebrow={t("fees.cardTitle")}>
      <FeeReserveChip reserve={reserve} />
      <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("fees.perTransfer", { amount: money(reserve.perTransfer, STABLE_DECIMALS, "USDC") })}</Text>
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("fees.relayer")}</Text>
    </AgentCard>
  );
}

// ── Delete account ─────────────────────────────────────────────────────────────────────────────────────────────────

export function DeleteAccountCard({ output }: { output: { proposal: DeleteAccountProposal } }) {
  const { t } = useT();
  const router = useRouter();
  const { proposal } = output;
  if (proposal.status !== "proposed") return <Blocked status={proposal.status} eyebrow={t("deleteAccount.title")} />;
  return (
    <AgentCard eyebrow={t("deleteAccount.title")}>
      <ItemActionList
        items={[
          { key: "kept", media: <Icon as={ShieldAlert} className="text-foreground size-4" />, title: t("chatCards.deleteWalletStays"), description: t("deleteAccount.body") },
          { key: "first", media: <Icon as={Trash2} className="text-destructive size-4" />, title: t("deleteAccount.revoke"), description: t("deleteAccount.revokeNote") },
        ]}
      />
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("chatCards.deleteOnScreen", { handle: proposal.handle ? `@${proposal.handle}` : "" })}</Text>
      <Button variant="destructive" onPress={() => router.push("/account/delete")}>
        <Text>{t("chatCards.continueDelete")}</Text>
      </Button>
    </AgentCard>
  );
}

/** The business, history and account tools' cards; null for any other tool. */
export function BusinessToolCard({ tool, output }: { tool: string; output: unknown }) {
  switch (tool) {
    case "propose_payout":
      return (output as Partial<{ proposal: PayoutProposal }>).proposal ? <PayoutProposalCard output={output as { proposal: PayoutProposal }} /> : null;
    case "list_invoices":
      return (output as Partial<{ list: InvoiceListOutput }>).list ? <InvoicesCard output={(output as { list: InvoiceListOutput }).list} /> : null;
    case "export_history":
      return (output as Partial<{ link: ExportLinkOutput }>).link ? <ExportCard output={(output as { link: ExportLinkOutput }).link} /> : null;
    case "weekly_report":
      return (output as Partial<{ output: WeeklyReportOutput }>).output ? <WeeklyReportCard output={(output as { output: WeeklyReportOutput }).output} /> : null;
    case "explain_transaction":
      return (output as Partial<{ output: ExplainOutput }>).output ? <WhyCard output={(output as { output: ExplainOutput }).output} /> : null;
    case "sign_out_device":
      return (output as Partial<{ proposal: DeviceSignOutProposal }>).proposal ? <DeviceSignOutCard output={output as { proposal: DeviceSignOutProposal }} /> : null;
    case "get_fee_reserve":
      return (output as Partial<{ summary: unknown }>).summary ? <FeeReserveCard output={output as { reserve: FeeReserveView | null; summary: { status?: unknown } }} /> : null;
    case "delete_account":
      return (output as Partial<{ proposal: DeleteAccountProposal }>).proposal ? <DeleteAccountCard output={output as { proposal: DeleteAccountProposal }} /> : null;
    default:
      return null;
  }
}
