// Everyday-money tools (A5-2), spread into the intelligence tools: pay from a scanned or pasted code. The code is the
// person's own words (they scanned or pasted it into this message), so the address it carries counts as typed (K2);
// Kawase reads it, checks the network and asset, and drafts the send — the recipient check runs there as always.
import { tool } from "ai";
import { z } from "zod";

import type { PayCodeView, ProposeSendOutput } from "@kawase/api-client";

import type { AgentContext } from "./context";

const CODE_MAX = 2_000;

export type PayFromCodeOutput = { code: PayCodeView; send: ProposeSendOutput | null };

export function everydayTools(context: AgentContext) {
  return {
    pay_from_code: tool({
      description:
        "Pay from a payment code the person scanned or pasted in this message: a wallet address, an `ethereum:` payment link (EIP-681, which can carry the amount, token and chain), or a Kawase request or invoice link (/r/…). Pass the code exactly as it appears in their message. Kawase reads it, checks it is for this Arc network and a currency it sends (USDC or EURC), and drafts the send as a card (paying a request or invoice ties the send to it). If the code is for the other Arc network, another chain or another token, or the request is closed, the result says so: tell them in one sentence (offer propose_network_switch for the other Arc network). Pass an amount only if the code had none and they said one.",
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
