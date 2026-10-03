// Everyday-money tools (A5-2), spread into the intelligence tools: pay from a scanned or pasted code. The code is the
// person's own words (they scanned or pasted it into this message), so the address it carries counts as typed (K2);
// Kawase reads it, checks the network and asset, and drafts the send — the recipient check runs there as always.
import { tool } from "ai";
import { z } from "zod";

import type { PayCodeView, ProposeSendOutput } from "@kawase/api-client";

import type { AgentContext } from "./context";

const CODE_MAX = 2_000;
const TITLE_MAX = 60;
const NAME_MAX = 80;
const PEOPLE_MAX = 20;
const ASSET_MAX = 64;

export type PayFromCodeOutput = { code: PayCodeView; send: ProposeSendOutput | null };

export function everydayTools(context: AgentContext) {
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
        // Only a name from the person's own message is asked in the app (K2); any other share is a link only.
        const said = context.lastUserText.toLowerCase();
        const shares = people.map((person) => ({ ...person, ask: said.includes(person.name.trim().replace(/^@/, "").toLowerCase()) }));
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
    pay_from_code: tool({
      description:
        "Pay from a payment code the person scanned or pasted in this message: a wallet address, an `ethereum:` payment link (EIP-681, which can carry the amount, token and chain), or a Kawase request or invoice link (/r/…). Pass the code exactly as it appears in their message. Kawase reads it, checks it is for this Arc network and a token on it (any ERC-20, not only USDC and EURC), and drafts the send as a card (paying a request or invoice ties the send to it). If the code is for the other Arc network, another chain or a token not on this network, or the request is closed, the result says so: tell them in one sentence (offer propose_network_switch for the other Arc network). Pass an amount only if the code had none and they said one.",
      inputSchema: z.object({
        code: z.string().min(1).max(CODE_MAX).describe("Exactly as in the person's message"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Only if the code has no amount and they said one"),
      }),
      execute: async ({ code, amount }): Promise<PayFromCodeOutput> => {
        // K2: the code must be in the person's own message, never from a tool result or the model.
        if (!context.lastUserText.includes(code.trim())) throw new Error("The code must come from the person's own message; ask them to scan or paste it.");
        const view = await context.intelligence.payCode(code);
        if (view.status === "send") {
          const send = await context.proposeSend({ recipient: view.to, amount: view.amount ?? amount ?? null, asset: view.asset, note: null });
          return { code: view, send };
        }
        if (view.status === "request") {
          const send = await context.proposeSend({ requestToken: view.token, recipient: null, amount: null, asset: null, note: null });
          return { code: view, send };
        }
        return { code: view, send: null };
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: output.send
          ? {
              code: output.code.status,
              ...(output.code.status === "request" ? { invoice: output.code.invoice?.number ?? null } : {}),
              send: output.send.summary,
            }
          : { code: output.code },
      }),
    }),
  };
}
