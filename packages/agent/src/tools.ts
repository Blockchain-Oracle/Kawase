// The agent's tools. Each one reads or acts through the injected context, already scoped to the person and the
// network their session is on (K2: no tool takes a network, an address or an approval from the model). Outputs
// are what the chat's cards render; they stay small, so the model sees them whole.
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const ACTIVITY_DEFAULT = 5;
const ACTIVITY_MAX = 20;
const REASON_MAX = 200;
const RECIPIENT_MAX = 80;
const NOTE_MAX = 140;
const LAST_WEEKDAY = 6;
const LAST_MONTHDAY = 28;
const TIMEZONE_MAX = 64;

export function buildTools(context: AgentContext) {
  return {
    get_wallet: tool({
      description:
        "The person's wallet on the active network: address, @handle, whether it is set up, USDC and EURC balances, and the daily allowance Kawase holds. Call it before saying anything about their money.",
      inputSchema: z.object({}),
      // Every money card records the network it was read on, so a stored card never borrows today's network.
      execute: async () => ({ ...(await context.wallet()), network: context.network }),
    }),
    get_activity: tool({
      description:
        "Recent USDC and EURC transfers in and out of the person's wallet on the active network, newest first.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(ACTIVITY_MAX).optional().describe(`How many, ${ACTIVITY_DEFAULT} if unsure`),
      }),
      execute: async ({ limit }) => ({ network: context.network, items: await context.activity(limit ?? ACTIVITY_DEFAULT) }),
    }),
    get_capabilities: tool({
      description:
        "What Kawase can do right now on the active network and on the other one: each capability is available, coming (being built) or unavailable there, with a reason. Use it for 'what can you do?' and before saying something is not possible. Not needed for a send: propose_send checks it.",
      inputSchema: z.object({}),
      execute: async () => ({ network: context.network, capabilities: await context.capabilities() }),
    }),
    claim_test_money: tool({
      description:
        "Send the person free test USDC and EURC from Circle's testnet faucet, once a day. Testnet only; test money has no value.",
      inputSchema: z.object({}),
      execute: async () => ({ ...(await context.claimTestMoney()), network: context.network }),
    }),
    show_receive: tool({
      description:
        "Show the person's own address and QR code on the active network so someone can pay them, or so they can fund the wallet.",
      inputSchema: z.object({}),
      execute: async () => {
        const wallet = await context.wallet();
        return wallet.status === "ready"
          ? { status: "ready" as const, address: wallet.address, handle: wallet.handle, network: context.network }
          : { status: wallet.status, network: context.network };
      },
    }),
    get_authority: tool({
      description:
        "Exactly what Kawase is allowed to do with the person's money on the active network (the daily allowance they signed: how much, until when, which token) and what it can never do.",
      inputSchema: z.object({}),
      execute: async () => ({ network: context.network, authority: await context.authority() }),
    }),
    propose_send: tool({
      description:
        "Prepare a send of USDC or EURC on the active network. Pass the recipient exactly as the person said it (a contact's name, an @handle, or an 0x address they typed), the amount as digits with a dot (\"10.5\"), the asset only if they named it, and their note if they gave one. Kawase resolves the recipient, runs every check and shows a card; the person confirms on the card. You never confirm, and nothing is sent by this call.",
      inputSchema: z.object({
        recipient: z.string().max(RECIPIENT_MAX).describe("As the person said it: a name, @handle or 0x address"),
        amount: z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .optional()
          .describe("Digits with a dot; omit if they did not say how much"),
        asset: z.enum(["USDC", "EURC"]).optional().describe("Only if the person named the currency"),
        note: z.string().max(NOTE_MAX).optional().describe("A private note the person asked to attach"),
      }),
      execute: async (input) => {
        // K2: an address can only come from the person's own words, never from the model or a tool result.
        if (/^0x/i.test(input.recipient.trim()) && !context.lastUserText.toLowerCase().includes(input.recipient.trim().toLowerCase())) {
          throw new Error("An address must be typed by the person; ask them for it.");
        }
        return context.proposeSend({
          recipient: input.recipient,
          amount: input.amount ?? null,
          asset: input.asset ?? null,
          note: input.note ?? null,
        });
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_swap: tool({
      description:
        "Prepare a swap between USDC and EURC on the active network (dollars ↔ euros). Pass the amount as digits with a dot and the currency it is in; name the other side only if the person did (with two currencies, one side implies the other). Kawase gets a fresh price, compares it with the market, runs every check and shows a card with what they give, about what they get and the least they will get. The person confirms on the card with Face ID (an email code on the web); nothing moves from this call.",
      inputSchema: z.object({
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Digits with a dot, in the currency given up; omit if they did not say how much"),
        from: z.enum(["USDC", "EURC"]).optional().describe("The currency they give up"),
        to: z.enum(["USDC", "EURC"]).optional().describe("The currency they want"),
      }),
      execute: async ({ amount, from, to }) => context.proposeSwap({ amount: amount ?? null, tokenIn: from ?? null, tokenOut: to ?? null }),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_bridge: tool({
      description:
        "Prepare moving the person's USDC from Arc to their own address on another chain (Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche; the testnet versions on testnet). Pass the chain and the amount as digits with a dot. Kawase quotes Circle's CCTP route (native USDC burned on Arc, minted there by Circle's forwarder, no gas needed on the other chain), compares the other routes that serve Arc, runs every check and shows a card. The person confirms on the card with Face ID (an email code on the web); nothing moves from this call.",
      inputSchema: z.object({
        destination: z.enum(["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"]).optional().describe("The chain they named; omit if they did not say"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC, digits with a dot; omit if they did not say how much"),
      }),
      execute: async ({ destination, amount }) => context.proposeBridge({ destination: destination ?? null, amount: amount ?? null }),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    get_earn: tool({
      description:
        "The USDC vaults the person can earn yield in on the active network (Morpho vaults through Circle App Kit; mock vaults on testnet): name, yearly yield now, how much can be paid out, whether Circle monitors it, and what the person already holds in each.",
      inputSchema: z.object({}),
      execute: async () => context.earnOverview(),
    }),
    propose_earn: tool({
      description:
        "Prepare putting USDC into a vault to earn yield, or taking it back out. Pass the action, the amount as digits with a dot, and a vault address only if the person picked one from get_earn (otherwise Kawase picks the highest-yield active vault for a deposit, or their position for a withdrawal). Kawase checks the vault and the amounts and shows a card; the person confirms on the card with Face ID (an email code on the web). Nothing moves from this call.",
      inputSchema: z.object({
        action: z.enum(["deposit", "withdraw"]),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC, digits with a dot; omit if they did not say"),
        vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Only a vault address from get_earn the person chose"),
      }),
      execute: async ({ action, amount, vault }) => context.proposeEarn({ action, amount: amount ?? null, vault: vault ?? null }),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    draft_automation: tool({
      description:
        "Draft an automation that sends money on a schedule without asking each time: \"every Tuesday send $1 to Alex\", \"pay rent of 500 on the 1st\". Pass the recipient exactly as the person said it, the amount per run as digits with a dot, how often (day, week or month), the weekday (0 = Sunday … 6 = Saturday) or day of the month (1–28) if they said one, a time (HH:MM) only if they said one (09:00 otherwise), and a time zone only if they named one (theirs otherwise). Kawase resolves the recipient, checks everything and shows a card with the read-back, the next runs and the most that can ever go per period. The person turns it on on the card with Face ID, which signs a grant the chain enforces; nothing is set up or sent by this call.",
      inputSchema: z.object({
        recipient: z.string().max(RECIPIENT_MAX).describe("As the person said it: a name, @handle or 0x address"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Per run, digits with a dot"),
        asset: z.enum(["USDC", "EURC"]).optional().describe("Only if the person named the currency"),
        every: z.enum(["day", "week", "month"]),
        weekday: z.number().int().min(0).max(LAST_WEEKDAY).optional().describe("0 = Sunday … 6 = Saturday, for weekly"),
        monthday: z.number().int().min(1).max(LAST_MONTHDAY).optional().describe("Day of the month, for monthly"),
        time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM, only if they said a time"),
        timezone: z.string().max(TIMEZONE_MAX).optional().describe("IANA zone, only if they named one"),
        note: z.string().max(NOTE_MAX).optional(),
      }),
      execute: async (input) => {
        // K2: an address can only come from the person's own words.
        if (/^0x/i.test(input.recipient.trim()) && !context.lastUserText.toLowerCase().includes(input.recipient.trim().toLowerCase())) {
          throw new Error("An address must be typed by the person; ask them for it.");
        }
        return context.draftAutomation({ ...input, note: input.note ?? null });
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    draft_auto_save: tool({
      description:
        "Draft Auto-save: keep an amount of USDC ready in the wallet and put the rest into the person's own savings in a vault, checked every day and whenever money arrives; when the wallet drops below the amount, savings top it up. Pass keep only if the person said an amount (digits with a dot), a vault only if they chose one from get_earn, and topUp false only if they said not to refill. Kawase picks the vault (the one they already use, else the best active one), checks everything and shows a card with what it keeps, where the rest goes, what would move right now, and the bound: only between their wallet and their own savings. The person turns it on on the card with Face ID; nothing moves from this call.",
      inputSchema: z.object({
        keep: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC to keep ready, digits with a dot; omit if they did not say"),
        vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Only a vault address from get_earn the person chose"),
        topUp: z.boolean().optional().describe("false only if they said not to refill the wallet from savings"),
      }),
      execute: async (input) => context.draftAutoSave(input),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    create_payment_request: tool({
      description:
        "Create a payment request on the active network: an exact amount of USDC or EURC with an optional note, as a link and QR the person can share. Whoever opens the link sees who asks and pays from Kawase or any wallet; it is marked paid automatically.",
      inputSchema: z.object({
        amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Digits with a dot"),
        asset: z.enum(["USDC", "EURC"]).optional().describe("USDC unless the person named EURC or euros"),
        note: z.string().max(NOTE_MAX).optional().describe("What it is for, shown to the payer"),
      }),
      execute: async ({ amount, asset, note }) => context.createPaymentRequest({ amount, asset: asset ?? "USDC", note: note ?? null }),
      toModelOutput: ({ output }) => ({
        type: "json",
        value:
          "request" in output
            ? { status: "created", link: output.request.link, amount: output.request.amount, asset: output.request.asset, note: output.request.note, network: output.request.network }
            : output,
      }),
    }),
    find_contacts: tool({
      description:
        "Search the person's saved contacts by name, alias or @handle (empty query lists them). Use it to answer questions about their contacts; for a send, just call propose_send with the name.",
      inputSchema: z.object({ query: z.string().max(RECIPIENT_MAX).describe("Part of a name or handle; empty for all") }),
      execute: async ({ query }) => ({ contacts: await context.findContacts(query) }),
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
