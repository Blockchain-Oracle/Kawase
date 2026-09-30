# Hackathon fit: an Arc "super app" agent against the Tameion rules

Purpose: an honest check of whether Abu's consumer Arc agent idea fits Tameion's rules and judging, how it could be framed, and the risks. Every judgment is tagged [INFERENCE] and tied to quoted rule text.

Sources:
- `.firecrawl/tameion.md` (https://tameion.thecanteenapp.com/, captured for this library), line numbers cited inline
- `context/00-hackathon/brief.md`, `rfbs.md`, `judging-and-submission.md`
- `context/02-circle-agent-stack/README.md`, `guardrails-and-policies.md`, `marketplace-and-discovery.md`
- `context/01-arc/app-kit.md`
- This folder: `capability-catalogue.md`, `what-was-learned.md`, `gap-vs-new-vision.md`, `keeperhub-copilot-v2-review.md`
- arc-agent `CLAUDE.md:76-79` (Circle Wallets rejection); `gh api repos/Blockchain-Oracle/arc-agent` (private)

Verified: 2026-09-29

---

## 1. The rules, quoted

**Theme.** "AI agents that manage a business's money." (`.firecrawl/tameion.md:13`)

**Judging weights** (`.firecrawl/tameion.md:594-618`):
- 30% Agentic Sophistication: "How much does the AI actually decide versus just automate? An agent that chooses when to pay, and can explain why, beats a cron job with a language model bolted on." (`:600`)
- 30% Traction: "Genuine usage during the event window: real businesses, payments actually flowing in USDC, volume you can point to. Invoices processed, contractors paid, funds under management. Test USDC counts. **Real customers transacting in real USDC on mainnet count more.**" (`:606`)
- 20% Circle tool usage: "Creative, effective use of the platform: Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, Contracts, USDC and EURC." (`:612`)
- 20% Innovation: "Novel approaches, emergent behavior, research insight. New territory beats polished re-runs." (`:618`)
- "These weightings are recommendations. Judges have the final say, and the best projects tend to break the rules." (`:594`)

**RFBs are not tracks.** "**No single focus this round**, and **these aren't tracks.** Build what you care about, or surprise us." (`:294`) "There's **no favored RFB this round** … a build that cuts across several of them is closer to what a real finance function looks like anyway." (`:687`)

**A real business.** "You need someone with real money problems, and they don't have to be large. A freelancer chasing three invoices, a two-person agency paying contractors abroad, a small studio … Your own company counts" (`:697`). "What doesn't count is a synthetic dataset. If nobody's actual money is on the other side of the decision, the agent isn't being tested." (`:699`)

**Autonomy.** "An agent that asks permission for every payment is a form with extra steps. An agent that can move the entire treasury on its own judgment is not something anyone will run." (`:709`) Good answers "put the limit somewhere the agent cannot reach: a contract that enforces the budget rather than a prompt that requests it, a threshold above which a human signs, a complete record it must produce afterwards." (`:711`)

**Delta rule.** "we judge the **delta**, not the whole project: what you shipped and who you reached _during_ Tameion. Where was the product and how many users did it have when Tameion began, and where are both at the end?" (`:737`) "New features built and new businesses onboarded during the program count; work that already existed when you started doesn't. So tell us where you left off" (`:739`).

**Deliverables.** Public GitHub repo (required), video under 3 minutes (required), live link (encouraged); "Judges read the repo directly … Build for a reviewer who will click around without you in the room." (`:632`). Deadline October 10, 11:59 PM ET (`context/00-hackathon/brief.md:21`).

## 2. Does a consumer "super app" agent fit?

| Criterion | As a pure consumer app | Why | Tag |
|---|---|---|---|
| Theme | Weak | The theme is "a business's money" (`:13`); a personal wallet with meme coins is off-theme | [INFERENCE] |
| Agentic 30% | Weak by default | A chat that turns commands into confirm cards is close to "a form with extra steps" (`:709`). Scoring needs the agent to *decide*: when to pay, which route, when to move idle funds, and explain why (`:600`) | [INFERENCE] |
| Traction 30% | Weak | Traction is "real businesses … invoices processed, contractors paid, funds under management" (`:606`). Consumer sign-ups are not named; follower counts are disregarded (`context/00-hackathon/judging-and-submission.md:21`) | [INFERENCE] |
| Circle tools 20% | Can be strong | A wallet super app naturally touches App Kit Send/Bridge/Swap/Unified Balance/Earn/Onramp, CCTP, Gateway, Wallets, USDC/EURC (`context/01-arc/app-kit.md:78`) | [INFERENCE] |
| Innovation 20% | At risk | Chat-plus-cards wallet copilots exist, including both of Abu's own reference projects; "New territory beats polished re-runs" (`:618`) | [INFERENCE] |

Conclusion [INFERENCE]: as a consumer super app it fits the rules ("Build whatever you want", `:660`) but scores poorly on 60% of the weight (agency and traction) unless it is used by real businesses.

## 3. How it could be framed without throwing away the wishlist

**Frame: an Autonomous Business Operator (RFB 4) for freelancers and very small businesses, on the same core as the consumer features.** [INFERENCE]

RFB 4 text: "Build an AI agent that operates the financial side of a business end to end: it receives and holds USDC, watches cash against upcoming obligations, decides when to pay a vendor or buy a service, moves funds when it needs to, and stays inside predefined budgets and approval limits." (`:413`) Its required demo: "receive revenue → assess available liquidity → purchase a service or pay an obligation → record the decision and the transaction → escalate to a human only when a policy threshold is reached." (`:434`)

How Abu's wishlist maps onto it [INFERENCE]:

| Wishlist item | Business framing | RFB touched |
|---|---|---|
| Transfers + contacts | Pay vendors and contractors from a vendor/contact book; screen a new address before the first payment | RFB 2 (`rfbs.md:46`), RFB 3, RFB 5 |
| Automations | Payroll and recurring vendor payouts ("every Friday pay the designer"), paid only if liquidity and policy allow | RFB 4, RFB 3 |
| Bridging with cheapest route | Agent picks the rail and explains the fee choice when a vendor wants USDC on another chain | RFB 4 ("moves funds when it needs to"), RFB 2 |
| Swaps | Pay a EUR invoice in EURC | RFB 2 (`rfbs.md:55`, library mapping) |
| Yield | Sweep idle operating cash to App Kit Earn or USYC, redeem before bills are due | RFB 1 (`rfbs.md:22`) |
| Marketplace (x402) | Agent buys API credits or data it needs, within budget | RFB 4 ("buys the API credits", `rfbs.md:105`) |
| Limits | Per-category budgets and an approval threshold enforced in a contract or wallet policy, not the prompt | RFB 4 (`:426`), FAQ Q4 (`:711`) |
| Notifications (Telegram/Discord) | "Escalate to a human only when a policy threshold is reached" | RFB 4 (`:434`) |
| History + generative UI | The decision log "recording what was done, why, and what it cost" | RFB 4 (`rfbs.md:99`) |
| Voice, multilingual | Owner talks to their operator; a two-person agency paying contractors abroad | FAQ Q3 example (`:697`) |
| Invoices (new) | Send an invoice with a Memo reference; match incoming USDC to it | RFB 2; `context/01-arc/transactions-memo-batching.md` |
| Meme coins / tokens | Off-theme for a business operator; keep out of the demo | [INFERENCE] |

The "cuts across several" line (`:687`) supports breadth, as long as the breadth is a business's finance function [INFERENCE].

Traction under this frame [INFERENCE]: Abu's own freelancing counts ("Your own company counts", `:697`); a few freelancers or small agencies paying contractors or receiving invoices in USDC during Sep 27–Oct 10 are the countable metric. Mainnet counts more (`:606`), and the Arc x402 marketplace only has listings on mainnet (`context/02-circle-agent-stack/marketplace-and-discovery.md:54,63`).

## 4. Circle tools (20%) and the arc-agent precedent

- arc-agent explicitly rejected Circle programmable wallets: "MetaMask, WalletConnect, 'connect your wallet' and Circle programmable wallets were all considered and are all NOT the decision" (arc-agent `CLAUDE.md:76-78`) [VERIFIED].
- Wallets lead the organizers' list of tools (`:612`). A new build that uses Circle Wallets or Agent Wallets, App Kit (Send, Bridge, Swap, Unified Balance, Earn, Onramp), CCTP/Gateway, Paymaster and Contracts "each doing real work" would score better than one that avoids them (`context/00-hackathon/judging-and-submission.md:56`, the library's own rubric) [INFERENCE].
- Constraint: Circle Agent Wallet spending policies are mainnet only and need a human email OTP (`context/02-circle-agent-stack/guardrails-and-policies.md:7,28`). On testnet, limits must live in your own contract, which RFB 4 explicitly rewards (`:426`) [VERIFIED rule; design choice is INFERENCE].

