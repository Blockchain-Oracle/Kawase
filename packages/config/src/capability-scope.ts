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
      "any token the person holds on Arc, to a saved contact, a Kawase @handle, an address they type or scan, with the recipient check on every payment: a token contract or a look-alike of a saved contact is refused, a non-wallet contract is warned about, the issuer's blocklist is checked where the token has one, and their own address is named",
      "inside the daily allowance it goes at once; above it, to a new address or for a token outside the allowance, the person confirms with Face ID (an email code on the web)",
      "USDC to someone on another chain (Base, Ethereum, Arbitrum, OP Mainnet, Polygon, Avalanche) through the best bridge route; on mainnet any other token too, as itself, through the cross-chain routes (the Move screen)",
      "Withdraw: one token, several or everything, each as itself or as cash, to an exchange (Kraken, Bybit, OKX, Binance, Bitget, KuCoin, Coinbase via Base), the person's own wallet on Arc or another chain, or their bank through an exchange; the route is planned per token (transfer, bridge or convert first) and confirmed once",
    ],
    notYet: [
      "inside one withdraw batch, tokens other than USDC go to another chain as cash (converted); as themselves they go as a separate move (the line offers it, mainnet)",
      "exchanges on testnet (withdraw goes to the person's own wallet there)",
    ],
  },
  request: {
    supports: [
      "a payment request with a shareable link in any token on Arc; marked paid by a Kawase send or a matching plain transfer",
      "business mode: a business profile; invoices with line items and a due date, a payment link, a PDF, and an on-chain reference (Arc Memo) that marks them paid, partly paid or overpaid; batch payouts signed once; payroll as a scheduled automation",
      "invoices and payouts in any token on Arc (a verified symbol or an exact address; look-alikes refused), and invoice reminders: the day before it is due and once overdue (inbox and push; overdue also by email)",
    ],
    notYet: [],
  },
  swap: {
    supports: [
      "buying, selling or swapping any token on Arc mainnet, meme coins included, at the best quote of KyberSwap, Circle App Kit and LI.FI (the others shown), paid with any token the person holds and confirmed by a slide on the card",
      "on Arc Testnet only USDC ↔ EURC exists to trade; other tokens and meme coins are mainnet only",
      "safety on every buy: GoPlus checks (honeypot, taxes, owner), Kawase's copycat rule (a token using a stablecoin's name at another address is never bought; lookalikes are named as such) and the person's token rules (unverified tokens at most $50 a trade and $200 a day; price impact at most 5%), which they change on the Token rules screen (tightening at once, loosening with their wallet's signature)",
      "price, 24-hour change, a price chart and safety for any token on Arc; the Markets tab (trending, new, heatmap) and search by name, symbol or address",
      "a token still on LIFT's bonding curve shows its progress to graduation and the fees a trade pays there, and can be watched for a graduation alert",
      "candlestick charts and profit and loss from the person's own trades on every token page; a price alert from the token page (above or below a dollar price, on the executable quote)",
    ],
    notYet: [
      "limit orders that fill by themselves (DCA and price-triggered swaps run as automations, and each one waits for the person's tap)",
      "buying on a launchpad's curve before the token graduates (the token page shows it and links the launchpad)",
    ],
  },
  buy: {
    supports: [
      "buying USDC or EURC with a debit card, Apple Pay or Google Pay through Circle's Onramp, delivered to the person's own wallet on Arc and confirmed when it lands on chain",
      "buying another token with a card: the Buy sheet's \"You get\" takes any token on Arc; the USDC that arrives is swapped with one more approval (both fees shown first), and a swap that is short of dollars offers the card",
      "on Arc Testnet: Circle's sandbox with test cards, no real money",
    ],
    notYet: [
      "Apple Pay and Google Pay on mainnet until Circle finishes its business check of Kawase's domain (the checkout shows which methods it offers)",
      "selling to a bank account (cash out goes through an exchange that takes Arc deposits)",
    ],
  },
  bridge: {
    supports: [
      "any asset from Arc to anyone on Base, Ethereum, Arbitrum, OP Mainnet, Polygon or Avalanche: USDC through Circle CCTP, Across, Relay, LI.FI or deBridge; other assets (WETH, EURC, cirBTC, a meme by symbol or address) arrive as themselves through LI.FI or deBridge (cirBTC as cbBTC), or as USDC when nothing carries them, swapped on Arc in the same batch; ranked by what arrives after fees (deBridge's 1 USDC flat fee counted), up to three shown, one Face ID",
      "Bring to Arc: USDC with Relay's permit (one signature, no gas there); the chain's own coin (ETH, POL, AVAX) in one transaction there, its gas from the coin, arriving as WETH etc.; other tokens with one Permit2 signature, and when a token is not yet approved for Permit2 there, in two steps under one yes: that approval first (one transaction there, its gas in the chain's coin), then the signature",
      "following each move until delivered (Across, Relay, LI.FI, deBridge, CCTP status) and saying plainly when a provider refunds",
      "on Arc Testnet: CCTP only",
    ],
    notYet: ["Bring to Arc without the chain's coin for gas when the token still needs its approval there", "Bring to Arc on testnet", "recovering a stuck transfer beyond the provider's own refund"],
  },
  yield: {
    supports: [
      "depositing USDC into and withdrawing from Morpho vaults listed by Circle's App Kit Earn on Arc, ranked by what they could give back now; vaults that could not are hidden (mock vaults on Arc Testnet)",
      "a yield-options comparison for an asset: Aave V4 supply, those vaults, and Aero LP pools with Merkl rewards (advanced), ranked by rate among sources that could return the amount",
      "supplying to and withdrawing from Aave V4 on Arc mainnet (see lend)",
      "Aero LP on Arc mainnet (advanced): depositing into USDC-EURC, cirBTC-USDC or WETH-USDC from one asset of the pair (the other side bought in the same batch, a range set around today's price), the position's value, fees and whether it is in range on Home and Earn, withdrawing a whole position in one batch, and claiming Merkl's USDC rewards; impermanent loss and range risk are named",
    ],
    notYet: ["choosing an LP range by hand, or adding to an existing LP position", "Morpho Blue markets directly", "depositing from another chain"],
  },
  automations: {
    supports: [
      "scheduled sends of a fixed amount to one saved recipient, every day, week (on a weekday) or month (on day 1–28), bounded on chain to that recipient and amount per period; payroll to several people the same way",
      "Auto-save and round-ups into the person's own vault savings, bounded on chain to the wallet and its own savings",
      "rules: when the balance crosses a line, when money arrives, or when a price crosses a level — bridge USDC to the person's own address on another chain (fee bounded on chain), save, alert, or send to someone; DCA buys on a schedule",
      "a step an automation may not take alone (every swap or DCA buy, anything above its grant, a payment held by the allowlist or cooldown) waits in Needs you: inbox, push and Activity; answered once from any device, reminded at 12 hours, expired at 24",
      "practice runs before going live, editing in place (lowering applies at once; raising signs a new grant), a reminder 24 hours before weekly and monthly runs, skipping and retrying once when underfunded",
      "listing, pausing, resuming, skipping the next run and cancelling (with a revoke on chain)",
    ],
    notYet: ["swaps that run unattended (every swap waits for the person)", "multi-step rules"],
  },
  lend: {
    supports: [
      "a yield-options comparison for an asset: Aave V4 supply (live rate, what the hub can pay out now), Circle App Kit's Morpho vaults ranked by withdrawable liquidity (stuck ones hidden), and Aero LP pools with Merkl rewards as advanced (see yield)",
      "supplying to and withdrawing from Aave V4 directly through its Main Spoke on Arc mainnet (USDC, EURC, cirBTC, WETH)",
      "borrowing USDC, EURC, cirBTC or WETH against collateral (USDC, cirBTC or WETH; EURC cannot be collateral), with the collateral put in the same batch, a live health gauge, the liquidation price when the collateral is one asset, a health check (refused below 1.25, warned below 1.5) and the rate; repaying part or all",
      "health alerts by push and email under 1.5 and 1.2",
    ],
    notYet: ["Morpho Blue markets directly", "Aave V4 on testnet (it is mainnet only)"],
  },
  margin: {
    supports: [
      "Kawase Margin on Arc mainnet: a leveraged long or short through the person's own Aave V4 account, opened and closed as one batch they confirm by sliding; markets come from Aave V4's live reserves (today cirBTC and WETH both ways; EURC short only, because EURC cannot be collateral there)",
      "margin is paid in USDC; leverage is capped by the asset's collateral factor so the account opens at health 1.10 or more (about 3.4× long cirBTC, 4× long WETH, 2.4× any short at today's factors); the card shows the liquidation price and borrow rate",
      "positions with live P&L, health and liquidation price; closing 25%, 50%, 75% or all",
      "take-profit and stop-loss on any position, set on the position page or in chat: Kawase closes the whole position when the price gets there, checked on a live Uniswap quote (a stop-loss sells within 3% of the oracle, otherwise the person is told), under five grants signed once that can only close into their own wallet; available where Uniswap on Arc can carry the size (cirBTC, EURC; WETH's pool is too thin today)",
      "health alerts by push and email when the account falls under 1.5 and under 1.2",
    ],
    notYet: ["paying margin in a token other than USDC", "Hibachi perps", "practice on testnet (Aave V4 is mainnet only)", "meme coins (no lending market lets you short them)"],
  },
  marketplace: {
    supports: [
      "finding paid services in Circle's x402 catalog on Arc (web search and news, prediction-market odds, DefiLlama yields and prices, stock prices, data enrichment) and paying for one call from the person's own agent wallet, within a daily budget and a per-call cap they set",
      "both payment rails: Circle Gateway nanopayments (most listings) and plain EIP-3009 USDC",
      "the Agent wallet page: balance (in Gateway and on hand), top up from the Kawase wallet under a capped grant or with Apple Pay or a card through Circle's Onramp, return to the wallet, budget, categories, blocked sellers, history",
      "on testnet, Kawase's own demo seller (Circle's catalog has no testnet listings)",
    ],
    notYet: ["refunds from sellers (x402 has no refund standard yet; a receipt says so when a seller kept a payment for a failed call)", "subscriptions or streaming payments"],
  },
  voice: {
    supports: [
      "talking to Kawase on iPhone and Android in your language: it hears you, answers aloud, and puts the same cards on your screen as chat",
      "voice in the web app too, through the browser's microphone; if the microphone is refused, Kawase says how to allow it and typing stays beside it",
      "one conversation: what you said by voice is in the chat thread, and typing picks it up",
      "a send by voice is ready on its card and waits for your tap (Face ID / fingerprint), even inside the daily allowance",
      "Settings → Voice: Kawase's voice (six voices), speaking speed (relaxed, normal, brisk) and whether it speaks first",
    ],
    notYet: ["voice inside the desktop app (not checked yet; use the web app in a browser)", "interrupting Kawase mid-sentence reliably on every device (being tuned)"],
  },
  memory: {
    supports: [
      "remembering facts the person asks it to (people, @handles, preferences), shown, editable and forgettable in Settings → Memory, or switched off; it says when it uses one",
      "searching every past conversation (words, cards and who they were for)",
      "long conversations stay coherent: older parts are summarized, the cards' own results are kept as they were",
      "For you cards on Home: idle USDC next to a vault that can pay it back, a request about to expire, a bridge that has not arrived, a big move in a held token, a margin position near liquidation",
      "answering questions about Arc and Kawase from its curated notes and docs, with sources",
      "charts of the portfolio or any token, why a route, venue or vault was chosen, a setting's now and after, and whether Arc, Circle and prices are up",
    ],
    notYet: ["remembering things it was not asked to remember", "push notifications for For you cards"],
  },
};
