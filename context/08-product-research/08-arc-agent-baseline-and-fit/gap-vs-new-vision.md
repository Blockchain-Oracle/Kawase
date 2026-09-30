# Abu's new wishlist vs the two reference projects

Purpose: for each item Abu named for the new Arc agent, record whether arc-agent or keeperhub-copilot-v2 had it (built, designed only, or missing), plus items neither list covers. **arc-agent is not a baseline to extend**: Abu says it failed and its architecture was wrong (`what-was-learned.md`). "Built" below means "code existed once", not "reusable".

Sources:
- Abu's wishlist: `context/08-product-research/RESEARCH-RULES.md:8-18`
- arc-agent: `capability-catalogue.md`, `reference-ux-inventory.md`, `what-was-learned.md` (this folder) and the arc-agent paths cited there
- keeperhub-copilot-v2: `keeperhub-copilot-v2-review.md` (this folder) and the clone at `/Users/abu/dev/hackathon/tamion/refs/abu/keeperhub-copilot-v2`
- Arc and Circle today: `context/01-arc/*`, `context/02-circle-agent-stack/*`
- Tameion: `context/00-hackathon/rfbs.md`, `.firecrawl/tameion.md`

Verified: 2026-09-29

Legend: **Built** (code existed; for arc-agent, localhost and Arc Testnet only), **Partial**, **Designed only** (docs, no code), **Missing**. KH = keeperhub-copilot-v2, which has no Arc support at all (`lib/chains.ts:51-231`).

---

## 1. Wishlist item by item

| # | Abu's item | arc-agent | KH | What exists on Arc now | Notes |
|---|---|---|---|---|---|
| 1 | Transfers | **Built**: C01 pay, funded on testnet (`capability-catalogue.md` C01) | Built (non-Arc) | App Kit Send; Memo for references; Multicall3From for batches (`context/01-arc/app-kit.md:78`; `network-config.md:133-139`) | Batch/split (C02) and payment requests/QR (C03) were Deferred in arc-agent |
| 2 | Trades / swaps | **Built**: H02, USDC↔EURC only | Built via KeeperHub integrations (Uniswap, CoWSwap, Curve…), non-Arc (`lib/registry/generated/`) | App Kit Swap on Arc: USDC, EURC, cirBTC only (`context/01-arc/app-kit.md:86`) | Anything beyond those three tokens on Arc: [UNKNOWN] in the library |
| 3 | Bridging with cheapest-route comparison | **Partial**: I06 compares **CCTP vs Gateway** quotes only; the adapters were never funded (`capability-catalogue.md` I02–I06) | Missing | App Kit Bridge (CCTP), Unified Balance/Gateway (`context/01-arc/app-kit.md`) | **Comparing third-party bridge aggregators is Missing in both.** Which aggregators support Arc chain 5042 is not in the library [UNKNOWN] |
| 4 | Yield | **Missing** (H05 Deferred; USYC gated) | Built for Aave/Morpho/Yearn etc. on non-Arc chains | **App Kit Earn** vaults (USDC/EURC) on Arc; USYC allowlisted, $100k min on mainnet (`context/01-arc/stablecoins-fx-and-yield.md:46-47`) | New since arc-agent |
| 5 | Marketplace (x402 / agent marketplace) | **Missing** (K01–K05 Deferred) | Missing | 687 listings payable on Arc mainnet, 0 on testnet; Facilitator and Nanopayments (`context/02-circle-agent-stack/marketplace-and-discovery.md:54,63`) | Testnet demos need your own seller |
| 6 | Tokens and meme coins | **Missing** (M04 Deferred) | Missing | Circle Contracts ERC-20 templates; Arc Studio (testnet only) (`context/01-arc/deploying-contracts.md:136-155`) | Meme-coin launchpads/DEX liquidity on Arc: [UNKNOWN] |
| 7 | Wallets | **Built, wrongly**: server-derived EOA per owner; Circle Wallets rejected (`what-was-learned.md` §5) | KeeperHub org Turnkey wallet (third-party custody) | Circle Agent Wallets on `ARC` and `ARC-TESTNET` (`context/02-circle-agent-stack/agent-wallets.md:21`) | |
| 8 | Limits | **Partial**: protected floor (app logic only); Biconomy session limits proven in trials but not in the spending path (`CLAUDE.md:69-73,97-98` in arc-agent) | Shows KeeperHub's daily spend cap (read-only) (`lib/session/spend-cap.ts`) | Circle wallet limits: **mainnet only**, human OTP (`context/02-circle-agent-stack/guardrails-and-policies.md:7,28`) | On testnet the limit must be your own contract |
| 9 | Automations ("every Tuesday send $10 to this friend"), user-managed | **Built (local)**: recurring mandates E01–E03 with list/detail/pause/resume; notify-only monitors F01–F05; **trigger → money (F04) Missing** | Built: one sentence → workflow, six trigger types, saved off (`README.md:100`) | n/a (app-level scheduler) | |
| 10 | Voice, two-way natural conversation | **Built**: OpenAI Realtime speech-to-speech, barge-in, captions; speech cannot authorize (`reference-ux-inventory.md` §5) | Built: Realtime, same cards, cannot authorize | n/a | Small talk / greeting behaviour ("Hello, how's it going?") was not specified in either [UNKNOWN] |
| 11 | Multilingual, change the app language | **Partial**: voice follows the speaker; UI language settings (S36) Designed only; no i18n library in any `package.json` | **Built**: 13 locales via next-intl, user-chosen; machine translations | n/a | |
| 12 | Contacts ("send to Alex" → no address → pop-up to add) | **Partial**: versioned contacts as chat management cards (B01/B03); name→contact binding in code refuses with `unknown_contact` (`packages/application/src/contact-resolution.ts:28-35`); contacts pages S14–S16 Designed only | Missing (org wallet only) | n/a | The "add Alex" pop-up flow itself: not found in either [UNKNOWN] |
| 13 | Notifications to Telegram, Discord, etc. | **Partial**: in-app inbox, quiet hours, delivery retry; Telegram/email/push Designed only (S34, `product-surface-map.md:210`); Discord never mentioned | Missing as a user feature (KeeperHub has Telegram/Discord/Slack actions: `lib/registry/generated/{telegram,discord,slack}.ts`) | Indexer webhooks for "customer paid" (`context/01-arc/ecosystem-and-infrastructure.md:24`) | |
| 14 | Generative UI cards for bridge, swap, etc. | **Partial**: payment, swap, route comparison, Gateway, receipt cards; `packages/ui` registry is placeholders | **Built**: ~13 card kinds, degraded stub for unknowns | n/a | |
| 15 | Conversation history | **Built** (untracked route) | Built | n/a | |
| 16 | iOS, Android, desktop | **Missing**: responsive web only | **Missing**: responsive web, mobile bottom nav | n/a | Native shells and push are new work for both |

