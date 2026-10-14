// Everyday-money tools (A5-2), spread into the intelligence tools: split a bill, remind whoever has not paid, and pay
// from a scanned or pasted code. The code is the person's own words (they scanned or pasted it into this message), so
// the address it carries counts as typed (K2); Kawase reads it, checks the network and asset, and drafts the send —
// the recipient check runs there as always, and the card waits for the person's tap (H2).
//
// `accountTools` (B2-2, moved here from the retired business tools) gives chat the same reach as the history and
// account screens: an export, the weekly report, why a movement happened, the fee reserve, signing a device out and
// deleting the account. Each reads or acts through the injected context, already scoped to the person and their
// network (K2). Nothing moves or changes from a call: signing a device out is a tap on the card, and deleting the
// account is done on its screen with the @handle typed (never by the model).
import { tool } from "ai";
import { z } from "zod";

import type { PayCodeView, ProposeSendOutput, RequestReminder } from "@kawase/api-client";

import type { AgentContext } from "./context";
import type { TurnTrust } from "./trust";

const CODE_MAX = 2_000;
const TITLE_MAX = 60;
const NAME_MAX = 80;
const PEOPLE_MAX = 20;
const ASSET_MAX = 64;
const DEVICE_MAX = 80;
const REPORT_DAYS_MAX = 31;
const UNAVAILABLE = { summary: "This is not available here." };
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export type PayFromCodeOutput = { code: PayCodeView; send: ProposeSendOutput | null };

/** What the model says after a reminder, by how it went. */
const REMINDED_SAY: Record<RequestReminder, string> = {
  in_app: "They were reminded in Kawase: their inbox and a push.",
  already_today: "They were already reminded today; Kawase reminds once a day per request.",
  link: "They are not on Kawase: the card's Remind button shares the link again with a reminder; tell the person to tap it.",
};

