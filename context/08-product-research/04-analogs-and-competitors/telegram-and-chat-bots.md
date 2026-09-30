# Telegram, X/Farcaster, and chat-surface crypto bots

Purpose: document how chat-native crypto bots (Telegram trading bots, Bankr, Farcaster bots, XMTP/Base App agents, wallet-alert bots) handle actions, confirmations, limits, name resolution, automations, notifications and pricing, so the Arc agent does not miss a proven pattern.

Sources:
- Bankr docs: https://docs.bankr.bot/llms.txt and https://docs.bankr.bot/llms-full.txt (saved: `.firecrawl/product/bankr-llms.txt`, `.firecrawl/product/bankr-llms-full.txt`)
- Maestro docs: https://docs.maestrobots.com/llms-full.txt (saved: `.firecrawl/product/maestro-llms-full.txt`)
- Banana Gun docs: https://docs.bananagun.io/llms-full.txt (saved: `.firecrawl/product/bananagun-llms-full.txt`)
- Cielo docs: https://docs.cielo.finance/wallet-tracking/subscribe.md (saved: `.firecrawl/product/cielo-subscribe.md`)
- GMGN docs: https://docs.gmgn.ai/index/wallet-alert-on-telegram
- XMTP docs: https://docs.xmtp.org/agents/get-started/intro
- Reddit search results (via Firecrawl): `.firecrawl/product/bankr-reddit.json`, `.firecrawl/product/tgbots-reddit.json`
- Secondary sources are linked inline.

Verified: 2026-09-29

---

## 0. Headline finding: Bankr already lists Arc

Bankr's docs list **Arc (chain ID 5042, i.e. Arc mainnet)** as one of eleven supported chains. [VERIFIED, docs only; no on-chain test was run] `bankr-llms-full.txt:43`, `:203`, `:338-350`, `:11327`, `:18141`
- Arc capabilities per the docs: "Balances and USDC/ERC-20 transfers", "Raw transactions, contract deploys", and "Token launches on Bankr Launch v3, quoted in native USDC". `bankr-llms-full.txt:342-346`
- Not on Arc: "No aggregator swaps yet (0x/Relay do not route Arc). Gas is paid in native USDC and is not sponsored." NFTs are marked "No" for Arc. `bankr-llms-full.txt:348`, `:203`
- Arc token launches use a Uniswap v3 pool at the 1% fee tier, quoted in native USDC, with an LP-fee split of "70% creator / 30% Bankr". `bankr-llms-full.txt:3012`

[INFERENCE] So the claim "nothing like this exists on Arc" is only partly true. There is a general-purpose chat agent that can send USDC and launch tokens on Arc mainnet. It cannot swap there, and nothing is Arc-specific (no Circle Gateway/CCTP bridge UX, no Arc yield, no voice). The gap on Arc is depth, not existence.

---

## 1. Bankr (bankr.bot, @bankrbot)

**Status:** live. The docs are current: they mention BNKR staking "deprecated on April 8, 2026" (`bankr-llms-full.txt`, Staking section). [VERIFIED]

**Surfaces:** the bankr.bot web terminal; @bankrbot replies on X; Farcaster; Telegram DMs; REST Agent API and Wallet API; CLI; Claude Code plugins; a skill for other agents; webhooks; x402 Cloud. [VERIFIED] `bankr-llms.txt` index; `bankr-llms-full.txt:687`, `:995`

**Actions** [VERIFIED] (features table and runtime overview, `bankr-llms-full.txt:400-423`, `:13870+`):
- Money movement: swaps, bridging via Relay, transfers to an address, ENS name, or social handle (`"send $5 of DEGEN to @username"`), and NFT transfers.
- Trading: limit, stop (including trailing), DCA, TWAP, tokenized stocks (location-gated), leverage via Hyperliquid and Avantis, and Polymarket bets.
- NFTs: view, buy, mint, list, and accept or make offers.
- Tokens: fair-launch a token, claim or redirect creator fees, and "Glidepath" (AI-paced selling of your own token).
- Market data: prices, charts, "technical analysis", trending tokens, and token research.
- Other: arbitrary contract calls ("the agent finds the ABI, verifies the address, and calls it"), contract deploy and verify, Merkl rewards, browser automation (Club only, private chats only), apps (generated mini-dashboards in a sandboxed iframe), a persistent filesystem, skills and MCP servers, and paying for or hosting x402 endpoints.

