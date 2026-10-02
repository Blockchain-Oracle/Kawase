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
const MAX_PERCENT = 100;
const TOKEN_QUERY_MAX = 64;
const SEARCH_SHOWN = 8;
const ASSETS_SHOWN = 20;

/** A symbol, name or 0x address → the best match on this network (held and verified tokens first). */
async function resolveToken(context: AgentContext, query: string) {
  const text = query.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return context.tokenDetail(text);
  const [best] = await context.searchTokens(text);
  return best ? context.tokenDetail(best.token.address) : null;
}

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
        "What Kawase can do right now on the active network and on the other one: each capability is available, coming (being built) or unavailable there, with a reason, plus exactly what it supports today and what it does not do yet. Use it for 'what can you do?', for 'can you …' about a specific token, chain, route or rule, and before saying something is or is not possible: answer from supports and notYet, never from the capability's name alone. Not needed for a send: propose_send checks it.",
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
        "Send USDC or EURC on the active network. Pass the recipient exactly as the person said it (a contact's name, an @handle, or an 0x address they typed), the amount as digits with a dot (\"10.5\"), the asset only if they named it, and their note if they gave one. Kawase resolves the recipient, runs every check and shows a card. Inside the person's daily allowance it goes at once (their request is the instruction); above it, to a new address over the first-payment threshold or to a look-alike address, it waits for their own confirmation on the card. You never confirm. The result's status says which happened: sending or sent, ready (waiting for their confirmation), or what it needs.",
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
    draft_rule: tool({
      description:
        "Draft a rule that acts by itself when something happens: when the balance goes above or drops below an amount, or when money arrives (optionally only from someone, or only at least an amount). The step: bridge USDC to the person's own address on base, ethereum, arbitrum, optimism, polygon or avalanche; save it into their own vault; or just tell them (an alert). How much: what is above the line (the default for 'balance above'), a share of the money that arrived (percent), or a fixed amount; pass reserve only if they said to keep something other than the line. Kawase checks it and shows a card with the read-back, what would happen right now and the bound the chain enforces; they turn it on on the card (Face ID; an alert needs only a tap). Nothing happens from this call. Use draft_automation for sends on a schedule and draft_auto_save for keep-an-amount-ready saving.",
      inputSchema: z.object({
        trigger: z.enum(["balance_above", "balance_below", "money_in"]),
        threshold: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC, for balance triggers"),
        from: z.string().max(RECIPIENT_MAX).optional().describe("Money in: only from this sender, as the person said it (a contact, @handle or an address they typed)"),
        minAmount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Money in: only payments of at least this much"),
        action: z.enum(["bridge", "save", "notify"]),
        destination: z.enum(["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"]).optional().describe("Bridge: the chain"),
        vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Save: only a vault address from get_earn the person chose"),
        amountMode: z.enum(["fixed", "excess", "percent"]).optional(),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Fixed amount, USDC"),
        reserve: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Excess: keep this much instead of the line"),
        percent: z.number().positive().max(MAX_PERCENT).optional().describe("A share of the money that arrived, 1–100"),
      }),
      execute: async (input) => {
        // K2: an address can only come from the person's own words.
        if (input.from && /^0x/i.test(input.from.trim()) && !context.lastUserText.toLowerCase().includes(input.from.trim().toLowerCase())) {
          throw new Error("An address must be typed by the person; ask them for it.");
        }
        return context.draftRule(input);
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    list_automations: tool({
      description:
        "The person's automations on the active network that are on or paused (scheduled sends and Auto-save), each as a card with its read-back, next runs, recent runs and bound. Use it for 'what automations do I have?' and before changing one.",
      inputSchema: z.object({}),
      execute: async () => context.listAutomations(),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: { network: output.network, automations: output.automations.map((entry) => entry.summary) },
      }),
    }),
    change_automation: tool({
      description:
        "Pause, resume, skip the next run of, or cancel one of the person's automations, when they ask. Pass the automationId from list_automations (call it first if you do not have it) and the change. Pause, resume and skip happen at once. Cancel stops every run at once; the card then offers to revoke its permission on Arc with Face ID, so say that. Only change what they asked about; if several automations could match, ask which.",
      inputSchema: z.object({
        automationId: z.string().uuid().describe("From list_automations"),
        change: z.enum(["pause", "resume", "skip_next", "cancel"]),
      }),
      execute: async (input) => context.changeAutomation(input),
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
    get_portfolio: tool({
      description:
        "Everything the person holds on the active network, priced: every token on Arc (not only USDC and EURC), what sits in positions (savings vaults), what their same address holds on other chains (mainnet), and what is hidden as spam or lookalikes. Total and 24-hour change in US dollars plus their display currency. Use it for 'what do I have', 'my portfolio', 'how much is my X worth'.",
      inputSchema: z.object({}),
      execute: async () => ({ network: context.network, portfolio: await context.portfolio() }),
      toModelOutput: ({ output }) => {
        const view = output.portfolio;
        const line = (row: (typeof view.assets)[number]) => ({ symbol: row.token.symbol, name: row.token.name, amount: row.amount, valueUsd: row.valueUsd, change24hPct: row.change24hPct, status: row.token.status, chain: row.chainName });
        return {
          type: "json",
          value: {
            network: output.network,
            isTest: view.isTest,
            totalUsd: view.totalUsd,
            change24hUsd: view.change24hUsd,
            change24hPct: view.change24hPct,
            displayCurrency: view.fx,
            assets: view.assets.slice(0, ASSETS_SHOWN).map(line),
            positions: view.positions.map((position) => ({ title: position.title, valueUsd: position.valueUsd, apyPct: position.apyPct ?? null })),
            otherChains: view.otherChains.slice(0, ASSETS_SHOWN).map(line),
            hiddenCount: view.hidden.length,
          },
        };
      },
    }),
    search_tokens: tool({
      description:
        "Find tokens on the active network by name, symbol or 0x address, with price, liquidity, whether the person holds it, and its status: canonical (Kawase's verified list), listed (market lists), unverified, lookalike (copies a listed token's symbol) or impersonator (uses a stablecoin's symbol at a fake address — never buy). Use it before talking about a token the person named.",
      inputSchema: z.object({ query: z.string().min(1).max(TOKEN_QUERY_MAX).describe("Name, symbol or 0x address as the person said it") }),
      execute: async ({ query }) => ({ network: context.network, results: await context.searchTokens(query) }),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          network: output.network,
          results: output.results.slice(0, SEARCH_SHOWN).map((result) => ({ symbol: result.token.symbol, name: result.token.name, address: result.token.address, status: result.token.status, priceUsd: result.priceUsd, liquidityUsd: result.liquidityUsd, held: result.held })),
        },
      }),
    }),
    get_token_safety: tool({
      description:
        "Is a token safe to buy? Kawase's copycat rule (impersonators of stablecoins are blocked; lookalikes are flagged) plus contract checks (honeypot, sell and buy tax, mint, owner, open source, holders, from GoPlus on mainnet), and the lookalikes using the same symbol. Pass the name, symbol or address. Say the verdict plainly; 'block' means Kawase will not buy it.",
      inputSchema: z.object({ token: z.string().min(1).max(TOKEN_QUERY_MAX) }),
      execute: async ({ token }) => {
        const detail = await resolveToken(context, token);
        return detail
          ? { status: "found" as const, network: context.network, token: detail.token, safety: detail.safety, market: detail.market, actions: detail.actions }
          : { status: "not_found" as const, network: context.network, query: token };
      },
    }),
    get_price: tool({
      description:
        "A token's current price in US dollars on the active network, with its 24-hour change, liquidity, volume and market cap (GeckoTerminal and LI.FI, refreshed each minute). Pass the name, symbol or address. Test tokens are valued at their mainnet twin.",
      inputSchema: z.object({ token: z.string().min(1).max(TOKEN_QUERY_MAX) }),
      execute: async ({ token }) => {
        const detail = await resolveToken(context, token);
        return detail
          ? { status: "found" as const, network: context.network, token: detail.token, market: detail.market, pricedAt: detail.pricedAt, stale: detail.stale }
          : { status: "not_found" as const, network: context.network, query: token };
      },
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
