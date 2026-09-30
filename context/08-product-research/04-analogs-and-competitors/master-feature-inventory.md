# Master feature inventory: every feature and UX pattern seen across analogs

Purpose: a single deduplicated list of every feature found in the AI crypto agents, chat bots and fintech apps researched here. It is grouped by area, says which products have each feature, and notes its relevance to the Arc agent, so nothing gets missed.

Sources (evidence and tags live in the sibling files; this file only aggregates them):
- `ai-crypto-agents.md`: Bankr, HeyElsa, HeyAnon, Griffain, Wayfinder, Slate, Dawn, Brian, Orbit, Giza, Olas Pearl, Almanak, MetaMask Agent Wallet, Coinbase for Agents/Base MCP/AgentKit/x402, Trust Wallet AI, Binance Agent OS, Zerion, Phantom, Rabby, Circle Agent Wallets, Surf, Venice, Virtuals, Spectral
- `telegram-and-chat-bots.md`: Bankr (full docs), Maestro, Banana Gun, Unibot/Trojan, BONKbot, GMGN, Photon, Clanker, Aethernet, XMTP/Base App, Cielo, Zerion alerts
- `fintech-ux-analogs.md`: Venmo, Cash App (Moneybot), PayPal, Revolut (AIR), Wise, Robinhood (Cortex), Coinbase, BofA Erica, Monzo, Klarna
- `failures-and-incidents.md`: incident-derived requirements
- Arc and Circle constraints: `context/07-prior-work/arc-agent-lessons.md` (items cited by number)

Verified: 2026-09-29

How to read this file:
- The "Seen in" column carries the strongest tag found in the source file. **V** = [VERIFIED] (primary docs checked), **R** = [REPORTED].
- The "Arc relevance" column is [INFERENCE] unless it cites a source.
- The priority (**P0** = must have for a credible demo, **P1** = strong differentiator, **P2** = later) is [INFERENCE].
- A ★ marks features Abu has not explicitly asked for (see `RESEARCH-RULES.md` "The product being researched").

---