## 5. Risk: judges see it as a re-run of an existing project

- The delta rule judges only what was "shipped" and "who you reached _during_ Tameion" (`:737`), and asks you to "tell us where you left off" (`:739`) [VERIFIED].
- arc-agent is a private repo (`gh api`, 2026-09-29) with zero users, so judges cannot see it unless told [VERIFIED]. The rule still asks entrants to state their starting point, so the honest path is to disclose it [INFERENCE].
- Abu has decided arc-agent must not shape the new architecture. A fresh repo with no imported code keeps the delta equal to the whole project and removes the re-run question for product work [INFERENCE]. If any idea, doc or code is reused, say so in the README's "starting point" section (`context/07-prior-work/README.md:65-75` has a template) [INFERENCE].
- The innovation criterion is a separate risk: a chat wallet with cards resembles both arc-agent and keeperhub-copilot-v2, and many public copilots. What would be new is the *decisions* (liquidity-aware payouts, cheapest-rail choice with explanation, idle-cash sweeps under an on-chain budget), not the chat [INFERENCE].

## 6. Schedule risk

Today is 2026-09-29; submissions close 2026-10-10 11:59 PM ET (`context/00-hackathon/brief.md:21`). That is 12 days. arc-agent's failure pattern was breadth plus architecture churn with nothing deployed (`what-was-learned.md` §1–3). A 16-item super app plus native iOS/Android/desktop in 12 days repeats that risk [INFERENCE]. A narrow RFB 4 workflow that is deployed, used by a few real businesses, and then widened is closer to what the rules reward (`:434`, `:606`, `:632`) [INFERENCE].

## Gaps

- I have not asked the organizers whether a consumer-first app with a business mode is welcome; the FAQ says "Build whatever you want" (`:660`), so it is allowed, but how judges weigh it is [UNKNOWN].
- No Tameion judge feedback exists yet (judging is after the deadline).
