# Automations: taxonomy, who executes them on Arc, failure handling, idempotency, lifecycle

Purpose: what each kind of money automation needs in order to run on Arc (September 2026), which executors actually support Arc today, and how to create, pause, edit, cancel and audit automations without paying twice.

Sources:
- Keepers: https://docs.chain.link/chainlink-automation/overview/supported-networks (fetched 2026-09-29); https://docs.chain.link/cre/supported-networks (`.firecrawl/product/07/cre-supported-networks.md:300-341`); https://docs.gelato.network/web3-services/web3-functions/supported-networks (301 to docs.gelato.cloud, which returns 404 / `DEPLOYMENT_NOT_FOUND`); https://www.gelato.cloud/; https://blog.powerloom.io/wind-down/ (powerloom.io 307-redirects there)
- Delegation contracts: https://github.com/MetaMask/delegation-framework (`documents/Deployments.md` v1.3.0, `src/enforcers/ERC20PeriodTransferEnforcer.sol`, `src/DelegationManager.sol:90-126`); live `eth_getCode` on Arc mainnet and testnet: `.firecrawl/product/07/session-permission-getcode-2026-09-29.txt`
- Oracles: https://reference-data-directory.vercel.app/feeds-arc-mainnet.json (`.firecrawl/product/07/chainlink-feeds-arc-mainnet.json`); live `latestRoundData` on EUR/USD (`.firecrawl/product/07/chainlink-eurusd-arc-mainnet-latestRoundData.json`); https://docs.pyth.network/price-feeds/core/contract-addresses/evm
- Circle: `.firecrawl/docs/circle-llms-full.txt:1369-1440` (Agent Wallet custom policies); `context/02-circle-agent-stack/guardrails-and-policies.md`; `context/03-circle-platform/other-apis.md:16-24` (webhooks); `context/08-product-research/03-wallets-custody-limits/circle-wallet-options.md:15-30,230-250`
- Arc: `context/01-arc/gotchas.md:19-40`; `context/01-arc/app-kit.md:78-88`; `context/01-arc/stablecoins-fx-and-yield.md:30-47`; `context/01-arc/transactions-memo-batching.md:18-25`; https://docs.arc.io/arc/references/evm-differences (`.firecrawl/docs/arc-llms-full.txt:18297-18310`)
- Analogs: `context/08-product-research/04-analogs-and-competitors/fintech-ux-analogs.md:41-75,117-121`, `.../telegram-and-chat-bots.md:56-74`
- Lessons only (arc-agent failed; its designs are **not** defaults): `context/08-product-research/08-arc-agent-baseline-and-fit/what-was-learned.md` §5–7; `/Users/abu/dev/hackathon/arc-agent/docs/research/2026-07-28-automation-*.md`, `2026-07-29-arc-wallet-policy-runtime.md` (re-verified below where used)

Verified: 2026-09-29

---

## 1. The one fact that shapes everything

An automation is a trigger, a check, **authority to sign**, a limit that the signer cannot get around, an executor, and a record. The executor is the easy part. The hard part is **who signs while the user is away**.

- Circle **user-controlled** wallets cannot sign without the user: "Every signing operation requires an active, authenticated user session. User-controlled wallets are not designed for automated or backend-initiated transactions where no user is present" [VERIFIED, quoted in `03-wallets-custody-limits/circle-wallet-options.md:21`].
- Circle **developer-controlled** wallets can sign from the backend, but then the app holds custody and its own rules are the only limit [VERIFIED, same file §comparison].
- Circle **Agent Wallet** spending policies (per-tx, daily, weekly, monthly caps, and recipient/contract allow/blocklists) exist, but "Policies apply to mainnet agent wallets only" and "Setting a policy triggers a second email OTP" [VERIFIED `.firecrawl/docs/circle-llms-full.txt:1375-1395`]. The docs' own example uses `--chain ARC`, which is Arc mainnet.
- arc-agent failed here: its "matched monitor cannot move money", and the limited smart account was not the account that spent [VERIFIED `what-was-learned.md` §5.2, §5.6]. Lesson: **an automation that cannot move money within limits is only a reminder.**

## 2. Executors: which ones support Arc (checked 2026-09-29)

