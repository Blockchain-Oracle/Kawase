# Stage 11: Onboarding and trust layer

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- Guest look-around with deferred sign-up; a one-tap test USDC faucet with every state (the drip DCW + Circle faucet fallback); an optional sponsored ~$1 on mainnet.
- A first-run tour + first-steps checklist + starter chips per state.
- Fee reserve "~N actions left"; the feasibility pre-check with one-tap fixes.
- Pending-write reconciliation on app open; the status page + "right now" card; the authority "can / can-never" receipt everywhere.
- The exit kit: pause all → revoke the agent → sweep back. The trust page. In-app help. Versioned consent.
- Region hold: a placeholder flag, off by default (it needs legal input).
- **Exit:** a new user goes from install → email code → wallet → funded on testnet → first send with no prompt inside the allowance, in under 2 minutes; the exit kit leaves zero remaining authority, verified on chain.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp (`plan/design/REVAMP-PLAN.md`) delivers story onboarding, the optional handle, the completion scene with the authority receipt, the first-steps checklist and starter chips (replacing the first-run tour), the faucet's seven states in the fund hub, the fee-reserve chip, the reconciliation and degraded banners, Wallet & limits (pause all, risk dial, practice, exit kit rows) and Settings → Help & trust as designed surfaces. This stage wires the faucet drip, fee reserve, reconciliation, status, the trust page content and versioned consent to them.
