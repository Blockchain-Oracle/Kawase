# canton-season3: what transfers to Tameion

Purpose: a short note on Abu's concurrent HackCanton Season 3 build. It covers only what carries over to Tameion (library conventions, workflow, judging-playbook ideas, agent and treasury overlap) and the time conflict between the two deadlines.

Sources: `canton-season3/CLAUDE.md`, `context/README.md`, `context/06-prior-work/{sotto-retrospective.md, reusable-code-map.md, idea-graveyard.md}`, `context/00-hackathon/{s3-judging-playbook.md, calendar.md}`, `context/05-community/ai-agents-on-canton.md`, `kawase/.firecrawl/tameion.md:143,737-739`.
Verified: 2026-09-29

---

## What it is (one paragraph)

**HackCanton League Season 3** is run by AppsFactory/NODERS on the Canton Network.
- Direction locked 2026-09-16: a **prediction market in Daml, Track 2 (Financial Applications)**. It is rebuilt from Abu's reference products Yosuku, Masayume and Stocklana.
- It also targets the BitSafe decentralization challenge and the Grofty wallet bounty (`canton-season3/CLAUDE.md:3`).
- Tech: Daml / JSON Ledger API v2 / Next.js. None of the Canton or Daml code is portable to Arc or EVM.

## Time conflict (important)

| | HackCanton S3 | Tameion |
|---|---|---|
| Build window | 2026-09-18 → **2026-10-09 23:59 UTC** ("final, no extensions") | 2026-09-27 → **2026-10-10 11:59 PM ET** (= 2026-10-11 03:59 UTC) |
| After the deadline | Closing 10-10 12:00 UTC. Async judging 10-10 → 10-18. Finalists 10-19. **Live Grand Final 10-21 14:00 UTC** | None stated beyond submission |
| Hidden gates | 1,000 Mana burned (≥10 active days), journal entries, prior-work disclosure | Traction questions (businesses onboarded, value moved) |

Sources: `canton-season3/context/00-hackathon/calendar.md` "Official dates", `kawase/.firecrawl/tameion.md:139-143`.

What this means in practice:
- The two submissions land **about 28 hours apart**. Canton comes first.
- The Canton playbook schedules "feature-complete Oct 5" and "deck + video Oct 7" (`s3-judging-playbook.md` evidence map). The final week of Tameion therefore collides with Canton's polish week.
- Tameion's 30% traction weight needs *real businesses onboarded during the event*. That outreach work has to start in week 1 (Sep 29 to Oct 3), not in the final days.
- Recommendation:
  - Freeze Tameion scope by about Oct 2.
  - Put Oct 6–9 on Canton submission.
  - Put Oct 10 (ET) on the Tameion video, README and submission.
  - Keep the daily Canton Mana/journal habit running in parallel. It is cheap.
- If a Canton finalist slot comes (Oct 19–21), it does not conflict with Tameion.

## Transferable conventions (the context-library pattern)

- **A numbered `context/` knowledge base with a router `CLAUDE.md`.**
  - Layout: `00-hackathon`, `01-winners`, `02-core`, `03-sdks-tools`, `04-repos`, `05-community`, `06-prior-work`, `07-ecosystem`, and so on.
  - The router file gives a "Read in this order" list and a "Route by question" table (`canton-season3/context/README.md` "Route by question").
  - Tameion's `context/` mirrors this. Keep a similar route-by-question table in the top-level README.
- **Every non-obvious claim cites a path or URL**, and hackathon rules are quoted verbatim, never paraphrased (`canton-season3/CLAUDE.md` "Rules for agents").
- **Scrapes and clones are read-only reference.** Raw scrapes live in `.firecrawl/` and are the source of truth for rules. Clones live in `refs/`, which is gitignored and refreshed with a script.
- **A licence and provenance check before copying third-party code.** Several Canton community repos had no licence or were AGPL (`context/README.md` "Known caveats"). Apply the same check to circlefin sample apps.
- **Never write credentials into context docs** (explicit rule there, repeated here).

## Transferable workflow lessons (from the Sotto retrospective)