| Executor | Arc mainnet (5042) | Arc testnet (5042002) | What it really is | Status |
|---|---|---|---|---|
| **Chainlink Automation** | No | No | Onchain keeper network | [VERIFIED] The supported list is Arbitrum, Avalanche, Base, BNB, Ethereum, Gnosis, OP, Polygon, Scroll and zkSync. No Arc. |
| **Chainlink CRE** (cron, EVM-log and HTTP triggers; writes go through a forwarder to *your* consumer contract) | **No** (not in the Mainnets table) | **Yes** ("Arc Testnet", CLI v1.0.7+, TS SDK v1.3.1+) | Decentralized workflow runtime. It can call a contract you deploy. It does not hold the user's key. | [VERIFIED] `cre-supported-networks.md:341`. Deploying needs "Requesting Deploy Access" (`:178`), so it is gated. |
| **Gelato** Web3 Functions / Automate | [UNKNOWN] | [UNKNOWN] | Was an offchain-triggered keeper | Old docs URL now 404s. The gelato.cloud homepage lists Paymaster & Bundler, Rollups and Relay, and mentions neither automation nor Arc. arc-agent (2026-07-28) found Arc absent from the Web3 Functions and Relay lists. I could not re-verify today. |
| **Powerloom** | No | No | A decentralized *data* protocol, not a transaction keeper | [VERIFIED] It is shut down. "I and Swaroop have decided to wind down Powerloom" (15 Jun 2026), and the chain shut down on 21 Jul 2026. Don't use it. |
| **OpenZeppelin Defender** | n/a | n/a | Relayer and autotasks | [REPORTED by arc-agent research 2026-07-28] Final shutdown was 2026-07-01. Not re-checked. |
| **Your own server scheduler** (cron / queue worker) | Yes | Yes | You submit transactions via RPC, Circle APIs, or a bundler | Always available. Its safety depends entirely on the key it uses (§3). |
| **Circle webhooks** (`transactions.inbound`, `contracts.eventLog`) | Wallets/Contracts list `ARC` | Yes | *Observation* only. "At-least-once and unordered" delivery. | [VERIFIED `context/03-circle-platform/other-apis.md:16-24`] A webhook is a trigger, not a signer. |

**Conclusion [INFERENCE]:** no shared keeper network executes on Arc mainnet today. The executor will be **our own server scheduler**, optionally with CRE on testnet as a decentralized-trigger demo. The safety must therefore come from the **authority** layer.

## 3. Authority models for unattended runs (pick per automation)

| Model | How it works | Limit the agent can't bypass? | Arc evidence | Fit |
|---|---|---|---|---|
| **A. Attended ("nudge and tap")** | The scheduler fires, the user gets a push or Telegram prompt, and the user signs in-app (passkey/biometric) | Yes: the user signs every run | Works with Circle user-controlled wallets [VERIFIED §1] | Default for P2P and bill pay. Zero custody risk. It fails if the user ignores the prompt. |
| **B. Onchain scoped delegation** (ERC-7710 style) | The user's smart account (or an EOA upgraded via EIP-7702) signs a delegation to the server's session key with **caveats**: target = USDC, recipient = Alex, ≤ 10 USDC per 7-day period, expires on date X. The server redeems it on schedule. | **Yes**, enforced by the DelegationManager and caveat enforcer contracts | MetaMask Delegation Framework **v1.3.0 bytecode is present on Arc mainnet and testnet** at the documented deterministic addresses: DelegationManager `0xdb9B…7dB3`, ERC20PeriodTransferEnforcer `0x474e…39aB`, NativeTokenPeriodTransferEnforcer `0x9BC0…6BD9`, AllowedTargets `0x7F20…4EeB`, Timestamp `0x1046…c069`, LimitedCalls `0x0465…5416`, EIP7702StatelessDeleGatorImpl `0x63c0…E32B` [VERIFIED `eth_getCode`]. ZeroDev Kernel v0.3.0, CallPolicy and TimestampPolicy, and the Rhinestone Universal Action, Usage Limit, Time Frame and Spending Limits policies are also on mainnet. **The Rhinestone Smart Sessions module at `0x0000…4bDA` is on testnet only** [VERIFIED]. | Best fit for true "every Tuesday" autopay. **Not yet run with funds on Arc by anyone we can cite** [UNKNOWN]. Circle user-controlled SCAs can't install third-party modules per the docs [UNKNOWN, sibling file]. |
| **C. Budget sub-wallet** | The user funds a separate Circle developer-controlled wallet or Agent Wallet with a budget. Automations spend only from it. | Partly: loss is bounded by its **balance**. On mainnet, Agent Wallet caps and allowlists are enforced by Circle with a human OTP to change. | Agent Wallet policies on `ARC` mainnet [VERIFIED]. Circle's starter-kit advice: "Keep the wallet funded with what you would not mind losing" [VERIFIED, quoted in `guardrails-and-policies.md` §3]. | Simple and Circle-native (helps the 20% Circle-tools score). The balance itself is the limit. |
| **D. App custody** (developer-controlled wallet holds all funds) | The server signs anything | **No**: app rules only, and the same backend can bypass them | [VERIFIED] | Avoid as the only control. arc-agent's HKDF server-derived keys were this pattern and are listed as a failure (`what-was-learned.md` §5.1). |

