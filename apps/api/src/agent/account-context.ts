// History and account for the agent (builder B2-2: chat has the same reach as the screens). Spread into
// buildAgentContext. Each method returns what the card renders and a small summary the model reads (display strings
// in canonical English digits; the model says them in the person's language). Nothing here moves money or changes the
// account: a device is signed out by the person's tap, and the account is deleted only on its screen with the @handle
// typed.
import type { AgentContext, ModelSummary } from "@kawase/agent";
import type { DeviceView, ExplainOutput, ReportView } from "@kawase/api-client";
import { REPORT_DAYS } from "@kawase/config";
import { formatTokenAmount } from "@kawase/money";

import type { AccountService } from "../account/service";
import type { FeeService } from "../fees/service";
import type { ExportLinks } from "../history/export-link";
import type { HistoryService } from "../history/service";
import { ProblemError } from "../http/problem";
import type { SessionUser } from "../types";
import type { WalletService } from "../wallet/service";

export type AccountAgentDeps = { service: AccountService; exportLinks: ExportLinks; fees?: FeeService | undefined };

/** Display strings for the model are canonical (English digits). */
const DISPLAY_LOCALE = "en";
const STABLE_DECIMALS = 6;
const SHOWN_DECIMALS_MAX = 6;
/** "YYYY-MM-DD" and "YYYY-MM" from an ISO timestamp. */
const DATE_CHARS = 10;
const MONTH_CHARS = 7;

const show = (baseUnits: string | bigint, decimals: number, symbol: string) =>
  formatTokenAmount(BigInt(baseUnits), decimals, symbol, DISPLAY_LOCALE, { fractionDigits: Math.min(decimals, SHOWN_DECIMALS_MAX), trimZeros: true });
const reason = (error: unknown) => (error instanceof ProblemError ? (error.detail ?? error.code) : "something went wrong");

function reportSummary(report: ReportView, days: number): ModelSummary {
  const sums = (bucket: Record<string, string>) => Object.entries(bucket).map(([asset, baseUnits]) => show(baseUnits, STABLE_DECIMALS, asset));
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
    complete: report.complete,
  };
}

export function accountContext(input: {
  user: SessionUser;
  wallets: WalletService;
  history?: HistoryService | undefined;
  account?: AccountAgentDeps | undefined;
}): Pick<AgentContext, "feeReserve" | "exportHistory" | "weeklyReport" | "explainTransaction" | "proposeDeviceSignOut" | "proposeDeleteAccount"> {
  const { user, wallets, history, account } = input;
  const network = user.activeNetwork;
  const blocked = async (needsWallet: boolean, service: unknown) => {
    if (user.isAnonymous) return "needs_sign_in" as const;
    if (!service) return "unavailable" as const;
    if (needsWallet && !(await wallets.userWallet(user.id))) return "needs_wallet" as const;
    return null;
  };

  return {
    async exportHistory({ month, format }) {
      const stop = await blocked(true, history && account);
      if (stop) return { link: { network, status: stop }, summary: { status: stop } };
      const chosen = month ?? new Date().toISOString().slice(0, MONTH_CHARS);
      const { token, expiresAt } = account!.exportLinks.sign({ sub: user.id, network, month: chosen, format });
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
      if (user.isAnonymous || !account) return { proposal: { status: "needs_sign_in" }, summary: { status: "needs_sign_in" } };
      const devices = (await account.service.devices(user.id, undefined)).filter((entry) => entry.signedIn);
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

    async feeReserve() {
      if (user.isAnonymous || !account?.fees) return { reserve: null, summary: { status: user.isAnonymous ? "needs_sign_in" : "unavailable" } };
      const reserve = await account.fees.reserve(user);
      return {
        reserve,
        summary: {
          status: reserve.hasWallet ? "ready" : "needs_wallet",
          network,
          usdc: show(reserve.usdc, STABLE_DECIMALS, "USDC"),
          actionsLeft: reserve.actionsLeft,
          perSend: show(reserve.perTransfer, STABLE_DECIMALS, "USDC"),
          low: reserve.low,
          relayer: "When the wallet cannot pay a fee, Kawase pays it for USDC and EURC sends; nothing is stuck.",
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
