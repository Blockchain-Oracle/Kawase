# Stage 4: Agent brain + resolve and resume + chat

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- `packages/{policy,intents,agent,cards}`: `evaluate()` with the 5 kinds and the reason enum; the A2A intent state machine + draft versions + EIP-712 hashing + read-back templates.
- `agentTurn` with prompt caching, the network/locale tail, capability-filtered tools, untrusted quarantine + taint, and `toModelOutput` compaction.
- Card registry for native and web.
- Chat UI (composer, message parts, tool-approval UI).
- Threads with history and search. Rolling summary. Visible memory. Risk modes.
- `resume-intents` flow; the `precondition.cleared` outbox events; the `/i/[intentId]` deep-link resume.
- **Exit:**
  - "send 10 to Alex" (unknown) → AddContactForm → resumes.
  - "send 10" → USDC/EURC chips.
  - An over-limit request → PolicyRefusal with the numbers and **no split option**.
  - A mainnet-only request on testnet → NetworkSwitch card with asymmetric resume.
  - Every result renders on native and web.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