**Name resolution (contacts):** "A handle resolves to the Bankr wallet of that account on that platform". If an X or Farcaster account has no Bankr wallet, "Bankr creates one that its owner can use by signing in with that account; a Telegram handle must already have a Bankr wallet." [VERIFIED] `bankr-llms-full.txt:15692`
- [INFERENCE] This "send to a handle that has no wallet yet, and a claimable wallet is created" pattern is the social equivalent of Abu's "I don't have Alex's address" pop-up. Bankr does not document a user-managed contact book. [UNKNOWN] Searched the docs for "contact"/"address book" and found only the recipient allowlist.

**Memory:** durable preferences saved to `/.memory/` and applied across surfaces, e.g. "never confirm trades under $50". [VERIFIED] `bankr-llms-full.txt:407`, `:466`
- [INFERENCE] This means confirmation thresholds are user-configurable through natural language.

**Confirmations:**
- Browser checkouts: "Bankr won't submit a purchase, send a payment, or take an irreversible action on your behalf without explicit confirmation." [VERIFIED] `:1031`
- Apps can only prepare a transaction; "confirmation always goes through the chat flow". [VERIFIED] `:1242-1245`
- x402 calls made from apps pop "a confirmation modal showing URL + max USD" for every call, with a per-call USD cap and a rate limit of 10 calls/min. [VERIFIED] `:1252`

**Limits and safety** (the most complete control set found in any chat bot) [VERIFIED] `bankr-llms-full.txt:1788-1960`:
- Wallet-level controls, enforced "at the broadcast chokepoint" across every surface:
  - Pause all transactions.
  - Daily USD limit (default $500/24h) and per-transaction limit (default $500).
  - Permitted-recipient allowlist, where new entries wait a cooldown (default 24h).
  - Price-impact protection (default 15%).
  - A toggle for arbitrary contract calls.
  - Passkey MFA for login and step-up on settings changes.
  - Per-device session logout.
- Timers: safety toggles can be loosened for 10 min, 30 min, 1 h or 24 h, and "always resolve back toward the safe one".
- Fail-closed pricing: "If pricing is unavailable and a USD limit is enabled, the transaction is rejected".
- Spend log "idempotent on transaction hash, so retries can't inflate the daily counter".
- Per-API-key controls: read-only mode, IP allowlist, recipient allowlist ("Most useful for autonomous agents where recipients are LLM-resolved", `:2124`).
- The docs claim "A security layer screens every transaction for malicious contracts, phishing, unusual patterns, and prompt injection before anything signs." [VERIFIED as a docs claim; efficacy UNKNOWN; see the two May 2026 incidents in `failures-and-incidents.md`]
- Custody: Privy embedded wallets, "non-exportable by design". [VERIFIED] `:1875`

**Automations** [VERIFIED] `:942-990`:
- Types: limit, stop, DCA, TWAP, vesting sell, and "Agent Command" automations for any prompt on a schedule, e.g. "every day at 9am, check the price of ETH and send me a summary".
- Management: by chat ("show my automations", "cancel all my automations"). Pause, resume and edit happen in a sidebar "Automations view".
- Caps: 20 agent commands with Club, each at least 10 minutes apart. DCA: up to 24 runs/day, at least 1 hour apart.

**Notifications:**
- Scheduled agent commands can message you, e.g. "Send me a Telegram DM" from an app script. [VERIFIED] `:6462`
- "Response channels" can be toggled per platform (X, Farcaster, Telegram). [VERIFIED] `:1937`
- There is no documented dedicated alerts/notification-settings product. [INFERENCE from the docs index]

**Multilingual / voice:** [UNKNOWN] Neither is documented. Grep of the docs for "language"/"voice" found nothing product-relevant.

**Generative UI:** "Apps are mini-dashboards and tools you describe in plain English — Bankr writes the manifest, the scripts, and the UI for you". [VERIFIED] `bankr-llms.txt`

**Pricing** [VERIFIED] `:655-716`:
- Free: 5 messages/day on the terminal only.
- Bankr Club: $20/mo or $198/yr.
- Max Mode: pay-per-token for premium models.
- @bankrbot on X is silently ignored for non-Club users.
- Sponsored gas: "up to 10 transactions and $3 of gas per wallet per 24 hours" (`:206`).
- Token-launch swap fee: 1.75% all-in on Doppler launches (`:2907`).

