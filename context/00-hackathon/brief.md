# Tameion Agents Hackathon — brief

Purpose: the canonical facts about the event (who, when, what, prizes, rules, submission). Quote from here; do not paraphrase deadlines.
Sources: `.firecrawl/tameion.md` (https://tameion.thecanteenapp.com/), `.firecrawl/luma.md` (https://luma.com/ivroypr5), `.firecrawl/kickoff-slides.txt` (kickoff deck, Google Slides export)
Verified: 2026-09-29

## One line

**"AI agents that manage a business's money."** Treasury, invoices, contractors, autonomous operations, and the audit trail behind all of it. **Settled on Arc in USDC.**

## Key facts

| Field | Value |
|---|---|
| Name | Tameion Agents Hackathon (third in Canteen's builder series, after *Agora* and *Lepton*) |
| Host | **Canteen**, a research and technology firm (AI × crypto × payments, NYC). Organizer/DevRel: **Aljoša Makević** |
| Partners | **Circle** (NYSE: CRCL, issuer of USDC/EURC) and **Arc** (Circle's stablecoin-native EVM L1) |
| Dates | **Sun Sep 27 – Sat Oct 10, 2026** (Luma: Sep 27 8:00 AM → Oct 10 11:30 PM EDT) |
| Format | Online, 2 weeks, invite-only (≈369 registered on Luma as of Sep 29) |
| Prize pool | **$40k** in cash or equivalents |
| Deadline | **October 10, 11:59 PM ET** |
| Submit | https://forms.gle/BBWrdfuircrKiG2i6 (you can resubmit as often as you like) |
| Demo day | **None.** Judging is asynchronous after the deadline |

## Why it exists (the thesis)

- "A business's money is never one balance": cash idle across accounts and chains, AP/AR, contractors on milestones, subscriptions, and compliance questions on every counterparty. "Almost all of it is still decided by a person reading a spreadsheet on a Tuesday."
- The decisions are hard because there are **thousands of small, interdependent ones**, not because each is deep. That is agent-shaped work, but software could not hold and move money until now.
- **Arc changes that**: ~$0.01 fees paid in USDC (no volatile gas token), <500ms settlement, CCTP + Gateway give one balance across chains, and onchain FX handles USDC↔EURC.
- *Tameion* (ταμεῖον) is Greek for treasury, literally the room where the money was kept. The job is back: an agent managing a business's money on the owner's behalf.

## Prizes

| Tier | Amount |
|---|---|
| 1st place | $10k × 1 |
| 2nd place | $7.5k × 1 |
| 3rd place | $5k × 3 teams ($15k) |
| Standout teams | $7.5k shared across 10–12 teams (~$650–$750 each, unranked) |
| After the event | Funding, grant support, and partnership support (Canteen, Circle, Arc) for teams that keep building |

## Judging (full detail: `judging-and-submission.md`)

**30% Agentic Sophistication · 30% Traction · 20% Circle tool usage · 20% Innovation.** "We weigh agency and traction equally." These weightings are recommendations; the judges have the final say.

## Submission requirements

- **Public GitHub repo** — required. Judges read the repo directly.
- **Video demo under 3 minutes** — required (Loom, YouTube, or Vimeo).
- **Live product link** — optional but strongly encouraged. "Build for a reviewer who will click around without you in the room."
- **Traction questions** on the form: how many businesses you onboarded, how much value the agent moved, and what problems you solve for them.
- **Existing projects allowed**, but only the **delta** is judged: product *and* traction progress made during Tameion. State where you started.

## Get started checklist (from the page)

1. Register on Luma: https://luma.com/ivroypr5 with passphrase **DIRECTx42490** (public on the page). Enter your GitHub and Discord handles accurately, because that is how submissions are collated.
2. Join the Canteen Discord: https://discord.gg/rsVfYutFZg (the Luma page lists https://discord.gg/bDaEfsSqc8).
3. Join the Arc builder Discord: https://discord.com/invite/buildonarc. **Mention Canteen + Tameion** during onboarding. If you are rejected, ping **@kdrohan** in the Canteen Discord.
4. Install the ARC CLI: `uv tool install git+https://github.com/the-canteen-dev/ARC-cli` (the slides say `uv tool install arc-canteen`). It gives RPC access to a **Canteen-hosted Arc testnet**, with Arc repos and docs bundled as agent context. Docs: https://arc-node.thecanteenapp.com/. See `../05-canteen-ecosystem/arc-cli.md`.
5. Install the Circle CLI: `npm install -g @circle-fin/cli` (Node ≥ 20.18.2). It provides agent wallets, x402 payments, and crosschain USDC. See `../02-circle-agent-stack/`.
6. Read *Agents and Ledgers in 2026*: `../06-ledgers-and-prior-art/agents-and-ledgers.md`.
7. Submit: https://forms.gle/BBWrdfuircrKiG2i6.

## What they are looking for (FAQ Q1, in priority order)

1. It **runs on Arc**, with payments actually flowing in USDC (testnet or mainnet) on the Circle Agent Stack.
2. It is something you **genuinely care about and will keep building** after the two weeks.
3. It is **already in front of a business that uses it**, solving a real problem.

> "Build whatever you want, as long as it runs on Arc, you actually care about it, and a real business is already using it."

## Friends of Canteen (tools recommended by the organizers)

- **TestMint**: https://testmint.myproceeds.xyz, up to $10k testnet USDC via x402.
- **aomi**: https://aomi.dev, an "execution harness for onchain finance" (hosted a session and office hours).

See `../05-canteen-ecosystem/`.
