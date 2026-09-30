# Stage 5: Money movement + contacts + business basics

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- Send, receive (QR, share link), request money and split bills (C3), batch payouts (Multicall3From), memo, crosschain send; the approval endpoint (lock, fresh evaluate, spend reservation, then the allowance redeem or a wallet signature); post-verification against the draft; `tx_attempts` + reconciliation; the money-ending taxonomy.
- `apps/chain-watcher` (system emitter + ERC-20 + Memo, with cursors) → incoming-payment matching + inbox.
- Contacts: versioned addresses, per-network trust, verification method, 24 h change cooldown + hold, first-time and lookalike warnings, ENS/Basenames/ArcNS ("unofficial"), QR scan, save-from-received.
- Limits (per-tx, daily, weekly, allowlist, new-recipient cooldown, temporary raise with auto-restore, pause-all).
- Business basics (R): business profile, invoices = payment requests with memo matching, vendor labels on contacts.
- Deploy `executor` (reconcile, track-intent) + `chain-watcher`.
- **Exit:** a real send on testnet **and** mainnet (small amount) with receipts; an incoming payment detected; an address change freezes payments; duplicate taps never double-send.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp (`plan/design/REVAMP-PLAN.md`) designs this stage's screens early — send (recipient search, amount ticket, memo, review with trust/first-time/lookalike rows, receipt), request + share card, contacts (list, row with per-network trust, add-contact sheet), the `@handle` as a recipient — so this stage connects `contacts.search`, `resolve_name`, `payment_requests` and execution to finished screens.
