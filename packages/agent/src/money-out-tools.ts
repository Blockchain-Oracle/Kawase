// Money-out tools (builder A2, money-out.md "Withdraw"). Spread into buildTools; each acts through the injected
// context, already scoped to the person and their network (K2). Nothing moves from a call: the plan is a card that
// opens the Withdraw screen, where the person reviews the lines and confirms with Face ID (R5).
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";
import { destinationAddress } from "./trust";

const TEXT_MAX = 80;
const LINES_MAX = 10;
const UNAVAILABLE = { summary: "This is not available here." };
const CHAINS = ["arc", "base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"] as const;

export function moneyOutTools(context: AgentContext) {
  return {
    propose_withdraw: tool({
      description:
        "Prepare taking money out of Kawase (\"cash out\", \"withdraw my cirBTC to Kraken\", \"move everything to my MetaMask on Base\"): one asset, several, or everything, each as itself or as cash (converted to USDC on Arc first), to an exchange (Kraken, Bybit, OKX, Binance, Bitget, KuCoin, Coinbase), one of the person's saved places, or their own wallet on Arc or another chain. Pass only what they said: assets as named (symbol, name or address) with an amount or \"max\" and \"cash\" only if they asked for cash; the exchange or saved place by name; the chain; an address only if they gave one (a saved place fills it in). Kawase plans one line per asset (transfer on Arc, bridge, or convert first), what arrives, and warnings such as an exchange that does not credit that asset there. The card opens Withdraw to review; one Face ID sends it. Nothing moves from this call.",
      inputSchema: z.object({
        assets: z
          .array(
            z.object({
              asset: z.string().max(TEXT_MAX).describe("As they named it: \"USDC\", \"bitcoin\", \"cirBTC\" or an address"),
              amount: z.string().regex(/^(\d+(\.\d+)?|max)$/).optional().describe("Digits with a dot, or \"max\"; omit for all of it"),
              as: z.enum(["itself", "cash"]).optional().describe("\"cash\" only when they asked to convert to cash/dollars"),
            }),
          )
          .max(LINES_MAX)
          .optional(),
        everything: z.boolean().optional().describe("True when they said everything / all my money"),
        exchange: z.string().max(TEXT_MAX).optional().describe("The exchange they named"),
        place: z.string().max(TEXT_MAX).optional().describe("A saved place they named by its name"),
        chain: z.enum(CHAINS).optional().describe("Their own wallet's chain, when they named one"),
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Only an address they gave"),
      }),
      execute: async (input) => {
        if (!context.proposeWithdraw) return UNAVAILABLE;
        // K2 (M8): an address must be the person's own words (or their own address); a saved place goes by its name
        // and Kawase fills in its address, so the model never needs to carry one.
        if (input.address) await destinationAddress(context, input.address, "If it is one of their saved places, pass its name as place; Kawase fills in the address.");
        return context.proposeWithdraw(input);
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