export function everydayTools(context: AgentContext, trust: TurnTrust) {
  return {
    split_bill: tool({
      description:
        "Split a bill: one amount of any token shared between people, as one payment request per person, each with its own link they can pay from Kawase or any wallet, and a card showing who has paid. \"Split 60 dollars for dinner with Amina and Tunde\" (equal, including the person by default), \"split 90 euros: Bola 40, Ade 50\" (by hand), \"split 0.3 WETH with @kemi\". Pass the people exactly as named: an @handle, or a saved contact whose @handle is known, is also asked in the Kawase app (their inbox and a push); everyone else gets the link to share. Pass the whole bill, the token (USDC unless they named another: euros/EURC, a symbol, a name or an address), a short title, includeMe false only if they said the bill is all on the others, and amounts only if they gave each one. Nobody is charged by this: each person pays their share themselves.",
      inputSchema: z.object({
        title: z.string().min(1).max(TITLE_MAX).describe("What the bill was for, a few words"),
        total: z.string().regex(/^\d+(\.\d+)?$/).describe("The whole bill, digits with a dot"),
        asset: z.string().max(ASSET_MAX).optional().describe("USDC unless the person named another token (EURC, euros, a symbol, a name or an address)"),
        includeMe: z.boolean().optional().describe("false only if the person does not take a share"),
        people: z
          .array(z.object({ name: z.string().min(1).max(NAME_MAX), amount: z.string().regex(/^\d+(\.\d+)?$/).optional() }))
          .min(1)
          .max(PEOPLE_MAX),
      }),
      execute: async ({ title, total, asset, includeMe, people }) => {
        // Only a name from the person's own message is asked in the app (K2), matched as whole words like a send's
        // recipient (trust.ts); any other share is a link only.
        const shares = people.map((person) => ({ ...person, ask: trust.typed(person.name) }));
        return context.intelligence.splitBill({ title, total, asset: asset ?? "USDC", includeMe: includeMe ?? true, people: shares });
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value:
          output.status === "created"
            ? {
                status: "created",
                title: output.split.title,
                network: output.split.network,
                asset: output.split.asset,
                shares: output.split.shares.map((share) => ({ name: share.name, handle: share.handle, askedInApp: share.askedInApp, amount: share.request.amount, link: share.request.link })),
                say: "The card lists each share: people on Kawase were asked in the app; the others have a link and Share button. Nobody is charged until they pay.",
              }
            : output,
      }),
    }),
    remind_payment: tool({
      description:
        "Remind someone who has not paid the person's payment request or their share of a split: \"remind Kemi about dinner\", \"nudge whoever owes me for the taxi\". Pass who it was for as the person said it (a name or @handle) and/or a few words of what it was about; requestId only when they picked one from an earlier choose list. Someone asked in Kawase gets a reminder in their inbox and by push (once a day per request); for a link only, the card's Remind shares the link again. Several open requests match → status choose: ask which. Nothing is paid or charged by this.",
      inputSchema: z.object({
        who: z.string().max(NAME_MAX).optional().describe("Who it was for, as the person said it"),
        about: z.string().max(TITLE_MAX).optional().describe("A few words of what it was for"),
        requestId: z.string().uuid().optional().describe("Only one the person picked from a choose list"),
      }),
      execute: async (input) => context.intelligence.remindPayment(input),
      toModelOutput: ({ output }) => ({
        type: "json",
        value:
          output.status === "reminded"
            ? { status: output.reminded === "link" ? "share_link" : output.reminded, who: output.who, say: REMINDED_SAY[output.reminded] }
            : output,
      }),
    }),
    pay_from_code: tool({
      description:
        "Pay from a payment code the person scanned or pasted in this message: a wallet address, an `ethereum:` payment link (EIP-681, which can carry the amount, token and chain), or a Kawase request link (/r/…). Pass the code exactly as it appears in their message. Kawase reads it, checks it is for this Arc network and a token on it (any ERC-20, not only USDC and EURC), and drafts the send as a card the person confirms with a tap, even inside their allowance (paying a request ties the send to it). If the code is for the other Arc network, another chain or a token not on this network, or the request is closed, the result says so: tell them in one sentence (offer propose_network_switch for the other Arc network). Pass an amount only if the code had none and they said one.",
      inputSchema: z.object({
        code: z.string().min(1).max(CODE_MAX).describe("Exactly as in the person's message"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Only if the code has no amount and they said one"),
      }),
      execute: async ({ code, amount }): Promise<PayFromCodeOutput> => {
        // K2: the code must be in the person's own message, never from a tool result or the model.
        if (!context.lastUserText.includes(code.trim())) throw new Error("The code must come from the person's own message; ask them to scan or paste it.");
        const view = await context.intelligence.payCode(code);
        // H2: a code's recipient and amount were written by whoever made the code, so its send never goes by itself,
        // even inside the allowance: the person checks the card and taps.
        if (view.status === "send") {
          // The code's reference (an order id) is written on chain with the payment (Arc Memo).
          const send = await context.proposeSend({ recipient: view.to, amount: view.amount ?? amount ?? null, asset: view.asset, note: null, memo: view.memo ?? null, memoId: view.memoId ?? null }, { autoSend: false });
          return { code: view, send };
        }
        if (view.status === "request") {
          const send = await context.proposeSend({ requestToken: view.token, recipient: null, amount: null, asset: null, note: null }, { autoSend: false });
          return { code: view, send };
        }
        return { code: view, send: null };
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: output.send
          ? {
              code: output.code.status,
              send: output.send.summary,
            }
          : { code: output.code },
      }),
    }),
  };
}

export function accountTools(context: AgentContext) {
  return {
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
        "The person's report card on the active network for the last week (or the days they say, up to 31): money received and sent, swaps, bridges, earn moves, what the agent spent on services, automations that ran or skipped. Use it for 'how did I do this week?', 'what did I spend?', 'weekly summary'.",
      inputSchema: z.object({ days: z.number().int().min(1).max(REPORT_DAYS_MAX).optional() }),
      execute: async ({ days }) => (context.weeklyReport ? context.weeklyReport({ days: days ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    explain_transaction: tool({
      description:
        "Why one movement of money happened, as its decision record: what was asked and where (or which automation ran), the checks, the route and what else was compared, how it was approved, what was sent and by whom, and what it matched (a payment request). Use it for \"why did this happen?\", \"what was that payment?\", \"why did 50 USDC leave yesterday?\". Pass a transaction hash only if it came from get_activity or the person; otherwise say which: the latest movement, the latest money in or the latest money out.",
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
