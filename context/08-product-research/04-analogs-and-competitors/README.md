# 04: Analogs and competitors (AI crypto agents, chat bots, fintech UX)

Purpose: the index and top 15 insights from the analog research, so the Arc agent learns from other ecosystems and misses no feature or UX pattern.

Sources: the five files in this folder, each with its own sources and tags. Raw evidence is in `.firecrawl/product/`.
Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| `ai-crypto-agents.md` | 25+ AI agents and agent wallets: status, features, confirmations, limits, pricing, and the "does anything target Arc?" check |
| `telegram-and-chat-bots.md` | Bankr in depth, the Telegram trading bots (Maestro, Banana Gun, Trojan, BONKbot, GMGN, Photon), Farcaster bots, XMTP, and alert bots (Cielo, GMGN) |
| `fintech-ux-analogs.md` | Venmo, Cash App/Moneybot, PayPal, Revolut AIR, Wise, Robinhood Cortex, Coinbase, Erica, Monzo, Klarna |
| `master-feature-inventory.md` | Every feature, in 12 groups, with who has it, its Arc relevance and priority, plus a whitespace list |
| `failures-and-incidents.md` | 20 cited incidents and research results, and an anti-pattern checklist |

## Top 15 insights

1. **Something already runs on Arc, but it is shallow.** Bankr's docs list Arc mainnet (chain 5042) for balances, USDC/ERC-20 transfers, raw transactions and token launches. They also say "No aggregator swaps yet (0x/Relay do not route Arc)" [VERIFIED docs only, no on-chain test] (`ai-crypto-agents.md` §0). Circle Agent Wallets support ARC, but only as a developer CLI [VERIFIED]. **The gap on Arc is depth (swap, bridge, yield, marketplace, automations, voice), not existence** [INFERENCE].
2. **Bankr is the reference product** and the best-documented one. It runs one agent across web, X, Telegram, Farcaster and CLI, with synced memory, scheduled "Agent Commands", limit/DCA/TWAP orders, and the strongest safety control set found. Bankr Club costs $20/mo [VERIFIED] (`telegram-and-chat-bots.md` §1).
3. **Put safety in code at the broadcast chokepoint, not in the prompt.** The benchmark is Bankr's controls:
   - $500 per transaction and $500 per day by default.
   - A pause-all switch.
   - A recipient allowlist with a 24h cooldown.
   - A 15% price-impact cap.
   - Fail-closed pricing.
   - Timers that loosen a control, then restore it automatically.
   - Passkey step-up for settings changes [VERIFIED].
   Bankr still suffered two drains in May 2026 [REPORTED] (`failures-and-incidents.md` B4, B5).
4. **Every money-moving assistant at a bank or broker executes through a pre-filled confirmation screen plus biometric approval, never straight from text.** This covers Robinhood Cortex [VERIFIED disclosure], Cash App Moneybot [REPORTED] and Revolut AIR [REPORTED]. The generative-UI confirmation card is the product's core.
5. **Prompt injection is real and has cost money.** Three incidents:
   - The Grok-to-Bankr Morse-code drain (~$150–200K, 4 May 2026). An NFT that someone else sent raised the agent's permission tier.
   - The Freysa game ($47K), won by redefining a tool's meaning.
   - The aixbt dashboard compromise (55.5 ETH).
   The rule: only the authenticated user can issue a money intent. Posts, other agents, web pages, memos and memory are data, never commands [REPORTED/INFERENCE] (`failures-and-incidents.md` §B).
6. **Memory is an attack surface.** Princeton showed memory injection beats prompt-injection defenses on ElizaOS [REPORTED]. Keep limits and allowlists in a typed settings store, not free-text memory. Bankr keeps rules like "never confirm trades under $50" in memory, which is exactly what that research attacks (`failures-and-incidents.md` C1).
7. **Contacts are whitespace.** No crypto agent found has a first-class address book or an "unknown name → add contact" flow. Bankr resolves handles and ENS names and keeps nicknames in memory [VERIFIED] (`ai-crypto-agents.md` §5).
   - Fintech shows what to add: Confirmation of Payee, which returns full, partial or no match (Wise [VERIFIED]); a first-time-recipient check (Venmo [REPORTED]); and one-time claim links that expire after 10 days (PayPal [VERIFIED]).
   - Address poisoning (a $50M loss, Dec 2025) makes contacts a safety feature: never pick recipients from transaction history.
