# Judging criteria, traction, and submission

Purpose: exactly how entries are judged and what the submission must contain, plus the organizers' traction guidance from the kickoff.
Sources: `.firecrawl/tameion.md` §07 "How we judge", §09 FAQ; `.firecrawl/kickoff-slides.txt`
Verified: 2026-09-29

## Weights

| Weight | Criterion | Organizer wording |
|---|---|---|
| **30%** | Agentic Sophistication | "How much does the AI actually decide versus just automate? An agent that chooses when to pay, and can explain why, beats a cron job with a language model bolted on." |
| **30%** | Traction | "Genuine usage during the event window: real businesses, payments actually flowing in USDC, volume you can point to. Invoices processed, contractors paid, funds under management. **Test USDC counts.** Real customers transacting in real USDC on mainnet count more. Great founders ship and get users in two weeks." |
| **20%** | Circle tool usage | "Creative, effective use of the platform: Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, Contracts, USDC and EURC." |
| **20%** | Innovation | "Novel approaches, emergent behavior, research insight. New territory beats polished re-runs." |

> "These weightings are recommendations. Judges have the final say, and the best projects tend to break the rules."

## Traction: what counts

- **A real business has to use it.** It can be small: "A freelancer chasing three invoices, a two-person agency paying contractors abroad, a small studio with an unused seat on six SaaS tools." **Your own company counts**, and so does an open-source project you maintain that has never had a way to take money in.
- **Doesn't count:** synthetic datasets. "If nobody's actual money is on the other side of the decision, the agent isn't being tested." Also: inflated follower counts on X (the slides say "completely disregard").
- **Mainnet > Testnet** (slides), but testnet USDC counts.
- **Existing projects:** judged on the *delta*, meaning new features and new businesses onboarded during Sep 27–Oct 10. Document your starting point (users, features) on day 1.

Kickoff traction advice (slides): define your ICP, then check your network and your network's network; talk to ICPs weekly (#momtest); use LinkedIn and events; "Explain what you've learned from users" (paulgraham.com/users.html); speed (patrickcollison.com/fast: Apollo 8, Eiffel Tower, JavaScript). "Leverage everything at your disposal": origami.chat, Lenny's MCP (youmind.com/blog/lenny-rachitsky-newsletter-dataset-mcp-server-ai), LinkedIn, Events. A slide titled "Traction. Outside the box" lists AirBnB, Shazam, DoorDash, Dropbox, Etsy (no further text in the export).

## Autonomy guidance (FAQ Q4)

> "An agent that asks permission for every payment is a form with extra steps. An agent that can move the entire treasury on its own judgment is not something anyone will run."

The good answers "put the limit somewhere the agent cannot reach":
- a **contract** that enforces the budget rather than a prompt that requests it,
- a **threshold** above which a human signs,
- a **complete record** it must produce afterwards (continuous audit, the *euthyna*).

"The person trusted with the money spends it freely, and every transaction is reviewed afterwards."

## Deliverables

| Item | Status | Notes |
|---|---|---|
| Public GitHub repo | **Required** | Judges read the code directly |
| Demo video < 3 min | **Required** | Loom, YouTube, or Vimeo |
| Live product URL | Encouraged | Judges click around hands-on without you there |
| Traction answers | Asked on form | Businesses onboarded, value moved, problems solved |
| Form | https://forms.gle/BBWrdfuircrKiG2i6 | **Oct 10, 11:59 PM ET**. Unlimited resubmits, so "submit early and often" |

**No live demo day.** Judging is async after the deadline.

## Self-scoring rubric (derived, for internal use)

| Criterion | Weak | Strong |
|---|---|---|
| Agentic | LLM summarizes; cron pays | Agent chooses *whether/when/how much* under uncertainty, explains why, escalates correctly, learns from outcomes |
| Traction | Seed script with fake invoices | Named businesses, on-chain tx hashes, before/after DPO/DSO or FUM, live metrics page |
| Circle tools | One USDC transfer | Wallets + Gateway/CCTP + Paymaster + Contracts-enforced policy + USYC/EURC, each doing real work |
| Innovation | Dashboard clone of arc-fintech | New mechanism (e.g. public receivables registry, second-degree exposure, per-day contractor pay, independent metering) |
