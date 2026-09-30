# Prompt for Codex — independent review of the Arc AI agent research

> Copy everything below the line into Codex, run from `/Users/abu/dev/hackathon/tamion`.

---

You are a senior engineer and product reviewer. Abu is about to build a product. Another AI agent (Claude) and its sub-agents have spent a long session researching it. Abu wants **your independent review** of that work before architecture planning starts.

## How to approach this

- **This is a review, not a re-do.** The research is done and documented with evidence. Do **not** repeat it from scratch. That would waste tokens, and Abu explicitly doesn't want it. Read, think, and **spot-check** the claims that matter most.
- **Be unbiased.** Claude's summaries and recommendations are one developer's opinion. Start from Abu's own words (below), judge the research against them, and form your own view. Agree where it's right, and say clearly where it's wrong, missing, or over-reaching. Don't disagree for its own sake.
- **Abu's two fears:** (1) made-up facts; (2) the wrong architecture. His previous project, Arc Copilot, failed for that reason.

## Read in this order

1. **`context/08-product-research/ABU-BRIEF-VERBATIM.md`**: everything Abu said, word for word. **This is the source of truth for what he wants.** Read it fully before anything written by Claude.
2. `context/08-product-research/DECISIONS-FROM-ABU.md`: Claude's distillation of those messages into decisions and open questions. Check it against the verbatim brief. Did Claude misread or drop anything?
3. `context/08-product-research/RESEARCH-RULES.md`: the evidence rules the research followed.
4. `context/08-product-research/00-SYNTHESIS.md`: Claude's cross-stream conclusions.
4b. `context/08-product-research/SMART-PRECONDITIONS.md`: Abu's "very smart" just-in-time setup requirement (Message 8), as a system with a blocker catalogue. Critique it: what blockers are missing, and is the pattern safe?
5. `context/08-product-research/FEATURE-INVENTORY.md`: the proposed feature surface.
6. `context/08-product-research/USER-FLOWS-INDEX.md`, and `07-automations-contacts-safety/user-flows.md` (flows F1–F16 in detail).
7. The research folders; start with each README and open detail files as needed:
   - `01-arc-ecosystem-census`: what exists on Arc
   - `02-defi-bridge-trade`: swaps, bridges, yield, meme trading, with live quotes
   - `03-wallets-custody-limits`: wallets, delegated authority, limits
   - `04-analogs-and-competitors`: other AI crypto agents, fintech UX, incidents
   - `05-voice-language-genui`: voice vendors, i18n, voice safety, generative UI, memory, LLMs
   - `06-mobile-desktop-platform`: Expo, desktop, store policy, backend jobs, notification channels
   - `07-automations-contacts-safety`: automations, contacts, limits, notifications, history, flows
   - `08-arc-agent-baseline-and-fit`: Abu's reference projects (lessons, **not templates**) and hackathon fit
   - `09-voice-decision`: voice stack recommendation and a review of keeperhub-copilot-v2's voice
   - `10-reference-flows`: product flows from Abu's Shijima and Agari repos (onboarding, faucets, friction removal)
8. Background, only if needed:
   - `context/README.md`: the hackathon, Arc, and Circle library
   - `context/00-hackathon/`: rules and judging
   - `context/06-ledgers-and-prior-art/design-principles-for-agent-writes.md`

Evidence lives in `.firecrawl/product/` (raw API/RPC responses and scrapes). Full docs dumps: `.firecrawl/docs/arc-llms-full.txt` and `.firecrawl/docs/circle-llms-full.txt` (large; grep them). Reference repos (read-only): `refs/abu/{keeperhub-copilot-v2,shijima,agari}`; Abu's earlier build: `/Users/abu/dev/hackathon/arc-agent`.

## What to review

### 1. Did the research capture what Abu asked for?

Compare `ABU-BRIEF-VERBATIM.md` with the decisions, inventory, and flows. List anything he asked for that is missing, misread, watered down, or over-extended.

### 2. Spot-check the load-bearing facts (targeted, not exhaustive)

Pick the ~10–15 claims that the architecture would rest on, and verify them yourself with a quick live call or doc check. Suggested candidates:
- Arc mainnet chainId 5042 and testnet 5042002.
- LI.FI and Relay support for Arc.
- MetaMask DelegationManager / enforcer code on both networks.
- The P256 precompile working on Arc.
- The x402 listing count (mainnet vs testnet).
- The "no keeper network on Arc mainnet" claim.
- The React Native SDK claims: LiveKit, the Circle RN SDK, and `@openai/agents` realtime.
- AI model IDs used in `05/llm-choice.md` and `09-voice-decision` (e.g. `gpt-live-1`, `gpt-6-sol`, `gemini-3.8-live`).
- Apple guideline 3.1.5(i).

Claude already spot-checked some of these; they're listed in `00-SYNTHESIS.md` "Sources". Prioritize the ones not yet checked. Mark each as CONFIRMED, WRONG (with the correct value and source), or UNVERIFIABLE.

### 3. Product and UX

Abu: "the user flows are very, very important", and he wants everything a great product needs "without me having to say it."
- What is missing from the feature inventory and flows?
- Which flows are weak or unsafe? Pay particular attention to:
  - "send to Alex" → add-contact pop-up while voice continues
  - a recurring payment by voice
  - mainnet ↔ testnet switching
  - voice in French
  - onboarding and first funding, including testnet faucets
- What would confuse or endanger a real user on a phone?

### 4. Architecture direction

The architecture isn't decided yet; it will be planned next. Critique the direction in `00-SYNTHESIS.md` §2–4, `03/recommended-architectures.md`, `06/recommended-stack.md`, and `09-voice-decision/`:
- wallet and authority option A, B, or C
- where spending limits must live so the agent "cannot be talked past" on both networks
- "one agent brain" across chat, voice, and Telegram
- the voice stack
- Expo plus a desktop shell
- the automation executor and its failure modes

Are any of the failures documented in `08-arc-agent-baseline-and-fit/what-was-learned.md` and `keeperhub-copilot-v2-review.md` being repeated? What would you do differently, and why?

### 5. Hackathon fit and scope

Read `08-arc-agent-baseline-and-fit/hackathon-fit.md` and `context/00-hackathon/judging-and-submission.md`. Give an honest view: how should this product be scoped and framed to do well with these judges in the time left (deadline 2026-10-10 11:59 PM ET), while staying true to Abu's vision?

## Output

Write `context/08-product-research/CODEX-REVIEW.md`:
1. **Brief vs research**: what was captured, missed, or misread.
2. **Fact spot-checks**: a table of claim · file · result · evidence (command or URL).
3. **Missing features and flows**, each with why it matters.
4. **Flow-by-flow issues**, by flow ID.
5. **Architecture critique and your recommendation**, with reasons.
6. **Scope and hackathon-fit recommendation.**
7. **Where you agree with Claude**, so it's clear what's settled.
8. **Top 10 actions**, in priority order.

Rules:
- Cite a source for every factual claim (URL, command output, or `path:line`).
- Label opinions as opinions.
- "I couldn't verify X" is a fine answer; don't invent.
- Don't send transactions, create accounts, write secrets, or edit anything other than `CODEX-REVIEW.md`.