Sotto was Abu's Encode "Build on Canton" entry (Jun–Jul 2026). It did not place. Its lessons map directly onto Tameion (`context/06-prior-work/sotto-retrospective.md` "Ten hard-won lessons"):

1. **Lock the idea by day 3, and never pivot after halfway.** Sotto's x402 pivot with 7 days left produced a product judges could not try.
2. **Judges score what they can click without setup.** Pre-seed roles, one button, visible result. For Tameion: a hosted demo business with a pre-funded testnet treasury, so no wallet install or faucet is needed.
3. **Check crowded categories first.** Tameion's RFBs come with named prior art. Read `context/05-canteen-ecosystem/` before choosing.
4. **One repo, one product, one story.** No archive repos, no renames. Do not open with "what we do not claim"; put honest limits lower down.
5. **Cap the process.** Sotto lost days to spec, stories, surface map, designer brief and decision registers that no judge saw. Arc Copilot repeated this: 7 decision records in 11 days and a rebuild 4 days before submission (see `arc-agent-lessons.md` §H). For a 2-week event: one-page spec, then build.
6. **Copy the winners' evidence style.** Give judges a command anyone can run, a matrix of who sees what (on Arc: what the agent can and cannot do), and IDs or tx hashes in the UI.
7. **Decide custody and signing in week 1.** Sotto burned a week on a late signer service. On Arc, decide Circle dev-controlled wallets vs smart-session keys on day 1.
8. **Push daily.** Arc Copilot's remote was 4 days behind its final local work.

## Judging-playbook ideas that transfer

From `canton-season3/context/00-hackathon/s3-judging-playbook.md`:
- **An evidence map by date** (criterion → artifact → where → target date). Build the same table for Tameion's four criteria: agentic sophistication 30, traction 30, Circle tools 20, innovation 20.
- **Deck outline slide 9: "What was built during the event, plus prior-work disclosure."** Tameion judges only the delta, so this slide is mandatory there as well.
- **Tag the start commit.** The Canton calendar says "Tag the start commit `hackcanton-s3-start`" on day 1 (`calendar.md` Sep 18 row). Do the same for Tameion (`tameion-start`). See `README.md` "Delta rule".
- **The journal as evidence.** Canton judges read a daily journal. Tameion has none, but a public `JOURNAL.md` or changelog with dated progress and traction numbers (businesses onboarded, USDC moved) serves the same purpose for the delta story.
- **Validation evidence** (interviews, metrics) is scored on Canton's business criteria. It maps onto Tameion's traction questions: how many businesses, how much value moved, what problems were solved.

## Agent and treasury overlap

- `context/05-community/ai-agents-on-canton.md` §1 is a useful **taxonomy of agent-authority patterns**. It is chain-agnostic:
  - A: read-only MCP.
  - B: the agent holds its own key, and limits are enforced client-side, so they can be bypassed.
  - C: the agent asks and a human wallet signs.
  - D: the agent has narrow delegated authority enforced **in the contract**.
  - E: an offchain pipeline mirrors state.
  - "Only pattern D survives a compromised or prompt-injected agent."
  - This is exactly Tameion RFB 4's "limits enforced in the contract rather than the prompt". On Arc, pattern D means a smart-session policy or a custom policy contract (see `arc-agent-reusable-code-map.md` §2 and §5).
- The idea graveyard (`context/06-prior-work/idea-graveyard.md:16,25,55,76`) lists unbuilt treasury-adjacent ideas: Vault Cards or governed treasury, Private Treasury Netting, Confidential business treasury. It also records that "generic agent wallet spend limits" were **rejected as a differentiator**, because process-local caps already exist in MCP tools. That lesson applies to Tameion: client-side caps are table stakes, and only enforced limits differentiate.
- Sotto's x402 work (`context/06-prior-work/sotto-retrospective.md` "Product 2") produced patterns worth reusing for Arc x402 or nanopayment agent purchases (RFB 4 "buys the API credits"):
  - Recompute the prepared hash before signing.
  - Reconcile to a terminal state ("absence is non-terminal").
  - Record "settled-undelivered" honestly.
- The Canton code itself (JSON Ledger API client, Daml) does **not** transfer.