**Praise / complaints** [REPORTED]:
- Reddit posts pitch it as "makes trading as easy as sending a text" (r/BASE, https://www.reddit.com/r/BASE/comments/1s2mbmh/bankr_on_base/). Only promotional posts were found.
- The main negative record is security: the 2026 Grok-to-Bankr prompt-injection drain and a 14-wallet compromise (https://cointelegraph.com/news/bankr-disables-transactions-after-14-wallets-hacked). Full details are in `failures-and-incidents.md`.

---

## 2. Telegram trading bots

Common shape [REPORTED] (https://cryptowatchdog.net/blog/are-telegram-trading-bots-safe-a-crypto-watchdog-investigation-2026-05-09):
- The bot generates a wallet and "its backend holds (or can access) the private key".
- ~1% fee per trade.
- Button keyboards instead of natural language.
- Built for speed: sniping, copy-trading, and MEV protection.

### Maestro (@MaestroSniperBot)

- **Chains:** Solana, TRON, TON, and EVM chains (BSC, Base, Ethereum, Monad, Sonic, Avalanche, Arbitrum, HyperEVM, Robinhood). No Arc. [VERIFIED] `maestro-llms-full.txt:1409`, `:1673`
- **Features:** auto-snipe; limit orders; copy trading (including copy-sell and an optional "Frontrun" of the copied wallet, `:1213`); signal auto-buy; multi-wallet disperse/collect; bridging; a "Trade Monitor" showing position PnL; a wallet tracker (`:3263`); a Telegram "Scraper" that detects contract addresses posted in groups. [VERIFIED] docs index
- **Safety:**
  - Anti-MEV "will route your auto-snipe through private relays" (`:836`).
  - A "Price Impact Alert" (default 20–25% for buys, 50% for sells) that "can be bypassed by manually forcing the trade through" (`:1663`).
  - An optional "Confirm Manual Buy" that asks for a second tap, but "does NOT interfere with Auto Buy" (`:1874-1876`).
  - Keys are "AES encrypted". Users get the private key and mnemonic in a DM and are told to write them on paper and delete the message (`:1517-1525`). [VERIFIED]
- **Multilingual:** a Language setting, "🇺🇸🇨🇳 Language — switch the bot's interface language". [VERIFIED] `:1810`
- **Pricing:**
  - 1% on every buy and sell. The fee accrues and is swept once it passes a per-chain minimum (`:1399`).
  - Premium is "$200 a month" (`:2788`).
  - Cashback rebates, and "25% lifetime commission" on referrals (`:2810`). [VERIFIED]
- **Incident:** October 2023 router exploit, 280 ETH (see `failures-and-incidents.md`).

### Banana Gun

- **Products:** Banana Pro (web), Banana Gun SOL (Telegram), Banana Gun EVM (Telegram). [VERIFIED] https://docs.bananagun.io/
- **Features:** "instant spot buys and sells, auto-sniping, limit orders, copy trading, and protection against rug pulls and MEV". [VERIFIED] `bananagun-llms-full.txt:5`
- **Fees:** "Manual buys and limit orders on Ethereum = 0.5%", "Autosniper on Ethereum = 1%", "Trades on other chains = 1%". Cashback is paid in $BANANA. [VERIFIED] `bananagun-llms-full.txt:63-67`
- **Custody:** the terms say "You are solely responsible for the safekeeping of the private key". [VERIFIED] `:391`
- **Incident:** September 2024 Telegram-oracle exploit, ~563 ETH (~$3M). After the relaunch, withdrawals had "2-hour transaction delays". [REPORTED] https://cointelegraph.com/news/banana-gun-crypto-bot-refunds-3m

### Unibot / Trojan

- **Unibot:** launched on Ethereum (Uniswap). Its new router was exploited on 31 Oct 2023 (~$640k). [REPORTED] https://revoke.cash/exploits/unibot
- **Current status:** [UNKNOWN] Searched for 2026 status and found nothing definitive.
- **Trojan:** described as "formerly Unibot on Solana". [REPORTED] https://medium.com/@geggonen/the-ultimate-guide-to-trojan-formerly-unibot-on-solana-feature-rich-telegram-trading-bot-7a6b3a3903b2
  - Fee: 1%, or 0.9% if referred. [REPORTED] https://coinspot.io/en/telegram-trading-bots/trojan/
  - Features: limit and DCA orders, copy trading, sniping, token audits. [REPORTED]
  - Modes: "Simple or Advanced". [REPORTED] (same source)
  - [INFERENCE] The two modes are a progressive-disclosure pattern worth copying: a beginner mode that hides advanced order types.

### BONKbot

- Solana-only Telegram bot. 1% per swap, no subscription. 10% of fees go to BONK DAO. Offers private-key export and anti-MEV modes. [REPORTED] https://solanabox.tools/tools/bonkbot, https://coinspot.io/en/telegram-trading-bots/bonkbot-solana-trading-bot/
- Complaint (Reddit r/solana): "Their trading fee is 1% per tx. So 2% for a buy/sell position. They put a super high fee". [REPORTED] https://www.reddit.com/r/solana/comments/1bi3w0d/

### GMGN, Photon

- **GMGN:**
  - 1% per successful trade. Anti-MEV requires "a priority fee of at least 0.002 SOL". [REPORTED] https://coincodecap.com/gmgn-review
  - Surfaces: web terminal, Telegram bots, and a mobile app. [REPORTED]
  - Telegram Alert Bot: follows wallets, filters by "all /only buy /only sell", and caps at 100 wallets on the web and 10 via `/add`. Docs warn that Telegram rate limits "may cause missed notifications". [VERIFIED] https://docs.gmgn.ai/index/wallet-alert-on-telegram
- **Photon:** flat 1% per buy and sell, "confirmed in its own GitBook documentation". [REPORTED] https://uwuu.ai/blog/photon-review (the GitBook at https://pies-organization.gitbook.io/photon-trading/photon-on-sol/photon-fees-sol was not fetched)
  - One source claims Photon "rebranded to Axiom"; this is unconfirmed and likely wrong. [UNKNOWN]

### Common complaints across Telegram bots [REPORTED]

- **Trust.** "What's stopping these Telegram trading bots from stealing..." (https://www.reddit.com/r/solana/comments/1ijrpy9/).
- **Fees on failed transactions.** Fees are charged "even if transactions fail" (https://cryptowatchdog.net/blog/are-telegram-trading-bots-safe-a-crypto-watchdog-investigation-2026-05-09).
- **Phishing that impersonates bots.** A fake "safeguard bot" asked a user to re-log into Telegram and drained the wallet (https://www.reddit.com/r/solana/comments/1hbj6hl/). A fake "BullX bot" drained 50 SOL (https://medium.com/@blog_crypto/axiom-trading-bot-telegram-b5a4da5fb4c1).
- **Refunds are voluntary.** Refunds after hacks were "discretionary goodwill, not a contractual or regulated guarantee" (CryptoWatchdog, above).

---

## 3. Farcaster / X social bots

- **Clanker (@clanker):** tag the bot on Farcaster with a token idea and it deploys the token on Base.
  - Farcaster acquired Clanker (announced 23 Oct 2025). Two-thirds of fees buy back CLANKER.
  - Reported "355K+ token launches and generated $34.4M in fees on Base".
  - [REPORTED] https://thedefiant.io/news/nfts-and-web3/farcaster-acquires-clanker-tokenbot, https://www.bankless.com/read/news/crypto-social-platform-farcaster-acquires-clanker-token-bot
  - Pattern: a one-sentence social command becomes an on-chain action, and the reply cast serves as the receipt.
- **Aethernet:** an autonomous Farcaster agent from the Higher community (2024).
  - It paid people through Bountycaster bounties and "Paybot". This worked "because each Farcaster account has a connected Ethereum address".
  - [REPORTED] https://www.bankless.com/farcaster-ai-agents-hub, https://farcaster.xyz/bountybot
  - Current activity: [UNKNOWN]
  - [INFERENCE] The social graph works as the address book: handle → verified address.
- **Grok + @bankrbot on X:** Grok's replies were treated as commands by Bankr. This is the root of the May 2026 drain (see failures file).

---

## 4. XMTP / Base App chat agents

- XMTP agents are "autonomous programs that can participate in secure, end-to-end encrypted conversations". [VERIFIED] https://docs.xmtp.org/agents/get-started/intro
  - Content types include "Onchain transactions", "Transaction references", "Actions", "Reactions", "Replies", "Attachments", "Markdown", and MLS group chats.
  - Base App is listed as a client: "Trade with friends in encrypted DMs and group chats with instant, fee-free payments".
- A Base docs page on chat agents (https://docs.base.org/base-app/agents/chat-agents) now returns unrelated content, and it is not in https://docs.base.org/llms.txt. [UNKNOWN] Whether Base App chat agents are still promoted.
- Example flows from the XMTP marketing pages: "split dinner $200 4 ways" in a group chat, and a travel agent booking a flight. [REPORTED] https://xmtp.org/digital-money
- [INFERENCE] The patterns are group-chat bill splitting and "Actions" (tappable buttons inside chat), a native form of generative UI.

---

## 5. Wallet-alert / notification bots

- **Cielo:**
  - Web app plus Telegram and Discord alert bots. Free tier: "Up to 250 wallets ... including 10 Solana wallets as well as 5 tokens and 5 lists".
  - Pro: 1,000 wallets, 2 Telegram bots, 2 Discord channels.
  - Whale: 10,000 wallets, 9 Telegram bots, 10 Discord channels, API.
  - Plans are billed for 1, 6, or 12 months by card, or 6 or 12 months in crypto.
  - [VERIFIED] `.firecrawl/product/cielo-subscribe.md`
  - Filters by transaction type, chain, and minimum USD. [REPORTED] https://solanabox.tools/tools/cielo-finance
  - A free-tier cap of "120 Telegram/Discord alerts per hr" was reported in 2024 (https://x.com/CieloFinance/status/1797188725803233790). [REPORTED]
- **GMGN Alert Bot:** see §2.
- **Zerion / DeBank:** Zerion offers mobile push notifications for tracked wallets and transaction webhooks in its API. [REPORTED] https://zerion.io/blog/how-to-create-real-time-ethereum-transaction-notifications-with-zerion-api/
  - An official Telegram alert bot from either company: [UNKNOWN] Searched and found none. Third parties (Cryptocurrency Alerting, Drops Bot) fill the gap. [REPORTED] https://cryptocurrencyalerting.com/wallet-watch.html?channel=telegram

---

## 6. Patterns worth copying, and ones to avoid ([INFERENCE] unless marked)

| Pattern | Seen in | Relevance to an Arc agent |
|---|---|---|
| Wallet-level daily and per-tx USD caps enforced at broadcast, not in the prompt | Bankr [VERIFIED] | High. USDC-denominated caps are trivial on Arc because gas is USDC. |
| Recipient allowlist with a cooldown for new entries | Bankr [VERIFIED] | High. It maps directly onto a "contacts" feature: a newly added contact is usable after N hours for large sends. |
| Time-boxed loosening of a safety control (10 min to 24 h, auto-revert) | Bankr [VERIFIED] | High. Good UX for "just this once". |
| Price-impact alert that can be force-bypassed | Maestro, Bankr [VERIFIED] | Medium. Relevant to Arc swaps once DEX liquidity exists. |
| Optional confirm-before-buy, off for automations | Maestro [VERIFIED] | Shows the tension: automations skip confirmation, so they need caps. |
| Send to @handle, with a claimable wallet auto-created for the recipient | Bankr [VERIFIED] | High. Useful for inviting a friend to Arc. |
| Scheduled "agent command" automations ("every day at 9am…") | Bankr [VERIFIED] | Exactly Abu's "every Tuesday send $10". Bankr caps and spaces runs. |
| Automations managed in chat plus a sidebar list | Bankr [VERIFIED] | High. |
| Interface language switch | Maestro [VERIFIED] | Matches Abu's multilingual ask. |
| Simple vs Advanced mode | Trojan [REPORTED] | Progressive disclosure. |
| Alert filters (type, chain, min USD), per-channel bots | Cielo, GMGN | Notification settings design. |
| Per-surface reply toggles | Bankr [VERIFIED] | For Telegram/Discord connections. |
| "We will never DM you first" plus an official-domain list | Bankr, Banana Gun (official links page) [VERIFIED] | Needed as soon as a Telegram presence exists. |
| Custodial hot keys delivered in a DM | Maestro [VERIFIED] | Avoid. |
| Treating another AI's public post as an authenticated command | Bankr + Grok [REPORTED] | Avoid. See failures file. |

## Gaps

- Bankr's Arc support was not exercised on-chain; the evidence is docs only.
- No app-store reviews were gathered for these bots; most are not in app stores.
- Reddit was reachable only through search snippets.
- Whether Unibot is still operating is [UNKNOWN].
