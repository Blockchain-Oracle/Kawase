# Arc action checklist (from arc-agent's 94-action ledger)

Purpose: a feature checklist of "things a money agent on Arc could do", lifted from Abu's failed prior project's action ledger, with what that project actually got working. **It is a checklist, not a design to adopt.** arc-agent's architecture is not a template (see `what-was-learned.md`).

Sources:
- `/Users/abu/dev/hackathon/arc-agent/docs/wiki/semantic-action-ledger.md:21-193` (the 94 rows, 16 families A–P)
- `/Users/abu/dev/hackathon/arc-agent/packages/domain/src/generated/action-definitions.ts` (98 lines, generated from the ledger)
- `/Users/abu/dev/hackathon/arc-agent/packages/domain/src/catalogue-register.ts:34` (`ADAPTER_BACKED_ACTIONS`)
- `/Users/abu/dev/hackathon/arc-agent/packages/application/src/capability-profiles.ts:20-70`, `product-capability-profiles.ts:9-51` (handler registrations, `PROFILE_CHECKED_AT = "2026-08-09"`)
- `/Users/abu/dev/hackathon/arc-agent/packages/integrations/src/live-capability-reads.test.ts:12-14` (the 10 live readers)
- `/Users/abu/dev/hackathon/arc-agent/AGENTS.md:115-194`
- `context/01-arc/README.md`, `context/01-arc/app-kit.md`, `context/01-arc/stablecoins-fx-and-yield.md`, `context/01-arc/network-config.md`, `context/01-arc/agentic-and-ai.md`, `context/02-circle-agent-stack/README.md`, `.../agent-wallets.md`, `.../guardrails-and-policies.md`, `.../marketplace-and-discovery.md`

Verified: 2026-09-29

---

## How the "status" column was derived [VERIFIED, from code]

arc-agent's own code classifies each action. I did not guess; I mapped its registrations:

| Status here | Rule in arc-agent code | Count |
|---|---|---|
| **Executable (moves money)** | in `ADAPTER_BACKED_ACTIONS = ["C01","H02","I02","I04","I05"]` (`catalogue-register.ts:34`). Only C01 and H02 have live funded Arc Testnet tx evidence; I02/I04/I05 were "never funded" (`AGENTS.md:181-182`, `catalogue-register.ts:22-25`) | 5 |
| **Executable (workflow)** | has an `attended` handler that drives one of the above (E01–E03 recurring over C01; I03 recovery; I06 route choice) | 5 |
| **Executable (management write, no money)** | has an `attended` handler for settings/records: account selection, authority revoke, contacts, protected floor, notify-only monitors, quiet hours, inbox | 13 |
| **Read-only** | only `read` handlers: 10 live chain/API readers (`live-capability-reads.test.ts:12-14`) + 4 projections of the app's own records | 14 |
| **Deferred** | no handler at all; ledger row only. The app answers "catalogue_only" or "blocked" (`catalogue-register.ts:50-59,69-79`) | 57 |

Total 94. Everything was Arc **Testnet** only (chain 5042002); nothing ran on mainnet (`context/07-prior-work/arc-agent-overview.md:76`). The capability date is **2026-08-09** (`capability-profiles.ts:9`), and the repo has 207 uncommitted paths (`git status --porcelain`, run 2026-09-29), so some of this code was never pushed.

Column key: *Ledger evidence* is arc-agent's own label from Jul–Aug 2026 (`documented`, `verified`, `gated`, `sample`, `unknown`, `blocked`, `product requirement`); it is **not** a current availability claim. Evidence paths are relative to `/Users/abu/dev/hackathon/arc-agent/`: `ledger:N` = `docs/wiki/semantic-action-ledger.md:N`; other files are under `packages/*/src/`.

## The 94 actions