The period enforcer is exactly a recurring allowance: "a user may transfer up to a fixed amount of tokens (the period amount) during a given time period. The transferable amount resets at the beginning of each period, and any unused tokens are forfeited once the period ends" (`ERC20PeriodTransferEnforcer.sol` natspec) [VERIFIED].

**Arc caveat [VERIFIED gotcha + INFERENCE]:** "ERC-20 allowances don't bound native sends … Spending policies must cover both paths" (`context/01-arc/gotchas.md:24`). A delegation for USDC must either restrict execution to `transfer` on the `0x3600…0000` ERC-20 interface with zero native value, or also carry the native-token period caveat.

## 4. Taxonomy: each automation type

Legend for "Executor/authority": S = own server scheduler; A/B/C as in §3.

| Type | Example | Trigger source on Arc | Executor / authority | Arc-specific notes |
|---|---|---|---|---|
| **Scheduled transfer** | "Every Tuesday send $10 to Alex" | Server clock (store the IANA timezone and the next run in UTC) | S + A by default. S + B or C if the user opts in to unattended. | Onchain period caveat = 10 USDC per 604800 s. Its period start must align with Tuesday [INFERENCE]. |
| **Price-conditional / limit order** | "If EURC drops below $1.12, swap 100 USDC to EURC" | (1) Chainlink **EUR/USD on Arc mainnet** `0xDd5B…DE0D`, 8 decimals. Read 2026-09-29: 1.13739, updated 2026-09-28 16:51 UTC. Heartbeat 86400 s, deviation 0.5% [VERIFIED]. (2) The App Kit swap **quote itself**. Pyth lists Arc **testnet only** [VERIFIED]. | S polls the quote, then B/C executes App Kit Swap with `stopLimit` / `minBuyAmount` | A 24 h / 0.5% feed is too coarse to be a limit-order trigger. Trigger on the executable quote, and use the feed only as a sanity bound [INFERENCE]. Arc Swap accepts only USDC, EURC and cirBTC [VERIFIED `app-kit.md:86`]. This is not a resting order-book limit order: execution happens only when our server sees the price. |
| **Event: incoming payment** | "When salary arrives, move 20% to savings" | Arc emits **EIP-7708 `Transfer` logs for native value** plus ERC-20 USDC events, so incoming USDC is indexable either way; dedupe the two [VERIFIED `evm-differences`, `transactions-memo-batching.md`]. Circle `transactions.inbound` webhook for Circle wallets [VERIFIED]. | S + B/C | Classify "salary" by sender contact plus a minimum amount, never by memo text alone (memo text is untrusted input). Idempotency key = inbound tx hash + log index [INFERENCE]. |
| **Balance threshold alert** | "When balance < $50, notify me" | RPC or webhook balance read | S only. **No signing needed.** | Read the balance at 6 dp (the `balanceOf` view) and don't show two USDC balances [VERIFIED gotchas #2–3]. Add hysteresis (re-arm only above $55) to avoid alert storms [INFERENCE]. |
| **Round-ups** | "Round every payment up to the next $1 and save the change" | Our own outgoing sends. **Arc has no card-swipe event.** | Batch the round-up into the same user-signed send (Multicall3From) or run a daily sweep via B/C | Round-ups only make sense on payments the app itself makes [INFERENCE]. |
| **DCA** | "Buy $20 of cirBTC every Monday" | Clock | S + B/C using App Kit Swap | Only USDC/EURC/cirBTC on Arc [VERIFIED]. Bankr caps DCA at 24 runs/day and ≥1 h apart [VERIFIED in sibling file :74]. Copy a minimum interval. |
| **Auto-yield sweep** | "Keep $200 liquid, sweep the rest into Earn" | Balance read, daily | S + B/C using App Kit Earn (USDC/EURC vaults over lending protocols; performance fee 0–50%, management fee 0–5%/yr) | USYC needs an allowlist, is for non-US institutions only, and has a $100k minimum [VERIFIED `stablecoins-fx-and-yield.md:46-47`], so it is not a consumer option. Keep a gas float [gotcha #4]. |
| **Bill pay** | "Pay rent to Landlord on the 1st" | Clock plus contact | S + A (recommended) or B | The same as scheduled transfer, plus a document or reference attached via the **Arc Memo** contract (`memo(target,data,memoId,memoData)`). Memo data is public [VERIFIED `transactions-memo-batching.md:18-25`]. |
| **Payment request / split** | "Ask Sam and Lee for $30 each for dinner" | Inbound payment matched to a request | No signing by the requester. The payer signs (A). | No consumer "request money" primitive found. A grep of the Arc docs dump for "payment request / request money / payment link" returned 0 hits. In the Circle dump, "payment request" only appears for CPN (institutional) and x402 routing [VERIFIED 2026-09-29]. Build it as an EIP-681 link/QR plus a Memo `memoId` = request id, and mark a request paid only when the matching inbound transfer is observed (see `history-and-reporting.md`). Venmo supports remind, cancel and scheduled requests [VERIFIED sibling `fintech-ux-analogs.md:66`]. |
| **Agent command on a schedule** (non-money) | "Every morning at 9, tell me my balance and EUR rate" | Clock | S, read-only | Bankr's "Agent Command" automations do exactly this [VERIFIED sibling :72]. |

## 5. Failure handling (per run)

Every run should end in exactly one terminal state: `succeeded`, `skipped(reason)`, `failed(reason)`, or `needs_approval`. None of these may be a silent drop.

| Failure | Detect | Action | Evidence |
|---|---|---|---|
| Insufficient funds | Pre-check the 6-dp balance ≥ amount + gas float + other runs due within the reservation window | `skipped(insufficient_funds)`. Notify, offer "top up / pay now / skip". Don't retry in a loop. Optional backup source (e.g. swap EURC) only if the user set it up. | Gas and payments share USDC [VERIFIED gotcha #4]. Robinhood auto-pauses when the bank is unlinked [VERIFIED sibling :49]. |
| Gas / fee | Set `maxFeePerGas` ≥ 20 gwei | A transaction below 20 gwei is **silently dropped with no receipt**, so floor it | [VERIFIED gotcha #14] |
| Revert despite balance | `receipt.status == 0` | `failed(reverted)`. A blocklisted counterparty reverts and **still consumes gas**. | [VERIFIED gotchas #9, #13] |
| Price moved | The quote at execution time vs `minBuyAmount` / `stopLimit` | The swap reverts or is not sent. Re-arm the trigger. Never widen slippage automatically. | App Kit default slippage is 300 bps [VERIFIED `stablecoins-fx-and-yield.md:30`] |
| Oracle stale | `updatedAt` older than the heartbeat | Skip the price trigger | EUR/USD heartbeat 86400 s [VERIFIED] |
| Delegation expired or revoked | Redemption reverts, or check before sending | `needs_approval`: ask the user to renew | arc-agent observed that an expired session still produced quotes and then failed at execution [REPORTED from arc-agent raw, 2026-07-29] |
| Ambiguous result (timeout after send) | No receipt yet | **Don't resend.** Query by tx hash or Circle idempotency key, then decide. | "Never auto-retry writes on ambiguous errors" (`design-principles-for-agent-writes.md` §2) |
| Missed run (server down) | `now > scheduled_for + grace` | Per-automation policy: `skip` (default for transfers) or `catch_up_once`. **Never** run N missed occurrences in a burst. | [INFERENCE] |

## 6. Idempotency: never pay twice

1. **Occurrence key.** Before executing, insert `occurrence(automation_id, scheduled_for)` with a UNIQUE constraint. A second worker or a retry hits the constraint and stops [INFERENCE; standard queue practice].
2. **Intent before execute.** Write `PaymentIntent{intentId, idempotencyKey(UUIDv4)}` first, and reuse the stored key on every retry. Circle returns the original response for a repeated key [VERIFIED `design-principles-for-agent-writes.md` §2, quoting Circle docs].
3. **Onchain backstop.** With model B, the period caveat caps the total per period, so even a duplicated run can't exceed the weekly amount [INFERENCE from the enforcer natspec, VERIFIED].
4. **Event triggers.** Dedupe on `(txHash, logIndex)`, and on Circle `notificationId` for webhooks, which are at-least-once and unordered [VERIFIED `other-apis.md:20`].
5. **Witness before marking paid.** Mark a run `succeeded` only on a receipt with `status==1` or a Circle `COMPLETE` state. On Arc, `CONFIRMED` is skipped (`SENT → COMPLETE`) [VERIFIED `design-principles-for-agent-writes.md` §1].

## 7. Create by natural language (with confirmation and preview)

Pattern [INFERENCE, grounded in OWASP LLM06 "Implement authorization in downstream systems rather than relying on an LLM" (see `limits-and-safety.md`)]:

1. The user says: "Every Tuesday send Alex ten dollars."
2. The model emits a **typed draft** only: `{type:"scheduled_transfer", recipientName:"Alex", amount:"10", asset:"USDC", rrule:"FREQ=WEEKLY;BYDAY=TU", tz:"Europe/Paris", start:null, end:null}`. The model never sees or outputs addresses.
3. Code resolves "Alex" against contacts (`contacts-and-names.md`), validates the amount against limits, and computes the **next 3 run dates** in the user's timezone.
4. A preview card shows: recipient name + short address + chain, amount, asset, the next 3 dates, end condition, **what happens if funds are short**, attended vs unattended mode, and the maximum exposure ("at most $10 per week; $520/year").
5. The user confirms with a tap plus biometric/passkey. A spoken "yes" alone is not enough (see sibling `05-voice-language-genui/voice-safety-confirmation.md`).
6. For unattended mode, the same confirmation signs the **delegation** (B) or the Agent Wallet OTP flow (C). The delegation's caveats are generated from the draft by code, not by the model.
7. The system replies with the automation id and "next run Tue 6 Oct, 09:00".

Ambiguities to clarify rather than guess: "every week" with no day given; "ten" with no currency (default USDC and state it); the timezone of travelling users; month-end dates ("on the 31st").

## 8. Pause, edit, cancel

| Action | Effect on the schedule | Effect on authority | UX note |
|---|---|---|---|
| Pause | No new occurrences. An in-flight run completes. | Keep the delegation. Optionally `disableDelegation` for safety (`DelegationManager.sol:90`, re-enable at `:103`) [VERIFIED function names]. | Show "paused since …" and a resume button |
| Skip next | Mark the next occurrence `skipped(user)` | none | Common in analogs [INFERENCE] |
| Edit that **narrows** (lower amount, end sooner) | New version, effective immediately | The old broader delegation still exists onchain until disabled, so disable it and issue a new one [INFERENCE] | |
| Edit that **widens** (more money, new recipient, more often) | New version, **requires re-confirmation** plus a new delegation or OTP | New grant | Wise ("You cannot edit a schedule once it is set") and Coinbase force cancel-and-recreate. Robinhood allows edit [VERIFIED sibling :46-49]. Editing in place is better UX, but versions must be kept. |
| Cancel | Stop the schedule | `disableDelegation`, or remove the address from the Agent Wallet allowlist | Cancel ≠ refund. Arc finality means sent runs are final [VERIFIED `context/01-arc/overview-and-architecture.md:67`]. |

Every lifecycle change is itself an audit-log entry with the actor (user, agent proposal, system).

## 9. Audit log per automation

Store `{automation_id, version, occurrence_id, scheduled_for, trigger_evidence (clock | txHash+logIndex | feed value+updatedAt | quote id), checks[] (limits, contact verified, balance), decision, intentId, idempotencyKey, txHash, receipt status, actor, model_proposal_id}`. It is append-only and user-visible as "why did this run / not run". The details are in `history-and-reporting.md`.

## Gaps

- No one has shown a funded redemption of the MetaMask delegation caveats on Arc. The bytecode matches the documented deterministic addresses, but I did not compare it against the audited source. Audit folders exist (`audits/cyfrin`, `audits/diligence`) [VERIFIED listing], but I did not read their scope.
- Whether Circle user-controlled or modular wallets can act as a DeleGator or install such caveats is [UNKNOWN].
- The Gelato Arc status is [UNKNOWN] because its docs site is down.
- CRE deploy access terms and pricing were not checked.
- I found no Arc-native payment-request standard.
