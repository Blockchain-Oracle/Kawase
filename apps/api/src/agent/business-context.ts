// Business, history and account for the agent (builder B2-2: chat has the same reach as the screens). Spread into
// buildAgentContext. Each method returns what the card renders and a small summary the model reads (display strings
// in canonical English digits; the model says them in the person's language). Nothing here moves money or changes the
// account: a payout waits for Face ID on the card, a device is signed out by the person's tap, and the
// account is deleted only on its screen with the @handle typed.
import type { AgentContext, ModelSummary } from "@kawase/agent";
import type { DeviceView, ExplainOutput, InvoiceFilter, InvoiceView, PayoutProposal, ReportView } from "@kawase/api-client";
import { REPORT_DAYS } from "@kawase/config";
import type { Db } from "@kawase/db";
import { formatTokenAmount } from "@kawase/money";

import type { AccountService } from "../account/service";
import type { InvoiceService } from "../business/invoices";
import type { PayoutService } from "../business/payouts";
import type { ExportLinks } from "../history/export-link";
import type { HistoryService } from "../history/service";
import { ProblemError } from "../http/problem";
import type { SessionUser } from "../types";
import type { WalletService } from "../wallet/service";

export type BusinessAgentDeps = { payouts: PayoutService; account: AccountService; exportLinks: ExportLinks };

/** Display strings for the model are canonical (English digits). */
const DISPLAY_LOCALE = "en";
const STABLE_DECIMALS = 6;
const SHOWN_DECIMALS_MAX = 6;
const INVOICES_SHOWN = 10;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
/** "YYYY-MM-DD" and "YYYY-MM" from an ISO timestamp. */
const DATE_CHARS = 10;
const MONTH_CHARS = 7;

const show = (baseUnits: string | bigint, decimals: number, symbol: string) =>
  formatTokenAmount(BigInt(baseUnits), decimals, symbol, DISPLAY_LOCALE, { fractionDigits: Math.min(decimals, SHOWN_DECIMALS_MAX), trimZeros: true });
const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;
const reason = (error: unknown) => (error instanceof ProblemError ? (error.detail ?? error.code) : "something went wrong");

const invoiceLine = (invoice: InvoiceView) => ({
  number: invoice.number,
  client: invoice.clientName,
  total: show(invoice.total, invoice.decimals, invoice.asset),
  left: show(invoice.remaining, invoice.decimals, invoice.asset),
  status: invoice.overdue ? "overdue" : invoice.status,
  due: invoice.dueAt.slice(0, DATE_CHARS),
});

function reportSummary(report: ReportView, days: number): ModelSummary {
  const sums = (bucket: Record<string, string>) => Object.entries(bucket).map(([asset, baseUnits]) => show(baseUnits, report.decimals?.[asset] ?? STABLE_DECIMALS, asset));
  return {
    status: "ready",
    network: report.network,
    days,
    received: sums(report.received),
    sent: sums(report.sent),
    swaps: report.counts.swaps,
    bridges: report.counts.bridges,
    earnMoves: report.counts.earn,
    servicesSpent: show(report.services.spent, STABLE_DECIMALS, "USDC"),
    automationsRan: report.automations.ran,
    automationsSkipped: report.automations.skipped,
    invoicesPaid: report.invoices.paid,
    complete: report.complete,
  };
}

export function businessContext(input: {
  user: SessionUser;
  db: Db;
  wallets: WalletService;
  invoices?: InvoiceService | undefined;
  history?: HistoryService | undefined;
  business?: BusinessAgentDeps | undefined;
}): Pick<
  AgentContext,
  "proposePayout" | "listInvoices" | "exportHistory" | "weeklyReport" | "explainTransaction" | "proposeDeviceSignOut" | "proposeDeleteAccount"