| ID | Family | Action | Example command (ledger) | Ledger evidence (Jul–Aug) | arc-agent status (2026-08-09) | Evidence |
|---|---|---|---|---|---|---|
| A01 | Identity | Create one default application agent | “Create my account.” | product requirement | Executable (settings/management write; no money) | ledger:25; capability-profiles.ts:20-70 |
| A02 | Identity | Create/connect/import wallet | “Create my Arc wallet.” | documented | Executable (settings/management write; no money) | ledger:26; capability-profiles.ts:20-70 |
| A03 | Identity | Inspect balances and positions | “Show everything I can spend.” | documented/unknown | Read-only (live chain/API reader) | ledger:27; live-capability-reads.test.ts:12-14 |
| A04 | Identity | Establish/change wallet authority | “Let this agent spend up to my mandate.” | documented/verified/unknown | Executable (settings/management write; no money) | ledger:28; capability-profiles.ts:20-70 |
| A05 | Identity | Make wallet funded and gas-ready | “Get me ready to try Arc.” | documented | Deferred | ledger:29; ledger row only |
| A06 | Identity | Lazily enter identity-dependent lifecycle | “Make my agent discoverable.” | product requirement | Deferred | ledger:30; ledger row only |
| B01 | Contacts | Save/verify contact address | “Save this as Becky’s Arc address.” | product requirement/verified | Executable (settings/management write; no money) | ledger:36; capability-profiles.ts:20-70 |
| B02 | Contacts | Resolve person/business/team/agent | “Send the design team five each.” | product requirement | Read-only (projection of own records) | ledger:37; capability-profiles.ts:20-70 |
| B03 | Contacts | Update/prefer/block address | “Use Becky’s new Arc address.” | product requirement | Executable (settings/management write; no money) | ledger:38; capability-profiles.ts:20-70 |
| B04 | Contacts | Store preferences, policy intents, mandates, invoice refs, or goals | “Remember my weekly research budget.” | product requirement | Deferred | ledger:39; ledger row only |
| B05 | Contacts | Export/backup/recover/delete memory and history | “Export then delete my contacts.” | unknown | Deferred | ledger:40; ledger row only |
| C01 | Payments And Money Movement | Send single payment | “Send Becky 10 USDC.” | documented | Executable (moves money; live funded tx on testnet) | ledger:46; catalogue-register.ts:34 |
| C02 | Payments And Money Movement | Batch/split/group payment | “Split 100: 50/30/20.” | documented | Deferred | ledger:47; ledger row only |
| C03 | Payments And Money Movement | Create/scan payment request/link/QR | “Request 20 USDC with a QR.” | unknown | Deferred | ledger:48; ledger row only |
| C04 | Payments And Money Movement | Validate/pay invoice and memo/reference | “Pay invoice INV-204 if it matches.” | documented/verified | Deferred | ledger:49; ledger row only |
| C05 | Payments And Money Movement | Schedule/condition payment | “Pay Becky Friday if balance stays above 100.” | product requirement | Deferred | ledger:50; ledger row only |
| C06 | Payments And Money Movement | Inspect/explain/recover payment | “Why didn’t that payment execute?” | documented | Read-only (projection of own records) | ledger:51; capability-profiles.ts:20-70 |
| D01 | Policies And Spending Controls | Set per-action/rolling/cumulative caps | “Cap each payment at 20 and this week at 50.” | documented/verified/unknown | Deferred | ledger:57; ledger row only |
| D02 | Policies And Spending Controls | Allow/block parties and contracts | “Only pay Becky and Daniel.” | documented/verified/unknown | Read-only (live chain/API reader) | ledger:58; live-capability-reads.test.ts:12-14 |
| D03 | Policies And Spending Controls | Restrict asset/pair/protocol/chain/action/function | “Allow only USDC–EURC swaps on Arc.” | documented/verified/unknown | Deferred | ledger:59; ledger row only |
| D04 | Policies And Spending Controls | Protect balances and reservations | “Keep 100 USDC untouched.” | unknown | Executable (settings/management write; no money) | ledger:60; capability-profiles.ts:20-70 |
| D05 | Policies And Spending Controls | Set time/count/pause/expiry controls | “Run only weekdays; expire in August.” | documented/verified/unknown | Deferred | ledger:61; ledger row only |
| D06 | Policies And Spending Controls | Set duplicate/risk/result controls | “Never pay twice or for invalid data.” | unknown/gated | Deferred | ledger:62; ledger row only |
| D07 | Policies And Spending Controls | Inspect/edit/pause/resume/cancel/revoke policy | “Pause all Marketplace spending.” | documented/verified/unknown | Deferred | ledger:63; ledger row only |
| E01 | Subscriptions And Recurring Mandates | Preview/create subscription mandate | “Pay Becky 2 USDC Fridays, six times.” | implemented/locally verified | Executable (creates recurring mandate) | ledger:69; capability-profiles.ts:45-54 |
| E02 | Subscriptions And Recurring Mandates | Execute recurring occurrence | “Run the payment that is due.” | implemented/locally verified | Executable (runs occurrence via C01) | ledger:70; capability-profiles.ts:45-54 |
| E03 | Subscriptions And Recurring Mandates | Inspect/edit/pause/resume/cancel/expire | “Pause it; resume next month.” | implemented/locally verified | Executable (mandate lifecycle) | ledger:71; capability-profiles.ts:45-54 |
| E04 | Subscriptions And Recurring Mandates | Apply count/price behavior | “Stop if price rises, or after six payments.” | product requirement | Deferred | ledger:72; ledger row only |
| E05 | Subscriptions And Recurring Mandates | Request merchant-side cancellation | “Cancel the external subscription too.” | unknown | Deferred | ledger:73; ledger row only |
| F01 | Conditional And Event-Driven Automation | Preview/create notify-only monitor | “Notify me when salary arrives.” | implemented/locally verified | Executable (settings/management write; no money) | ledger:79; product-capability-profiles.ts:9-33 |
| F02 | Conditional And Event-Driven Automation | Observe supported trigger | “Watch BTC price and this contract event.” | implemented/locally verified | Executable (settings/management write; no money) | ledger:80; product-capability-profiles.ts:9-33 |
| F03 | Conditional And Event-Driven Automation | Evaluate trigger deterministically | “Check whether the rule passed.” | implemented/locally verified | Executable (settings/management write; no money) | ledger:81; product-capability-profiles.ts:9-33 |
| F04 | Conditional And Event-Driven Automation | Execute a conditionally triggered financial plan | “Execute the authorized plan now.” | unimplemented/gated | Deferred | ledger:82; ledger row only |
| F05 | Conditional And Event-Driven Automation | Inspect/edit/pause/resume/cancel/expire/acknowledge/recover generic monitor | “Pause/cancel this monitor.” | implemented/locally verified | Executable (settings/management write; no money) | ledger:83; product-capability-profiles.ts:9-33 |
| F06 | Conditional And Event-Driven Automation | Retry/recover/catch up/explain | “Resume after the quote expired.” | product requirement | Read-only (projection of own records) | ledger:84; capability-profiles.ts:20-70 |
| G01 | Oracles And External Signals | Discover/verify feed | “Find a usable BTC/USD feed on Arc.” | verified/unknown | Deferred | ledger:90; ledger row only |
| G02 | Oracles And External Signals | Read/update signal | “Get a fresh BTC price.” | verified | Read-only (live chain/API reader) | ledger:91; live-capability-reads.test.ts:12-14 |
| G03 | Oracles And External Signals | Watch threshold/percentage move | “Trigger if BTC drops five percent.” | product requirement | Deferred | ledger:92; ledger row only |
| G04 | Oracles And External Signals | Explain signal decision | “Why did the price rule fire?” | product requirement | Deferred | ledger:93; ledger row only |
| H01 | Swaps | Quote/compare swap routes | “Quote 20 USDC to EURC.” | documented | Read-only (live chain/API reader) | ledger:99; live-capability-reads.test.ts:12-14 |
| H02 | Swaps | Execute/monitor swap | “Swap only if I get at least 18 EURC.” | documented | Executable (moves money; live funded tx on testnet) | ledger:100; catalogue-register.ts:34 |
| H03 | Swaps | Create DCA/limit-like swap mandate | “Buy 5 USDC of cirBTC Mondays.” | product requirement | Deferred | ledger:101; ledger row only |
| H04 | Swaps | Add/remove liquidity and inspect LP | “Add liquidity to this pool.” | verified | Deferred | ledger:102; ledger row only |
| H05 | Swaps | Mint/deposit/withdraw/redeem vault | “Deposit 20 into this vault.” | verified/documented/unknown | Deferred | ledger:103; ledger row only |
| H06 | Swaps | Supply/lend/inspect/withdraw | “Supply 20 USDC and show interest.” | blocked | Deferred (ledger says blocked) | ledger:104; ledger row only |
| H07 | Swaps | Collateralize/borrow/repay/withdraw collateral | “Borrow 10 after depositing collateral.” | sample/unknown | Deferred | ledger:105; ledger row only |
| H08 | Swaps | Inspect/react to lending health | “Repay if health falls below my limit.” | blocked | Deferred (ledger says blocked) | ledger:106; ledger row only |
| I01 | Crosschain USDC And Unified Balance | Inspect wallet/unified balances | “Show my USDC everywhere.” | documented | Read-only (live chain/API reader) | ledger:112; live-capability-reads.test.ts:12-14 |
| I02 | Crosschain USDC And Unified Balance | Quote/bridge USDC | “Move 30 USDC from Base to Arc.” | documented | Executable (moves money; adapter never funded) | ledger:113; catalogue-register.ts:34 |
| I03 | Crosschain USDC And Unified Balance | Inspect/recover/explain bridge | “Recover my delayed bridge.” | documented | Executable (recovery controller; never run live) | ledger:114; product-capability-profiles.ts:35-51 |
| I04 | Crosschain USDC And Unified Balance | Gateway deposit | “Deposit this USDC to Unified Balance.” | documented | Executable (moves money; adapter never funded) | ledger:115; catalogue-register.ts:34 |
| I05 | Crosschain USDC And Unified Balance | Gateway spend/withdraw | “Spend or withdraw 10 from Unified Balance.” | documented | Executable (moves money; adapter never funded) | ledger:116; catalogue-register.ts:34 |
| I06 | Crosschain USDC And Unified Balance | Select source and route funds | “Use whichever chain has enough, then top up Arc.” | product requirement | Executable (route choice creates I02/I05 op) | ledger:117; product-capability-profiles.ts:35-51 |
| J01 | Treasury | Define logical treasury pots | “Create a protected 100-USDC reserve.” | product requirement | Deferred | ledger:123; ledger row only |
| J02 | Treasury | Allocate incoming funds | “Split salary 20% savings, rest spending.” | product requirement/documented | Deferred | ledger:124; ledger row only |
| J03 | Treasury | Set/replenish budget | “Refill research budget every Monday.” | product requirement | Deferred | ledger:125; ledger row only |
| J04 | Treasury | Report/forecast cash flow | “Forecast next month’s free USDC.” | product requirement | Deferred | ledger:126; ledger row only |
| J05 | Treasury | Reconcile movement | “Reconcile planned and actual spend.” | product requirement | Read-only (projection of own records) | ledger:127; capability-profiles.ts:20-70 |
| J06 | Treasury | Alert/pause/rebalance | “Pause nonessential spend and rebalance.” | product requirement | Deferred | ledger:128; ledger row only |
| K01 | Marketplace | Discover/inspect service | “Find weather data under one cent.” | verified | Deferred | ledger:134; ledger row only |
| K02 | Marketplace | Authorize/pay service | “Buy it if total cost stays under my budget.” | documented | Deferred | ledger:135; ledger row only |
| K03 | Marketplace | Invoke/validate paid result | “Run it and validate the JSON.” | unknown | Deferred | ledger:136; ledger row only |
| K04 | Marketplace | Inspect history/prevent duplicate | “Show what my agent bought today.” | product requirement/unknown | Deferred | ledger:137; ledger row only |
| K05 | Marketplace | Retry/stop/request refund | “Stop or refund the failed purchase.” | unknown | Deferred | ledger:138; ledger row only |
| L01 | Agent Identity | Register/inspect ERC-8004 identity | “Register this agent onchain.” | documented/verified | Read-only (live chain/API reader) | ledger:144; live-capability-reads.test.ts:12-14 |
| L02 | Agent Identity | Read reputation/validation | “Show its reputation and validation.” | documented/verified | Read-only (live chain/API reader) | ledger:145; live-capability-reads.test.ts:12-14 |
| L03 | Agent Identity | Discover/select agent | “Find an agent for this job.” | blocked | Deferred (ledger says blocked) | ledger:146; ledger row only |
| L04 | Agent Identity | Create/fund ERC-8183 job/escrow | “Create a one-USDC job due Friday.” | documented/verified | Read-only (live chain/API reader) | ledger:147; live-capability-reads.test.ts:12-14 |
| L05 | Agent Identity | Submit/inspect/evaluate deliverable | “Submit and evaluate the JSON result.” | documented/unknown | Read-only (live chain/API reader) | ledger:148; live-capability-reads.test.ts:12-14 |
| L06 | Agent Identity | Complete/reject/settle/refund/expire | “Release payment or refund it.” | documented/verified | Read-only (live chain/API reader) | ledger:149; live-capability-reads.test.ts:12-14 |
| L07 | Agent Identity | Write reputation evidence | “Record feedback from this completed job.” | documented | Deferred | ledger:150; ledger row only |
| M01 | Smart-Contract Actions | Import/establish provenance/manage record | “Import this contract and verify what it is.” | documented/unknown | Deferred | ledger:156; ledger row only |
| M02 | Smart-Contract Actions | Read/simulate interpreted function | “Read and simulate withdraw(10).” | documented/unknown | Deferred | ledger:157; ledger row only |
| M03 | Smart-Contract Actions | Execute interpreted write | “Execute that allowlisted function.” | documented | Deferred | ledger:158; ledger row only |
| M04 | Smart-Contract Actions | Deploy template/custom bytecode | “Deploy this recurring-payment contract.” | documented | Deferred | ledger:159; ledger row only |
| M05 | Smart-Contract Actions | Create monitor/read history | “Watch Settled events and notify me.” | documented/gated | Deferred | ledger:160; ledger row only |
| M06 | Smart-Contract Actions | Edit/remove monitoring or imported management | “Stop watching that event.” | documented/unknown | Deferred | ledger:161; ledger row only |
| N01 | Notifications And Reminders | Configure routes/thresholds/quiet hours | “Use push for urgent alerts, email otherwise.” | product requirement | Executable (settings/management write; no money) | ledger:167; capability-profiles.ts:20-70 |
| N02 | Notifications And Reminders | Create/edit/pause/cancel reminder | “Remind me before each subscription.” | unknown | Deferred | ledger:168; ledger row only |
| N03 | Notifications And Reminders | Emit domain notification | “Alert me when a quote expires or Becky changes address.” | product requirement/documented | Deferred | ledger:169; ledger row only |
| N04 | Notifications And Reminders | Deliver/retry/dedupe/expire | “Retry the failed Telegram alert.” | documented/unknown | Executable (settings/management write; no money) | ledger:170; capability-profiles.ts:20-70 |
| N05 | Notifications And Reminders | Acknowledge/inspect history | “Mark this alert read.” | product requirement | Executable (settings/management write; no money) | ledger:171; capability-profiles.ts:20-70 |
| O01 | Voice | Start/continue typed conversation | “Send Becky ten.” | unknown | Deferred | ledger:177; ledger row only |
| O02 | Voice | Start/interrupt/resume/end voice | “Send Becky 10 USDC,” spoken | documented | Deferred | ledger:178; ledger row only |
| O03 | Voice | Detect/select/switch/code-switch language | “Continue in Yoruba,” then code-switch | documented/unknown | Deferred | ledger:179; ledger row only |
| O04 | Voice | Correct/amend intent | “Make that fifteen, not fifty.” | product requirement | Deferred | ledger:180; ledger row only |
| O05 | Voice | Switch modality with one context | “I’ll type the address, then keep talking.” | documented/product requirement | Deferred | ledger:181; ledger row only |
| O06 | Voice | Clarify critical slots | “Did you mean 15 USDC on Arc?” | product requirement | Deferred | ledger:182; ledger row only |
| P01 | Generative UI | Generate one editable composed plan | “Bridge, swap, pay, then repeat weekly.” | product requirement | Deferred | ledger:188; ledger row only |
| P02 | Generative UI | Render typed domain UI | “Show me exactly what each action will do.” | product requirement | Deferred | ledger:189; ledger row only |
| P03 | Generative UI | Edit/confirm attended plan once | “Yes, execute this unchanged plan.” | product requirement | Deferred | ledger:190; ledger row only |
| P04 | Generative UI | Show plan/step lifecycle | “Show the live timeline.” | product requirement | Deferred | ledger:191; ledger row only |
| P05 | Generative UI | Produce receipt/explanation | “What happened and why?” | product requirement | Deferred | ledger:192; ledger row only |
| P06 | Generative UI | Retry/resume/cancel/recover | “Resume safely after the bridge delay.” | product requirement | Deferred | ledger:193; ledger row only |