## 1. Money movement

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Send tokens by chat ("send 50 USDC to X") | Bankr V, HeyElsa R, HeyAnon R, Trust Wallet AI R, Dawn R (defunct), Erica (Zelle) V | P0. Gas is paid in USDC on Arc, so there is no separate gas-token UX. Pay through the 6-dec ERC-20 view, not native value (`arc-agent-lessons.md` items 1–2). |
| Send to a social handle (@X, @Farcaster, @Telegram) or ENS | Bankr V, Aethernet R, Cash App $Cashtag V, Revolut Revtag R, Venmo @username R | P1. Arc has no handle registry [INFERENCE], so the app's own contact book is the resolver. |
| ★ Claimable wallet or claim link for a recipient with no wallet | Bankr (auto-created wallet for an X/Farcaster handle) V; PayPal one-time links (expire after 10 days, remind or cancel) V | P1. The strongest "invite a friend to Arc" growth loop. |
| Request money, with a pending list and remind/cancel | Venmo V, Revolut R, Erica (Zelle request) V | P1. Not seen in any crypto agent: a gap. |
| ★ Split a bill (even or custom), groups | Venmo split/Groups V/R, Revolut R, Cash App Pools V, XMTP "split dinner $200 4 ways" R | P1. Not in any shipped crypto agent. |
| ★ Scheduled recurring *requests* (e.g. rent) | Venmo V | P2 |
| Bridge / cross-chain | Bankr (Relay) V, HeyElsa R, HeyAnon R, Circle Agent Wallets (CCTP) V, Maestro V | P0 for "whole Arc". Use CCTP/Gateway via App Kit (`arc-agent-lessons.md` 13, 21–23). |
| Compare bridge routes or aggregators for the cheapest fee | No product found that shows a comparison to the user [UNKNOWN] | P1 differentiator (Abu's ask). |
| ★ Auto-fund a shortfall (swap from stables when the named token is short) | Bankr V; fintech backup funding source: Venmo V, Robinhood V | P1. On Arc: if EURC is short, swap from USDC. |
| Multi-wallet disperse and collect | Maestro V | P2 |
| Pay per HTTP request (x402) and marketplace | Bankr x402 Cloud V, Coinbase for Agents R, HeyElsa R, Venice R, Circle Agent Stack V | P1 for Arc's "marketplace". Needs per-call caps (see §9). |

## 2. Trading

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Swap by chat | Bankr V (not on Arc: "No aggregator swaps yet"), HeyElsa R, HeyAnon R, Trust Wallet AI R, MetaMask Agent Wallet R, Base MCP R | P0. App Kit swap works on Arc testnet for USDC, EURC and cirBTC only (`arc-agent-lessons.md` 15). **This is Bankr's gap on Arc.** |
| Limit and stop orders (including trailing) | Bankr V, Maestro V, Banana Gun V, Trojan R, HeyElsa R, TWAK R, Coinbase V, Cash App Custom Orders V | P1 |
| ★ Funds reserved at order placement, with an expiry | Cash App V, Coinbase GTD/GTT V | P1. Avoids "order fired but no balance". |
| DCA / recurring buy | Bankr V, Trojan R, TWAK R, Coinbase V, Robinhood V, Cash App Auto Invest V | P0 (the same engine as recurring sends) |
| TWAP | Bankr V, Coinbase V | P2 |
| FX-style auto-convert "at target or better" | Wise V | P1. Maps to USDC↔EURC on Arc. |
| Price-impact / slippage guard (overridable) | Bankr (15%) V, Maestro (20–25% buy) V, Coinbase protection point V | P0 |
| Copy-trading, sniping, anti-MEV private relays | Maestro V, Banana Gun V, Trojan R, GMGN R | P2. Degen feature; relevant only if Arc meme-token markets grow. |
| Token launch from chat | Bankr (live on Arc mainnet: Uniswap v3 1% pool, 70/30 fee split) V, Clanker R | P2. It already exists on Arc via Bankr. |
| ★ Token risk signals (look-alike, honeypot, low liquidity) | Trust Wallet AI R, Banana Gun (anti-rug) V | P1 if meme tokens are in scope (Abu's ask). |
| Perps, prediction markets, tokenized stocks | Bankr V, MetaMask R, Wayfinder R | Out of scope for Arc now [INFERENCE]. |

## 3. Yield

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Deposit to lending / yield from chat | HeyAnon R, HeyElsa (yield scanning) R, Base MCP (Morpho, Moonwell) R, Dawn R | P1. Depends on which yield venues are live on Arc (see the other 08-research folders). |
| Autonomous yield optimizer (deposit once, agent rebalances) | Giza Agent R, Olas Pearl R, Almanak R, Orbit R | P2 |
| ★ Daily plain-language "what I did and why" log | Giza Thoughts R | P1. Cheap to build and builds trust. |
| ★ Co-Pilot vs. Autonomous mode | Olas Pearl R | P1 (see §9, risk dial) |
| ★ User constraints (exclude protocols, concentration caps) | Giza R, Griffain (per-agent approved protocols) R | P2 |

## 4. Automation

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Recurring transfer ("every Tuesday send $10 to Alex") | Venmo V, Wise V, Revolut R; Bankr via Agent Command V | P0 (Abu's headline ask) |
| Schedule *any* prompt ("every day 9am check ETH and message me") | Bankr Agent Command V | P1 |
| Manage automations by chat ("show/cancel my automations") **and** a list UI | Bankr V | P0 |
| Pause, resume, edit in place | Robinhood V, Bankr (sidebar) V; not Wise/Coinbase (cancel-and-recreate) V | P0 |
| ★ Reminder about 24h before a run, and a change cutoff the day before | Venmo V, Wise V | P1 |
| ★ An explicit "skipped because…" reason | Robinhood V | P0. The failure-state UX for automations. |
| ★ A clear first-run rule (runs now vs. next occurrence) | Coinbase runs the first buy immediately V | P0. State it on the confirmation card. |
| ★ End date or run count | Venmo V | P1 |
| ★ Frequency caps (min interval, max runs per day) | Bankr (10 min; DCA ≥1h, ≤24/day) V | P0 (safety) |
| Conditional automation (price, balance, or event trigger → action) | Bankr (limit/stop) V, Wise auto-convert V, Coinbase alerts (notify only) V | P1 |
| ★ Dry-run or simulate a new automation first | HeyElsa x402 dry-run default R | P1 |
| Execution rules for automations: they skip interactive confirmation, so they need pre-approved caps | Maestro ("Confirm Manual Buy" doesn't affect Auto Buy) V | P0 design rule |

## 5. Contacts and social

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Address book with names | Fintech apps (payees) V; **no crypto agent has a first-class one** (Bankr only keeps nicknames in memory V) | P0 and a **clear gap**. Abu's "I don't have Alex's address → add contact" pop-up is not shipped anywhere found. |
| Recent recipients, QR, phone | Venmo R, Revolut R | P1 |
| ★ Confirmation of Payee (full / partial / no match) | Wise V, Monzo R | P1. Adapted: name vs. contact, address prefix/suffix check. |
| ★ First-time recipient check (e.g. last 4 digits of phone) | Venmo R | P2 |
| ★ Recipient allowlist with a **24h cooldown** for new entries | Bankr V, Circle Agent Wallets allowlist V | P0 for large or automated sends |
| ★ Social graph as the address book (handle → verified address) | Aethernet/Farcaster R, Bankr V | P2 |
| Group chats with the agent (split and trade with friends) | XMTP / Base App R (Base App rebranded back to Coinbase Wallet in 2026-09 after the social push fell short R) | P2. A warning: social-in-wallet did not stick. |

## 6. Notifications

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Push, in-app and email with a user-chosen channel and frequency | Coinbase price alerts V, Venmo V, Wise R | P0 |
| Telegram and Discord alert delivery | Cielo (bots per plan) V, GMGN V, Bankr (Telegram DM from scripts) V | P1 (Abu's ask). No crypto *agent* has a settings-page "connect Telegram/Discord" connector [UNKNOWN in `ai-crypto-agents.md` §5]. |
| ★ Alert filters (type, chain, min USD) | Cielo R, GMGN V | P1 |
| Price alerts, separate from orders | Coinbase V, Wise R, Robinhood Cortex V | P0 |
| Incoming-payment alerts | [INFERENCE] basic. On Arc, detect them via the EIP-7708 Transfer log (`arc-agent-lessons.md` 3). | P0 |
| ★ Per-channel reply on/off toggles | Bankr V | P1 |
| ★ Proactive insights (weekly spending snapshot, subscription price increases) | Erica V, Moneybot V, Revolut AIR V | P1 |
| ★ Audio digests of what moved and why | Robinhood Strategies V | P2. Pairs with voice. |
| Known limitation: Telegram rate limits cause missed alerts | GMGN docs V | P1. Keep in-app history as the source of truth. |

## 7. Voice and language

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Voice input or commands | Robinhood Cortex (text **and voice**, iOS, Gold) V, Erica V, HeyElsa R | P1. **No documented crypto execution agent ships two-way voice**: an open lane. |
| Two-way conversational voice | [UNKNOWN] Found in no crypto product | P1 differentiator (Abu's ask) |
| Multilingual chat | HeyElsa (7 languages) R | P1. **Erica is English-only** V. |
| App or interface language switch | Maestro V, Revolut (~24 UI languages) R | P1 |

## 8. UI/UX and generative UI

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Chat → **pre-filled deterministic confirmation card** → approve | Robinhood Cortex V, Moneybot R, Revolut AIR R, Trust Wallet AI R, Slate R | P0. This is the core generative-UI card. |
| ★ Show the multi-step route before confirming | Slate R | P0 for bridge and swap cards |
| ★ Plain-language pre-sign simulation ("what happens to your assets") | Rabby R, MetaMask Agent Wallet R | P1 |
| Tappable in-chat actions (buttons) | XMTP "Actions" V, Telegram bots (button keyboards) R | P0 |
| User-described mini-apps and dashboards (generated UI) | Bankr Apps V | P2 |
| ★ Simple vs. Advanced mode | Trojan R | P1 |
| ★ ASK (fast) vs. RESEARCH (deep report) modes | Surf R | P2 |
| One agent across web, mobile, Telegram and X with synced state and memory | Bankr V | P1. Abu wants mobile and desktop. |
| ★ Durable, user-editable memory (preferences) | Bankr V | P1, **but never for payment rules** (see §9 and failures C1). |
| Conversation history | [INFERENCE] universal | P0 |
| ★ Handoff to human support with conversation context | Robinhood Cortex V, Klarna (re-hired humans) R | P2 |

## 9. Safety and limits

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Per-transaction and daily USD caps enforced **in code at broadcast** | Bankr ($500/$500) V, MetaMask Guard R, Circle policies V, Coinbase for Agents R | P0. Trivial on Arc because everything is USDC-denominated. |
| ★ Rolling-window limits (7 days) | Venmo V | P1 |
| ★ Pause-all kill switch | Bankr V | P0 |
| ★ Loosen a limit for 10 min–24h, then auto-restore | Bankr V | P1 |
| ★ Step-up approval out of band (passkey, mobile push, email OTP) only when outside policy | MetaMask 2FA R, Zerion review threshold R, Circle email OTP V, Bankr passkey V | P0. Passkeys are login-only on Arc, since P256VERIFY is missing (`arc-agent-lessons.md` 9). |
| ★ One risk dial: Guard vs. Beast, Co-Pilot vs. Autonomous | MetaMask R, Olas Pearl R | P1 |
| ★ Fail closed when pricing or quotes are unavailable | Bankr V | P0 |
| ★ Numbers in error messages ("spent $410, this tx $120, limit $500") | Bankr V | P0 |
| ★ Idempotent spend counter (keyed on tx hash) | Bankr V | P0. Also covers Circle 500 retries (`arc-agent-lessons.md` 20). |
| ★ Isolated sub-account for the agent | Coinbase for Agents R, TWAK R | P1 |
| ★ Scam-intervention questionnaire on a risky pattern | Revolut R, Monzo V | P1 |
| ★ Trusted-contact review, known location, offline QR for large sends | Monzo V | P2 |
| Content from social posts, websites or other agents treated as data, never commands | Lesson from failures B3–B5, B7 | P0 |
| ★ x402 per-call max price, session budget, confirm modal (URL + max USD), rate limit | Bankr (10 calls/min) V, Base docs guide R | P0 if the marketplace is in scope |
| Exact-amount approvals only (no infinite approvals) | Lesson from failures A1, A2, B6 | P0 |
| Warning that on-chain transfers are irreversible | Wise CoP copy V; Venmo complaints R | P0 |

## 10. Onboarding and custody

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Embedded wallet, social or email login, non-exportable keys | Bankr (Privy) V | P0 option. Circle wallets are another; prior work rejected them (`context/07-prior-work/arc-agent-overview.md` "Custody"). |
| ★ Launch with read-only insights first, then add actions | Robinhood 2025→2026 V, Moneybot limited release V | A roadmap pattern |
| Free tier with a message cap and paid unlock | Bankr (5 msgs/day free) V | Note: Bankr silently ignores free users on X, a UX dead end V |
| Desktop app | Olas Pearl (desktop only) R | Abu wants mobile and desktop |
| Anti-impersonation: official handles, "we never DM first" | Bankr V, Banana Gun V | P1 as soon as Telegram or Discord bots exist |
| Google/Apple recovery | Olas Pearl R | P1 |

## 11. History and reporting

| Feature | Seen in | Arc relevance / priority |
|---|---|---|
| Portfolio and PnL | Bankr V, Maestro Trade Monitor V, Zerion R | P1 |
| Spending insights by category, natural-language search of history | Erica V, Revolut AIR V, Moneybot V | P1 |
| ★ "Why did this move" digest | Robinhood Cortex R | P2 |
| ★ Paid-call (x402) history | Lesson from failures D1 | P1 if the marketplace is in scope |
| Receipts and export | [UNKNOWN] Not researched in depth | P2 (tax and accounting) |

## 12. Business model and business features

| Feature | Seen in | Arc relevance |
|---|---|---|
| Subscription | Bankr Club $20/mo V, Surf $14.99–39.99/mo R, Robinhood Gold (Cortex is a perk) R, Maestro Premium $200/mo V | Gate automations and voice behind a tier [INFERENCE]. |
| Per-trade fee ~1% | Maestro V, Banana Gun 0.5–1% V, BONKbot R, Trojan R, GMGN R, Photon R | A top complaint ("super high fee", fees charged on failed transactions) R |
| Token-launch fee share | Bankr 70/30 on Arc V, Clanker R | — |
| Token-gated access | Wayfinder (PROMPT stake) R, Griffain R, HeyAnon R | Avoid: the Grok/Bankr drain escalated through an NFT-gated tier (failures B4). |
| Selling agent APIs over x402 | HeyElsa R, Bankr x402 Cloud V | Arc marketplace angle |
| Business or treasury accounts (AP/AR, invoices) | Orbit (pivoted to treasury) R, Almanak (vaults) R | Out of the consumer scope. Prior work had none (`arc-agent-overview.md`). |

---

## Features not found in *any* shipped crypto agent (whitespace) [INFERENCE from the three source files]

1. A first-class contact book with an "unknown name → add contact" flow.
2. Two-way conversational voice that can move money.
3. Multilingual voice (Erica is English-only; only HeyElsa claims languages, and that is unverified).
4. A settings-page connector for Telegram/Discord notifications on user-defined events.
5. Request money, split bills and scheduled requests inside a crypto agent.
6. A bridge-route cost comparison shown to the user.
7. Fintech-grade recurring lifecycle (pause, skip, edit, reminder, "skipped because…") for on-chain transfers.
8. Any agent that covers swap, bridge, yield and the x402 marketplace **on Arc**. Bankr covers only transfers and token launches there (`ai-crypto-agents.md` §0).
