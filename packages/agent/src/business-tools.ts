// Business, history and account tools (builder B2): chat has the same reach as the screens. Spread into buildTools;
// each reads or acts through the injected context, already scoped to the person and their network (K2). Nothing
// moves or changes from a call: a payout is a card the person approves with Face ID (payroll is the automations
// `payroll` kind, A3's draft_payroll), signing a device out
// is a tap on the card, and deleting the account is done on its screen with the @handle typed (never by the model).
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const RECIPIENT_MAX = 80;
const ASSET_MAX = 64;
const DEVICE_MAX = 80;
const INVOICE_NUMBER_MAX = 20;
const PAYOUT_LINES_MAX = 50;
const REPORT_DAYS_MAX = 31;
const UNAVAILABLE = { summary: "This is not available here." };
const DECIMAL = /^\d+(\.\d+)?$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

const payee = z.object({
  recipient: z.string().min(1).max(RECIPIENT_MAX).describe("As the person said it: a contact's name, an @handle or an 0x address they typed"),
  amount: z.string().regex(DECIMAL).describe("Digits with a dot"),
});

/** K2: an address can only come from the person's own words, never from the model or a tool result. */
function typedByPerson(context: AgentContext, recipients: string[]) {
  const said = context.lastUserText.toLowerCase();
  for (const recipient of recipients) {
    const text = recipient.trim();
    if (/^0x/i.test(text) && !said.includes(text.toLowerCase())) throw new Error("An address must be typed by the person; ask them for it.");
  }
}

export function businessTools(context: AgentContext) {
  return {
    propose_payout: tool({
      description:
        "Business mode: pay several people at once (\"pay Ana 200, Ben 150 and @carla 90 USDC\", a pasted list). Pass every line as the person said it (a contact's name, an @handle or an address they typed, and the amount as digits with a dot) and the token only if they named one (USDC otherwise; any Arc token by symbol or address works). Kawase resolves and checks every line like a send and shows one card: the people, the total and one Face ID that pays them all in a single transaction, all or nothing. Lines it could not resolve come back named; ask about those. Nothing moves from this call.",
      inputSchema: z.object({
        lines: z.array(payee).min(1).max(PAYOUT_LINES_MAX),
        asset: z.string().max(ASSET_MAX).optional().describe("Only if the person named the token"),
      }),
      execute: async ({ lines, asset }) => {
        typedByPerson(context, lines.map((line) => line.recipient));
        return context.proposePayout ? context.proposePayout({ asset: asset ?? null, lines }) : UNAVAILABLE;
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    list_invoices: tool({
      description:
        "Business mode: the person's invoices with their status — open, partly paid, paid, overdue — what is left to pay and when each is due. Use it for \"which invoices are unpaid?\", \"did Acme pay?\", \"status of INV-0003\". Pass a filter (open includes partly paid; overdue is open past its due date), or the invoice number or client name when they asked about one.",
      inputSchema: z.object({
        filter: z.enum(["open", "overdue", "paid", "all"]).optional().describe("open when unsure"),
        number: z.string().max(INVOICE_NUMBER_MAX).optional().describe("e.g. INV-0003"),
        client: z.string().max(RECIPIENT_MAX).optional(),
      }),
      execute: async ({ filter, number, client }) =>
        context.listInvoices ? context.listInvoices({ filter: filter ?? (number || client ? "all" : "open"), number: number ?? null, client: client ?? null }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    export_history: tool({
      description:
        "A download link for one calendar month of the person's history on the active network, as CSV (spreadsheets) or beancount (accounting): every movement with its counterparty's name, swaps, bridges, earn moves and what the agent spent. The card opens or shares the file; the link works for 15 minutes without signing in. Pass the month as YYYY-MM only if they said one (this month otherwise) and the format only if they said (CSV otherwise).",
      inputSchema: z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        format: z.enum(["csv", "beancount"]).optional(),
      }),
      execute: async ({ month, format }) => (context.exportHistory ? context.exportHistory({ month: month ?? null, format: format ?? "csv" }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    weekly_report: tool({
      description:
        "The person's report card on the active network for the last week (or the days they say, up to 31): money received and sent, swaps, bridges, earn moves, what the agent spent on services, automations that ran or skipped, invoices paid. Use it for 'how did I do this week?', 'what did I spend?', 'weekly summary'.",
      inputSchema: z.object({ days: z.number().int().min(1).max(REPORT_DAYS_MAX).optional() }),
      execute: async ({ days }) => (context.weeklyReport ? context.weeklyReport({ days: days ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    explain_transaction: tool({
      description:
        "Why one movement of money happened, as its decision record: what was asked and where (or which automation ran), the checks, the route and what else was compared, how it was approved, what was sent and by whom, and what it matched (a payment request, an invoice). Use it for \"why did this happen?\", \"what was that payment?\", \"why did 50 USDC leave yesterday?\". Pass a transaction hash only if it came from get_activity or the person; otherwise say which: the latest movement, the latest money in or the latest money out.",
      inputSchema: z.object({
        txHash: z.string().regex(TX_HASH).optional(),
        which: z.enum(["latest", "latest_in", "latest_out"]).optional(),
      }),
      execute: async ({ txHash, which }) => (context.explainTransaction ? context.explainTransaction({ txHash: txHash ?? null, which: which ?? "latest" }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    sign_out_device: tool({
      description:
        "Show the person's signed-in devices so they can sign one out (\"sign out my laptop\", \"I lost my old phone\"). Pass the device as they named it, if they did. The card lists each device with where and when it was last used; signing out is their tap on the card (it ends that device's sessions and deletes its signing key). You never sign a device out yourself. For a lost phone, also tell them about Pause all in Wallet & limits.",
      inputSchema: z.object({ device: z.string().max(DEVICE_MAX).optional() }),
      execute: async ({ device }) => (context.proposeDeviceSignOut ? context.proposeDeviceSignOut({ device: device ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    get_fee_reserve: tool({
      description:
        "The person's fee reserve on the active network: Arc's network fees are paid in USDC, so this says how many sends (\"~N actions left\") their USDC can still pay for, what one costs now, and that when it runs out Kawase pays the fee for USDC and EURC sends (no dead end). Use it for \"how much gas do I have?\", \"can I still send?\", \"why is there a fee?\".",
      inputSchema: z.object({}),
      execute: async () => (context.feeReserve ? context.feeReserve() : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    delete_account: tool({
      description:
        "When the person asks to delete their Kawase account: show what deleting means (the wallet stays theirs; Kawase deletes its records; permissions should be revoked and money moved first) and the way to the delete screen, where they type their @handle to confirm. You never delete the account and never ask them to type the handle in chat.",
      inputSchema: z.object({}),
      execute: async () => (context.proposeDeleteAccount ? context.proposeDeleteAccount() : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