Notes on reading the table:
- **A02 "executable" is account *selection*** among the app's own server-derived accounts (`handlerId: "account.selection.v1"`, `capability-profiles.ts:24-26`), not creating or connecting a real wallet.
- **F01–F05 monitors are notify-only.** F04 (a trigger that moves money) is unimplemented, so "a matched monitor cannot move money" (`AGENTS.md:148-149`).
- **O (voice/language) and P (generative UI/plans) have no capability handlers**, but pieces exist as product infrastructure: OpenAI Realtime voice was run live in a browser (`docs/raw/2026-07-30-browser-webrtc-voice-trial.md`, cited in `context/07-prior-work/arc-agent-overview.md:69`). They are "Deferred" here only in the registry's sense.
- **K (marketplace), M (contracts), J01–J04/J06 (treasury), H03–H08 (DCA, LP, vaults, lending)**: nothing was built.

## What is possible on Arc now that was not in Jul–Aug 2026

Arc public mainnet launched 2026-09-16 (chain 5042) [VERIFIED in `context/01-arc/README.md:61,68`, which cites the Circle press release and a live RPC check]. The rows below are the catalogue actions whose feasibility changed. "Changed" means the library documents it today; it does not mean anyone has run it.

| Action(s) | Then (arc-agent, Jul–Aug) | Now (2026-09-29) | Status | Source |
|---|---|---|---|---|
| Everything | Testnet only (5042002) | Mainnet 5042 live; no faucet on mainnet (fund via CCTP/Gateway or Circle contact) | [VERIFIED] | `context/01-arc/overview-and-architecture.md:106-111` |
| A02 wallets | Circle Agent Wallets "Arc Testnet only"; Circle Wallets rejected by design | Agent Wallets support `ARC` mainnet and `ARC-TESTNET` (added 2026-09-16); SCA over 2-of-2 MPC, gas sponsored, transfers sanctions-screened | [VERIFIED] | `context/02-circle-agent-stack/agent-wallets.md:21,82`; `context/02-circle-agent-stack/README.md:46` |
| D01–D03, D05, D07 caps/allowlists | Circle-managed policy rejected on testnet | Still **mainnet only**, still need a human email OTP. Now usable because mainnet exists | [VERIFIED] | `context/02-circle-agent-stack/guardrails-and-policies.md:7,28` |
| H05 vaults / yield | "verified/documented/unknown"; USYC gated; pool empty | **App Kit Earn** exists (USDC and EURC vaults on Arc over lending protocols, Morpho named): `exploreVaults`, `deposit`, `getPosition`, `withdraw` | [VERIFIED docs] | `context/01-arc/app-kit.md:160-170`; `context/01-arc/stablecoins-fx-and-yield.md:46` |
| H04, H06–H08 LP and lending | LP "verified"; lending "blocked" | Uniswap, Aave, Morpho named as mainnet launch partners (press), **no Arc addresses in Arc docs** | [REPORTED] | `context/01-arc/stablecoins-fx-and-yield.md:48`; `context/01-arc/ecosystem-and-infrastructure.md:28` |
| A05 funding | Faucet only | **App Kit Onramp** (fiat → USDC/EURC on Arc); card/Apple/Google Pay need KYB | [VERIFIED docs] | `context/01-arc/app-kit.md:172-174` |
| H01/H02 swap | App Kit 1.11.0, Kit Key confusion | App Kit 1.15.3; `apiKey` optional; Swap works on Arc mainnet and testnet; on Arc only USDC, EURC, cirBTC | [VERIFIED docs] | `context/01-arc/app-kit.md:22,38,86`; `context/01-arc/README.md:70-71` |
| I02 bridge | CCTP "Standard only" on testnet | Arc Fast source listed as N/A (Arc attests in ~1 block); App Kit defaults FAST inbound | [VERIFIED docs] | `context/01-arc/README.md:72` |
| K01–K05 marketplace/x402 | K01 "verified", nothing built | Discovery API public: 687 listings payable on Arc **mainnet**, **0 on Arc Testnet**. Facilitator Service launched 2026-09-16 (Arc, Base, Polygon) | [VERIFIED] | `context/02-circle-agent-stack/marketplace-and-discovery.md:54,63`; `context/02-circle-agent-stack/overview.md:62` |
| C02 batch, C04 invoice memo | "documented" | Memo `0x5294…e505` and Multicall3From `0x522f…47D0`, same address on both networks | [VERIFIED docs] | `context/01-arc/network-config.md:133-139` |
| L01–L07 agent identity/jobs | Testnet registries read live | Official docs cover **testnet only**; testnet ERC-8004/8183 addresses have **no code on mainnet**; canonical ERC-8004 addresses have code on mainnet (unofficial) | [VERIFIED] | `context/01-arc/network-config.md:163-168`; `context/01-arc/agentic-and-ai.md:85` |
| M04 deploy tokens (incl. "meme coins") | "documented" | Circle Contracts ERC-20/721/1155/Airdrop templates (Gas Station sponsors on **testnet**); Arc Studio deploys **testnet only** | [VERIFIED docs] | `context/01-arc/deploying-contracts.md:136-138,155`; `context/01-arc/overview-and-architecture.md:111` |
| Other I-family | Gateway contracts on testnet | Gateway mainnet contracts listed (domain 26) | [VERIFIED docs] | `context/01-arc/network-config.md:120-125` |

Not in the catalogue at all but relevant to Abu's wishlist: StableFX RFQ FX (`FxEscrow`, access via Circle) and USYC (allowlisted, non-US, $100k minimum on mainnet) (`context/01-arc/stablecoins-fx-and-yield.md:31,47`).

## Gaps

- I did not re-run any arc-agent code or re-probe any address; the statuses above are what its code registered on 2026-08-09.
- The "Now" column relies on `context/01-arc` and `context/02-circle-agent-stack` (verified 2026-09-29 by other agents); I did not independently re-verify each line.
- Meme-coin launchpads, DEX aggregators and bridge aggregators on Arc are not covered by either library. [UNKNOWN]; looked in `context/01-arc/ecosystem-and-infrastructure.md` and `context/01-arc/stablecoins-fx-and-yield.md`.
