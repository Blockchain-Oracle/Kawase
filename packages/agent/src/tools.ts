// The agent's tools. Each one reads or acts through the injected context, already scoped to the person and the
// network their session is on (K2: no tool takes a network, an address or an approval from the model). Outputs
// are what the chat's cards render; they stay small, so the model sees them whole.
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const ACTIVITY_DEFAULT = 5;
const ACTIVITY_MAX = 20;
const REASON_MAX = 200;

export function buildTools(context: AgentContext) {
  return {
    get_wallet: tool({
      description:
        "The person's wallet on the active network: address, @handle, whether it is set up, USDC and EURC balances, and the daily allowance Kawase holds. Call it before saying anything about their money.",
      inputSchema: z.object({}),
      execute: () => context.wallet(),
    }),
    get_activity: tool({
      description:
        "Recent USDC and EURC transfers in and out of the person's wallet on the active network, newest first.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(ACTIVITY_MAX).optional().describe(`How many, ${ACTIVITY_DEFAULT} if unsure`),
      }),
      execute: async ({ limit }) => ({ items: await context.activity(limit ?? ACTIVITY_DEFAULT) }),
    }),
    get_capabilities: tool({
      description:
        "What Kawase can do right now on the active network and on the other one: each capability is available, coming (being built) or unavailable there, with a reason. Use it for 'what can you do?' and before answering any request to move money.",
      inputSchema: z.object({}),
      execute: async () => ({ network: context.network, capabilities: await context.capabilities() }),
    }),
    claim_test_money: tool({
      description:
        "Send the person free test USDC and EURC from Circle's testnet faucet, once a day. Testnet only; test money has no value.",
      inputSchema: z.object({}),
      execute: () => context.claimTestMoney(),
    }),
    show_receive: tool({
      description:
        "Show the person's own address and QR code on the active network so someone can pay them, or so they can fund the wallet.",
      inputSchema: z.object({}),
      execute: async () => {
        const wallet = await context.wallet();
        return wallet.status === "ready"
          ? { status: "ready" as const, address: wallet.address, handle: wallet.handle, network: context.network }
          : { status: wallet.status };
      },
    }),
    get_authority: tool({
      description:
        "Exactly what Kawase is allowed to do with the person's money on the active network (the daily allowance they signed: how much, until when, which token) and what it can never do.",
      inputSchema: z.object({}),
      execute: async () => ({ network: context.network, authority: await context.authority() }),
    }),
    // Runs on the device: the card shows the reason and a button; the person decides, and the app switches.
    propose_network_switch: tool({
      description:
        "Offer to switch to the other network when what the person asked exists only there. Never switch on your own; this shows a card and the person taps to switch. One short reason.",
      inputSchema: z.object({
        reason: z.string().max(REASON_MAX).describe("Why the other network, in the person's language"),
      }),
      outputSchema: z.object({ switched: z.boolean(), network: z.enum(["mainnet", "testnet"]).optional() }),
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