8. **Voice is an open lane.** No documented crypto execution agent ships two-way voice. Robinhood Cortex has text-and-voice trading, but only on iOS and only for Gold subscribers [VERIFIED]. Erica has voice but is **English-only** [VERIFIED]. HeyElsa is the only crypto agent claiming multiple languages [REPORTED].
9. **Recurring payments need a fintech-grade lifecycle.** That means pause/resume and in-place editing (Robinhood [VERIFIED]), a reminder ~24h ahead and a change cutoff the day before (Venmo [VERIFIED]), a backup funding source, an explicit "skipped because…" notice, and a stated first-run rule. Coinbase runs the first buy immediately [VERIFIED]. Wise and Coinbase force cancel-and-recreate, which is the weak pattern.
10. **Automations skip interactive confirmation, so they need pre-approved envelopes**: a per-run cap, a per-day cap, a locked recipient, and frequency caps (Bankr: ≥10 min apart, DCA ≤24/day [VERIFIED]). Maestro's "Confirm Manual Buy" explicitly does not cover Auto Buy [VERIFIED].
11. **Notifications through Telegram and Discord are proven, but only in alert bots.** Cielo and GMGN offer filtered alerts by type, chain and minimum USD [VERIFIED/REPORTED]. No agent has a settings-page connector for this. GMGN warns that Telegram rate limits cause missed alerts, so in-app history must stay the source of truth. Make the bots **notify-only or propose-only**, because Banana Gun's $3M loss came through its Telegram message layer [REPORTED].
12. **Social payments are missing from crypto agents.** Request money, split bills (Venmo, Revolut), group pools (Cash App Pools: 1.7M users, 19% first-time connections [VERIFIED]) and scheduled requests (Venmo) all exist in fintech. In crypto, only XMTP marketing mentions them. The Base App's social push was also rolled back in 2026-09 [REPORTED], so position these as payments, not as a social network.
13. **One risk dial beats ten toggles.** MetaMask has Guard vs. Beast mode, Olas Pearl has Co-Pilot vs. Autonomous, and Trojan has Simple vs. Advanced [REPORTED]. Pair the dial with out-of-band step-up only when an action falls outside policy (MetaMask 2FA, Zerion review threshold, Circle email OTP [VERIFIED for Circle]).
14. **Churn is high among DeFAI apps.** Dawn was sunset in June 2025, Slate's domain was repurposed, Brian's SDK has been stale since Jan 2025, Orbit pivoted to B2B, and the Base App rebrand was reverted. Token-gated survivors (Griffain, Wayfinder, HeyAnon) are speculative [REPORTED/INFERENCE]. Trust signals (explainability logs like Giza Thoughts, plain-language simulation like Rabby) matter more than breadth.
15. **Business model.** A subscription that gates the agent is the proven model: Bankr $20/mo, Surf $14.99–39.99/mo, and Robinhood Gold with Cortex as a perk. The ~1% per-trade fee used by Telegram bots is the most complained-about model [VERIFIED/REPORTED]. x402 marketplaces need a per-call max, a session budget and duplicate-settlement checks, because a 2026 paper and a facilitator audit found flaws [REPORTED] (`failures-and-incidents.md` §D).

## Gaps across this folder

- No app-store or Reddit reviews were found for Bankr, HeyElsa, HeyAnon or Griffain beyond promotional posts.
- Bankr's Arc support is docs-only. No `eth_getCode` was run on a Bankr Arc contract.
- Help pages for Revolut, Klarna and parts of Cash App returned 403, so those claims are [REPORTED] from snippets.
- The official total loss for Bankr's 20 May 2026 incident is [UNKNOWN].
