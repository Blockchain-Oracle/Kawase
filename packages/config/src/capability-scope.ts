import type { CapabilityId } from "./capabilities";

/**
 * What each capability covers today, precisely, and what it does not do yet (review K04). A capability being
 * "available" opens its entry point; whether one specific request works is answered here: the branch that runs now
 * (actions, assets, chains, routes, triggers) and the branches still planned. The agent reads both before saying
 * something is or is not possible, so a broad label never stands in for the answer. Update it in the commit that
 * changes what runs. Plain English facts: the model answers in the person's language.
 */
export type CapabilityScope = { supports: readonly string[]; notYet: readonly string[] };

export const CAPABILITY_SCOPE: Partial<Record<CapabilityId, CapabilityScope>> = {
  send: {
    supports: [
      "USDC and EURC on Arc to a saved contact, a Kawase @handle or an address the person types",
      "inside the daily allowance it goes at once; above it, to a new address over the threshold or to a look-alike address, the person confirms with Face ID (an email code on the web)",
    ],
    notYet: ["sending to someone on another chain", "split bills and batch payouts", "scanning a QR code to pay"],
  },
  request: {
    supports: [
      "a payment request with a shareable link, in USDC or EURC; marked paid by a Kawase send or a matching plain transfer",
      "business mode: a business profile; invoices with line items and a due date, a payment link, a PDF, and an on-chain reference (Arc Memo) that marks them paid, partly paid or overpaid; batch payouts signed once; payroll (scheduled payments to several people, each bounded on chain)",
    ],
    notYet: ["invoice reminders by email", "invoices in tokens other than USDC and EURC"],
  },
  swap: {
    supports: [
      "buying, selling or swapping any token on Arc mainnet, meme coins included, at the best quote of KyberSwap, Circle App Kit and LI.FI (the others shown), paid with any token the person holds and confirmed by a slide on the card",
      "on Arc Testnet only USDC ↔ EURC exists to trade; other tokens and meme coins are mainnet only",
      "safety on every buy: GoPlus checks (honeypot, taxes, owner), Kawase's copycat rule (a token using a stablecoin's name at another address is never bought; lookalikes are named as such) and the person's token rules (unverified tokens at most $50 a trade and $200 a day; price impact at most 5%)",
      "price, 24-hour change, a price chart and safety for any token on Arc; the Markets tab (trending, new, heatmap) and search by name, symbol or address",
    ],
    notYet: [
      "limit orders, DCA and price-triggered swaps",
      "buying on a launchpad's curve before the token graduates (the token page shows it and links the launchpad)",
      "candlestick charts and profit and loss from the person's own trades",
      "changing the token rules on a screen (being built)",
    ],
  },
  buy: {
    supports: [
      "buying USDC or EURC with a debit card, Apple Pay or Google Pay through Circle's Onramp, delivered to the person's own wallet on Arc and confirmed when it lands on chain",
      "buying another token with a card: the USDC that arrives is swapped with one more approval (both fees shown first)",
      "on Arc Testnet: Circle's sandbox with test cards, no real money",
    ],
    notYet: [
      "Apple Pay and Google Pay on mainnet until Circle finishes its business check of Kawase's domain (the checkout shows which methods it offers)",
      "selling to a bank account (cash out goes through an exchange that takes Arc deposits)",
      "buying straight into the agent wallet",
    ],
  },
  bridge: {
    supports: [
      "USDC from Arc to the person's own address on Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche, through Circle CCTP with Circle's forwarder (about a minute)",
      "other providers (LI.FI on both networks; Relay and deBridge on mainnet) are quoted for comparison only; CCTP is the route Kawase executes",
    ],
    notYet: ["executing another provider's route even when it is cheaper", "bridging into Arc", "sending to someone else on another chain", "recovering a stuck transfer"],
  },
  yield: {
    supports: ["depositing USDC into and withdrawing from Morpho vaults listed by Circle's App Kit Earn on Arc (mock vaults on Arc Testnet)"],
    notYet: ["other yield protocols", "rewards", "depositing from another chain"],
  },
  automations: {
    supports: [
      "scheduled sends of a fixed amount of USDC or EURC to one saved recipient, every day, week (on a weekday) or month (on day 1–28), bounded on chain to that recipient and amount per period",
      "Auto-save: keep an amount ready in the wallet and move the rest into the person's own vault savings, topping the wallet up when it drops below; checked daily and whenever money arrives, bounded on chain to the wallet and its own savings",
      "rules: when the balance goes above or drops below an amount, or when money arrives (optionally from someone, or at least an amount) — bridge USDC to the person's own address on Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche (route fee bounded on chain), save it into their own vault, or alert them; amounts: what is above a line, a share of the money that arrived, or a fixed amount; balance rules fire once per crossing",
      "listing, pausing, resuming, skipping the next run and cancelling (with a revoke on chain)",
    ],
    notYet: [
      "rules that send to someone else, swap, or act on a price (price-triggered swaps, DCA)",
      "payroll and multi-step rules",
      "practice mode (what a rule would have done)",
      "editing an automation in place (cancel and set it up again for now)",
    ],
  },
  margin: {
    supports: [
      "Kawase Margin on Arc mainnet: a leveraged long or short through the person's own Aave V4 account, opened and closed as one batch they confirm by sliding; markets come from Aave V4's live reserves (today cirBTC and WETH both ways; EURC short only, because EURC cannot be collateral there)",
      "margin is paid in USDC; leverage is capped by the asset's collateral factor so the account opens at health 1.10 or more (about 3.4× long cirBTC, 4× long WETH, 2.4× any short at today's factors); the card shows the liquidation price and borrow rate",
      "positions with live P&L, health and liquidation price; closing 25%, 50%, 75% or all",
    ],
    notYet: ["take-profit and stop-loss orders", "paying margin in a token other than USDC", "Hibachi perps", "practice on testnet (Aave V4 is mainnet only)", "meme coins (no lending market lets you short them)"],
  },
  marketplace: {
    supports: [
      "finding paid services in Circle's x402 catalog on Arc (web search and news, prediction-market odds, DefiLlama yields and prices, stock prices, data enrichment) and paying for one call from the person's own agent wallet, within a daily budget and a per-call cap they set",
      "both payment rails: Circle Gateway nanopayments (most listings) and plain EIP-3009 USDC",
      "the Agent wallet page: balance (in Gateway and on hand), top up from the Kawase wallet under a capped grant, return to the wallet, budget, categories, blocked sellers, history",
      "on testnet, Kawase's own demo seller (Circle's catalog has no testnet listings)",
    ],
    notYet: ["buying with Apple Pay straight into the agent wallet", "refunds from sellers", "subscriptions or streaming payments"],
  },
  voice: {
    supports: [
      "talking to Kawase on iPhone and Android in your language: it hears you, answers aloud, and puts the same cards on your screen as chat",
      "one conversation: what you said by voice is in the chat thread, and typing picks it up",
      "a send by voice is ready on its card and waits for your tap (Face ID / fingerprint), even inside the daily allowance",
    ],
    notYet: ["voice in the web app (typing works there)", "choosing Kawase's voice or speed"],
  },
};