> {
  const { user, wallets, invoices, history, business } = input;
  const network = user.activeNetwork;
  const blocked = async (needsWallet: boolean, service: unknown) => {
    if (user.isAnonymous) return "needs_sign_in" as const;
    if (!service) return "unavailable" as const;
    if (needsWallet && !(await wallets.userWallet(user.id))) return "needs_wallet" as const;
    return null;
  };

  return {
    async proposePayout({ asset, lines }) {
      const stop = await blocked(true, business);
      if (stop) return { proposal: { network, status: stop }, summary: { status: stop } };
      let proposal: PayoutProposal;
      try {
        const result = await business!.payouts.create(user, { asset: asset ?? "USDC", lines });
        proposal = result.payout ? { network, status: "ready", payout: result.payout } : { network, status: "problems", problems: result.problems };
      } catch (error) {
        return { proposal: { network, status: "unavailable" }, summary: { status: "refused", reason: reason(error) } };
      }
      if (proposal.status !== "ready") {
        const problems = proposal.status === "problems" ? proposal.problems.map((entry) => ({ recipient: entry.recipient, problem: entry.problem })) : [];
        return { proposal, summary: { status: proposal.status, problems } };
      }
      const { payout } = proposal;
      return {
        proposal,
        summary: {
          status: "ready",
          network,
          people: payout.lines.length,
          total: show(payout.total, payout.decimals, payout.asset),
          lines: payout.lines.map((line) => ({ to: line.name ?? short(line.address), amount: show(line.amount, payout.decimals, payout.asset) })),
          next: "The person pays everyone with one Face ID on the card; nothing has moved yet.",
        },
      };
    },

    async listInvoices({ filter, number, client }) {
      const stop = await blocked(false, invoices);
      if (stop) return { list: { network, status: stop }, summary: { status: stop } };
      const all = await invoices!.list(user);
      const wanted = (invoice: InvoiceView) => {
        if (number) return invoice.number.toLowerCase() === number.trim().toLowerCase();
        if (client && !invoice.clientName.toLowerCase().includes(client.trim().toLowerCase())) return false;
        const open = invoice.status === "open" || invoice.status === "partially_paid";
        return ({ open, overdue: open && invoice.overdue, paid: invoice.status === "paid", all: true } satisfies Record<InvoiceFilter, boolean>)[filter];
      };
      const shown = all.filter(wanted);
      return {
        list: { network, status: "ready", filter, invoices: shown },
        summary: { status: "ready", network, filter, count: shown.length, invoices: shown.slice(0, INVOICES_SHOWN).map(invoiceLine), more: shown.length > INVOICES_SHOWN },
      };
    },

    async exportHistory({ month, format }) {
      const stop = await blocked(true, history && business);
      if (stop) return { link: { network, status: stop }, summary: { status: stop } };
      const chosen = month ?? new Date().toISOString().slice(0, MONTH_CHARS);
      const { token, expiresAt } = business!.exportLinks.sign({ sub: user.id, network, month: chosen, format });
      const filename = `kawase-${network}-${chosen}.${format}`;
      return {
        link: { network, status: "ready", month: chosen, format, path: `/files/export/${token}`, filename, expiresAt: expiresAt.toISOString() },
        summary: { status: "ready", month: chosen, format, file: filename, note: "The card opens or shares the file; the link works for 15 minutes." },
      };
    },

    async weeklyReport({ days }) {
      const stop = await blocked(false, history);
      if (stop) return { output: { network, status: stop }, summary: { status: stop } };
      const span = days ?? REPORT_DAYS;
      const report = await history!.report(user, network, span);
      return { output: { network, status: "ready", report }, summary: reportSummary(report, span) };
    },

    async explainTransaction({ txHash, which }) {
      const stop = await blocked(true, history);
      if (stop) return { output: { network, status: stop }, summary: { status: stop } };
      let hash = txHash;
      let movement: Extract<ExplainOutput, { status: "ready" }>["movement"] = null;
      if (!hash) {
        const { items } = await wallets.activity(user.id, network);
        const item = items.find((entry) => which === "latest" || (which === "latest_in" ? entry.direction === "in" : entry.direction === "out"));
        if (!item) return { output: { network, status: "not_found" }, summary: { status: "not_found", note: "No movement like that on this network yet." } };
        hash = item.txHash;
        movement = { direction: item.direction, asset: item.asset, amount: item.amount, at: item.at };
      }
      try {
        const why = await history!.why(user, network, hash);
        return {
          output: { network, status: "ready", why, movement },
          summary: {
            status: "ready",
            kind: why.kind,
            facts: why.facts,
            steps: why.steps.filter((step) => step.step !== "audit").map((step) => step.step),
            ...(movement ? { movement: `${movement.direction === "in" ? "received" : "sent"} ${show(movement.amount, STABLE_DECIMALS, movement.asset)} on ${movement.at.slice(0, DATE_CHARS)}` } : {}),
          },
        };
      } catch (error) {
        if (error instanceof ProblemError) return { output: { network, status: "not_found" }, summary: { status: "not_found", reason: reason(error) } };
        throw error;
      }
    },

    async proposeDeviceSignOut({ device }) {
      if (user.isAnonymous || !business) return { proposal: { status: "needs_sign_in" }, summary: { status: "needs_sign_in" } };
      const devices = (await business.account.devices(user.id, undefined)).filter((entry) => entry.signedIn);
      const words = device?.trim().toLowerCase();
      const label = (entry: DeviceView) => `${entry.name ?? ""} ${entry.platform}`.toLowerCase();
      const target = words ? (devices.find((entry) => label(entry).includes(words)) ?? null) : null;
      return {
        proposal: { status: "proposed", target: target?.id ?? null, devices },
        summary: {
          status: "proposed",
          devices: devices.map((entry) => ({ name: entry.name ?? entry.platform, platform: entry.platform, where: entry.location, lastActive: entry.lastSeenAt.slice(0, DATE_CHARS) })),
          matched: target ? (target.name ?? target.platform) : null,
          next: "The person taps Sign out on the card; you never sign a device out.",
        },
      };
    },

    async proposeDeleteAccount() {
      if (user.isAnonymous) return { proposal: { status: "needs_sign_in" }, summary: { status: "needs_sign_in" } };
      return {
        proposal: { status: "proposed", handle: user.handle },
        summary: { status: "proposed", next: "The card explains what is deleted and opens the delete screen, where they type their @handle. You never delete the account." },
      };
    },
  };
}