## 2. Items neither project covered, or covered only on paper

Each item is a suggestion [INFERENCE], with the reason it matters and where the need shows up.

| Item | Why | Where it comes from |
|---|---|---|
| Receive: address QR, payment request link | "Send" without "receive" is half a wallet | arc-agent C03 (Deferred); KH add-funds QR (`components/shell/funding/add-funds.tsx`) |
| Fiat on-ramp in the app | Mainnet has no faucet | App Kit Onramp (`context/01-arc/app-kit.md:172-174`); `context/01-arc/overview-and-architecture.md:111` |
| Incoming-payment alerts | Most common notification need | Arc EIP-7708 detection (`context/01-arc/transactions-memo-batching.md`); arc-agent observer (`context/07-prior-work/arc-agent-lessons.md` #3) |
| Address screening / scam warning before a first payment | RFB 2 "Screens a vendor's wallet address before paying it"; Circle Agent Wallet transfers are screened | `context/00-hackathon/rfbs.md:46`; `context/02-circle-agent-stack/README.md:46` |
| First-use / changed-address warning | Wrong-address loss is irreversible | arc-agent S16 (Designed only) |
| Decision log: what the agent did, why, what it cost | Tameion judges "an agent that … can explain why"; RFB 4 asks for it | `.firecrawl/tameion.md:600`; `context/00-hackathon/rfbs.md:99` |
| Shareable receipts | Social proof and support | KH `app/(app)/r/[token]` |
| Portfolio / balances across chains | Needed before bridging or yield decisions | arc-agent S17 (built then deleted); App Kit Unified Balance |
| Mainnet/testnet indicator and switch | Judges accept both; users must never confuse them | `context/00-hackathon/judging-and-submission.md:22` |
| Onboarding and first-run tutorial | Reviewers "click around without you in the room" | `.firecrawl/tameion.md:632`; KH `components/shell/onboarding/*` |
| Session/device management, revoke agent authority | Needed once an agent can spend | arc-agent S35 (partial) |
| Export and delete data | Privacy; arc-agent S37 Designed only | arc-agent S37 |
| Accessibility (captions, reduced motion, screen reader) | Voice-first apps need text parity | arc-agent state contract (`reference-ux-inventory.md` §4) |
| Business features on the same core: invoices, payroll/contractor payouts, vendor payments, budgets | Tameion's theme is a business's money | `context/00-hackathon/brief.md:9`; RFBs 1–4 (`hackathon-fit.md`) |

## 3. Summary [INFERENCE]

- Of Abu's 16 items, arc-agent had code for about 6 (transfers, swap, voice, history, recurring automations, partial cards), all Testnet-only and never deployed. KH had code for about 8, none on Arc.
- **Neither had**: bridge-aggregator comparison, Arc yield, marketplace purchases, token/meme features, Telegram/Discord delivery, the "add unknown contact" pop-up, native mobile/desktop.
- New on Arc since arc-agent: mainnet, Agent Wallets on mainnet, App Kit Earn and Onramp, a mainnet x402 marketplace. These make items 4, 5 and 7 buildable in ways they were not in August.

## Gaps

- I did not check which bridge aggregators, DEXs or launchpads support Arc mainnet; that belongs to a separate research file.
- "Built" for arc-agent is from code presence and its own handler registry, not from running it today.
