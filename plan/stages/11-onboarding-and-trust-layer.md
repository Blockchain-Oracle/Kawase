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
- Devices and delete-account cards in chat: 28284 Item Action List · sean0205 · https://21st.dev/r/sean0205/item-action-list · rows with media, text and one action → `ui-native/item-action-list.tsx`.

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp (`plan/design/REVAMP-PLAN.md`) delivers story onboarding, the optional handle, the completion scene with the authority receipt, the first-steps checklist and starter chips (replacing the first-run tour), the faucet's seven states in the fund hub, the fee-reserve chip, the reconciliation and degraded banners, Wallet & limits (pause all, risk dial, practice, exit kit rows) and Settings → Help & trust as designed surfaces. This stage wires the faucet drip, fee reserve, reconciliation, status, the trust page content and versioned consent to them.
- 2026-10-02 (B2-2): security notice on a new sign-in and on a device signed out (inbox, push, email), with the device's approximate place from DB-IP's free API (only "City, Country" kept). Fixed devices reading as signed out (a correlated subquery compared sessions with themselves).
- 2026-10-02 (B2-2): sign_out_device and delete_account from chat as proposals: the person taps Sign out on the card; delete opens its screen where the @handle is typed.
- 2026-10-03 (B2-3): Help & trust page (item-action list, 21st 28284; live /status card), display currency (28 fiats, open.er-api rate cached on the server, agent replies in it), fee reserve chip "~N actions left" + get_fee_reserve, gas-free USDC/EURC sends through the EIP-3009 relayer (testnet 0x7a93e823…c3cf) and relayed payout batches through a one-time 7702 delegation (0x52160ea3…b23e), first mainnet switch says "Kawase is getting mainnet ready" while its relayer has no gas, offline start shows the last portfolio with "updated N min ago", story panel 5 "Everything on Arc".
  - Full hashes, copied from the testnet relayer's own transaction list on testnet.arcscan.app (relayer `0xA0f081bECEA5227A929cd8b8a3572D1FB4d1148a`), 2026-10-03:
    - gas-free send, `transferWithAuthorization` on USDC, test `gasless-send-testnet`: `0x7a93e823165dc468605203545b883f645b39d7f476c84122002f0ac7ef64c3cf` (07:46:44 UTC); rerun after the merge `0xbfb777d77929bdd7f124e30aa754f771c82a09a901ebd5840f537344cefdf807` (08:44:55 UTC).
    - relayed payout batch, `redeemDelegations`, test `gasless-batch-testnet`: `0x52160ea35588d7890ba92ce265ba6897f540f8b3a36430f0228e4939ef58b23e` (08:15:05 UTC).
