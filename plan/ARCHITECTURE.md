# Kawase architecture (detailed)

Purpose: the detailed architecture from the planning session (2026-09-29), kept current as the build changes. It extends §Architecture in `MASTER-PLAN.md`. If this file and the code disagree, update this file.
Sources: the Plan-agent design of 2026-09-29; `context/08-product-research/*` (see citations inline); doc checks of the verified stack (MASTER-PLAN §Verified stack).
Last updated: 2026-10-01

## 1. Key decisions (K1–K6)

- **K1 One brain.** `agentTurn()` in `packages/agent` serves chat, voice (the LiveKit `llmNode` override), and read-only automation commands. Money automations never pass through the LLM: they use the deterministic draft builders in `packages/intents` and the same `policy.evaluate()`.
- **K2 The model proposes; code resolves, checks and executes.** No model tool takes a `network`, `address` or `approve` parameter. A payment is authorized in exactly one of two ways (D33):
  - **Inside the user's allowance:** the user's signed on-chain delegation is the authorization. The api runs `policy.evaluate()`, and the agent's ops wallet redeems the delegation. The chain refuses anything over the cap, another method or token, native value, or a revoked grant. The user is not prompted.
  - **Above the allowance, or a change of authority:** a fresh signature by the user's wallet over the exact payload, approved with the user's passkey (Face ID). A local Face ID check in our own app is never the binding by itself.
- **K3 Custody (D33, replaces the Circle PIN wallet on 2026-09-30).**
  - **The user's wallet is an ordinary EOA held by Turnkey** in the user's own sub-organization (secure enclave). The user signs in with an email code, a passkey, or Apple / Google; there is no PIN and there are no security questions. It is **one address on both networks**.
  - **Agent authority lives on that same account.** The EOA is upgraded in place with EIP-7702 to MetaMask's `EIP7702StatelessDeleGator`, and ERC-7710 delegations with caveats built in code set what the agent may do: an everyday **allowance** (USDC `transfer` only, an amount per period, an expiry) and one grant per automation (the same plus a pinned recipient). A Kawase **ops-redeemer DCW** (Circle developer-controlled wallet) redeems them. Proven on Arc testnet in spike #15.
  - **Setup costs the user nothing:** the user signs the 7702 authorization and a Kawase relayer sends the type-4 transaction and pays the gas.
  - x402 spending goes through a per-user, per-network **DCW EOA marketplace wallet**; its balance is the hard cap.
  - **Why an EOA:** 7702 and the delegation framework need an ECDSA key, Memo and Multicall3From only accept EOA callers (`context/01-arc/gotchas.md` #27; a 7702-delegated EOA is still accepted, spike #15), and Circle's App Kit works with a viem wallet client.
  - **Fallbacks:** Privy for the key (same design, larger free tier, unproven on Expo 57); or Circle email sign-in with the confirmation screen off plus the separate HybridDeleGator account from spike #4. Research: `context/08-product-research/17-wallet-ux/README.md`.
- **K4 Automations run on DBOS** inside `apps/executor`. Each occurrence or intent is one short workflow; nothing sleeps for weeks.
- **K5 Postgres is the only message bus.** Changes go through an outbox → `pg_notify` → api SSE fan-out, plus DBOS queues for external channels. No Redis.
- **K6 The network is server-authoritative session state.** MMKV caches it on the device. Every write carries `expectedNetwork`, and a mismatch is a hard stop.

## 2. `agentTurn` contract

```ts
agentTurn({
  userId, threadId, net: NetworkContext,            // resolved server-side from the session, never from the model
  locale, surface: 'chat'|'voice'|'automation',
  surfaceCaps: { forms: boolean; cards: boolean; speech: boolean },
  trigger: { type:'user_message', message }
         | { type:'client_tool_result' }             // AddContactForm etc. via addToolOutput
         | { type:'resume', intentId, event }         // fix applied elsewhere (email added, contact saved, network switched)
         | { type:'scheduled_command', automationId } // read-only agent-command automations
}) → { stream: UIMessageStream; done: Promise<TurnResult> }
```

**Turn steps**
1. `loadTurnContext` runs in parallel: the capability summary for `net` (including unavailable capabilities and the reason), balances, the contacts index (names only), limit usage, notification channels (push permission, verified email), and pending intents.
2. The system prompt has a stable, cached prefix (persona, safety, tools). The dynamic tail adds the active network, "Respond in {language}", and a summary of pending intents.
3. `streamText` runs with strict tools. Tools receive `{net, userId, intentId?}` through the execution context. Approval policy is central: `toolApproval: { tool: 'user-approval' | fn }`, which overrides tool-level `needsApproval`, plus `experimental_toolApprovalSecret` (an HMAC over the tool input, so a client can't forge or edit an approval). This is a UX gate only; money still needs the on-chain allowance or a wallet signature (K2). Client: `addToolApprovalResponse` + `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`. No RN polyfills are needed on Expo 57 (spike #7).
4. `toModelOutput` compacts tool results for the model; the full card spec stays in the UI part.
5. `onEnd` persists messages.

**Surface adapters**
- **Chat:** `createUIMessageStreamResponse`, consumed by `useChat` with `expo/fetch`.
- **Voice:** text deltas go to TTS. Card parts go to `performRpc('ui.show')`, and also to the thread SSE, which is canonical (cards are idempotent by `cardId`).
- **Email and push (D31; Telegram and Discord were removed on 2026-09-30):** plain text. Anything that needs a form or a signature is a link into the app: `/i/{intentId}?t={resumeToken}`.
- **Automation:** collected output, read-only tools only.

`policy.evaluate()` runs at three points: when drafting (propose tools), at approval (api, with a fresh snapshot plus a limit reservation), and at execution (executor).

## 3. Intents and "resolve and resume"

- `intent_id` is a UUIDv7. `draft_version` increases on every material change. Each version is an immutable `intent_drafts` row holding `draft_hash = hashStruct(Draft)` (EIP-712).
- **States (A2A):**
  - `submitted → working → input_required | auth_required → ready_for_approval → approved → executing → completed`
  - Terminal states: `failed`, `rejected`, `canceled`, `expired`, `unknown_outcome`.
- **Blocker precedence:** error > policy > precondition > clarification. Warnings attach to the confirm card instead of blocking. When several things block at once, the screen shows them all together and voice walks through them one at a time.
- Each fix has its own endpoint, and each fix writes an outbox event `precondition.cleared{reason,userId,network}`.
- The `resume-intents` workflow calls `agentTurn(trigger:'resume')`, which re-runs every check. The same event clears the prompt on the user's other devices.
- **Policy refusal is terminal.** The only options offered are: edit the amount (a new version with fresh authorization), open the rule (step-up plus a signed setting change), or cancel. Never offer to split the payment or "send the rest later".
- **Network-unavailable capability:** show a `NetworkSwitchCard`. After a switch to testnet, auto-resume. After a switch to mainnet, read-only requests resume, but money requests start over as a new intent marked REAL MONEY.
- Re-asking is capped by `RESUME_MAX_REASKS`.
- A voice correction that arrives against a stale version is rejected, because approval requires `draft_version == current` and the draft not voided.

## 4. Approval binding

| What is being approved | How it is authorized |
|---|---|
| A USDC payment inside the everyday allowance | **No user signature.** After `policy.evaluate()` and a `spend_ledger` reservation, the executor has the ops DCW call `DelegationManager.redeemDelegations` on the user's allowance delegation; the `transfer` executes from the user's own account. The chain enforces token, method, amount per period and expiry. The receipt's `Transfer` event is compared with the draft. |
| A payment above the allowance, or any other call from the wallet (swap and bridge steps) | **The wallet signs the exact transaction.** The api builds the unsigned transaction from `intent_drafts[v]` (`intents/derive/wallet-tx.ts`), the device signs it with the Turnkey-backed account after a passkey prompt, and posts the signed bytes back. The api decodes them, checks `from`, `to`, `data`, `value`, `chainId` and the nonce against the draft, stores `(network, from, nonce, tx_hash)`, then broadcasts through our RPC. A mismatch raises `security.draft_mismatch` and freezes the intent. |
| A settings or authority change | An EIP-712 `KawaseAuthorization` signed by the wallet (passkey), checked with viem `verifyTypedData` against the wallet address. Tightening a setting needs only a tap. |
| A grant (the allowance, or one automation) | The MetaMask `Delegation` typed data (domain: DelegationManager, chainId) signed by the wallet (passkey). The 7702 account validates its own ECDSA signature. |
| First-time setup | One EIP-7702 authorization for `EIP7702StatelessDeleGator`, signed by the wallet; the relayer sends the type-4 transaction. |
| Revoking a grant | `DelegationManager.disableDelegation`, sent directly by the wallet as one ordinary transaction (with 7702 the EOA is the delegator). |

**Wallet signing rules**
- The signer is a viem account backed by the wallet provider (`packages/integrations/wallet`): `signAuthorization`, `signTypedData`, `signTransaction`. The MetaMask kit uses it unchanged (`toMetaMaskSmartAccount({ implementation: Stateless7702, address, signer })`). A local-key implementation of the same interface runs the tests.
- **Face ID is enforced by the wallet provider, not only by our app.** Once a user has a passkey, a Turnkey policy requires a passkey stamp for wallet signatures, so a stolen session or our own server cannot sign for the user. Before a passkey exists (email-only sign-up), signatures use the session key behind an app-level biometric check, and the app asks the user to add a passkey.
- Signatures are always over the full payload; the confirm card renders the decoded draft or the decoded caveat receipt immediately before the prompt.
- The Circle 10.x SDKs (used for the ops and marketplace wallets) throw `{ message, code, status }`; match on `code`.

**Delegation caveats (built in code)**
- `AllowedTargets` = USDC `0x3600…`
- `AllowedMethods` = `transfer`
- `ERC20PeriodTransferEnforcer` (the amount per period)
- `Timestamp` (expiry)
- `Redeemer` = the ops redeemer
- Automation grants add `AllowedCalldata` pinning the recipient.
- Native value is refused because no caveat allows it (spike #15, check 9).

The "can / can-never" receipt is **decoded from the signed caveat bytes**, not from the draft.

```ts
domain = { name: 'Kawase', version: '1', chainId: net.chainId }
KawaseAuthorization { bytes32 intentId; uint32 draftVersion; bytes32 draftHash; string action;
                      bytes32 subjectBefore; bytes32 subjectAfter; uint64 expiresAt; bytes32 nonce }
SendDraft { uint256 chainId; address from; address to; address asset; uint256 amount; bytes32 memoHash; uint256 maxFee }
```

**Approval endpoint sequence**
1. Lock the intent.
2. Check version, expiry and network.
3. Run a fresh `evaluate()`. Its result includes the route: `allowance` or `wallet_signature`.
4. Reserve spend in `spend_ledger`.
5. Re-quote. If the quote changed, create a new version with a `ReQuoteCard` and abort.
6. Insert `tx_attempts(prepared)`.
7. Route `allowance`: enqueue the redeem in the executor and return `{ status: 'executing' }`. Route `wallet_signature`: return `{ unsignedTransaction | typedData }` for the device to sign; a second call submits the signature.

**What decides the route** (`policy.evaluate()`; Claude's proposal, Abu can change the thresholds)
- Inside the remaining allowance, to a recipient the user has paid before or named in this request: `allowance`.
- Over the remaining allowance; a first payment to a new address above `NEW_RECIPIENT_PROMPT_BASE_UNITS`; raising a limit; creating or widening a grant; exporting the key: `wallet_signature`.

**One sign-in (decided by spike #16, `plan/spikes/16-turnkey-wallet.md`).** Turnkey's Auth Proxy is the sign-in: email code, Apple, Google, passkey. The api trusts a proof of the Turnkey session (the client signs a server nonce with its session key; the server checks the key is registered on that sub-organization user through the parent organization's read access, then issues Kawase's own session). Better Auth is dropped: two email codes would break "one sign-in". Guests are Kawase users without a sub-organization until their first sign-in. Wallet approval above the allowance always comes from the wallet's passkey, never from a Kawase session alone.

**Guests and account linking (spike #10 decided the shape with Better Auth; spike #16 moved it to Kawase's own tables)**
- A guest is a Kawase `user` row with `is_anonymous = true` and a device session, no sub-organization. On the first Turnkey sign-in from a guest session, one function in `packages/db` moves **every user-owned table** to the signed-in user in a single transaction, then deletes the guest row. A test fails when a user-owned table is missing from that list. If the move throws, the sign-in fails, nothing is lost, and a retry completes it.
- Sessions are opaque tokens (hashed at rest) in `sessions`, one per device; the app sends them as a bearer header, the web app as a cookie. Server-side callers must not rely on cookies.
- Passkeys are Turnkey authenticators on the user's sub-organization; they need one real domain that Abu controls (a passkey is tied to its domain for life), serving `apple-app-site-association` and `assetlinks.json`. Until then sign-up is by email code, Apple or Google.

**App Kit multi-step operations (spike #3, to be re-run with the new wallet in spike #16)**
- The wallet is an EOA, so App Kit runs through `createViemAdapter` (`@circle-fin/adapter-viem-v2/next`) with **our own `SigningStrategy`** and `atomicBatch: false`. Each prepared call is one wallet-signed transaction (approve + action for a swap or a bridge).
- For each `evm-calls` payload, the Kawase strategy:
  1. runs `policy.evaluate()` on the decoded call against the draft;
  2. inserts `tx_attempts(prepared)` with our v4 idempotency key and `refId={intentId}:v{n}:s{step}`;
  3. writes an outbox `signature.required` (→ SSE → device) and waits for the signed transaction;
  4. verifies it against the prepared call, broadcasts it, and returns the `txHash`.
- `kit.swap` / `kit.bridge` run inside an **executor DBOS workflow**, because the call must stay alive across the owner's approvals. Persist kit `steps` / progress as they arrive; resume a bridge with `kit.retryBridge`.
- To try later (Claude's idea, unproven): with a 7702 account the approve and the action could go in one self-call batch, so a swap needs one Face ID instead of two.
- Default for leaving Arc: CCTP with `useForwarder: true` (Circle mints on the destination; the fee comes out of the amount).

## 5. Idempotency and reconciliation

- **API:** an `Idempotency-Key` header, stored in `api_idempotency`.
- **Occurrences:** both `UNIQUE(automation_id, automation_version, scheduled_for)` and `UNIQUE(automation_id, scheduled_for)`, so an edit can never pay the same slot twice.
- **Side effects:** a UUIDv4 key is persisted **before** calling Circle (Circle requires v4 and rejects a reused key with a different body). Raw transactions persist `(network, from, nonce)` and `tx_hash` before broadcasting. Delegation redeems go through DCW, which also takes a Circle key. x402 uses `payment-identifier`.
- **Mark paid only on a witness:** a receipt with `status==1`, or Circle `COMPLETE` (on Arc the flow goes SENT → COMPLETE with no CONFIRMED step).
- **Ambiguous outcome:** mark `unknown_outcome` and never auto-retry. A reconcile workflow runs every `RECONCILE_INTERVAL_MS`, with a Coolify scheduled task as backup. It sweeps `tx_attempts` stuck in `signature_pending|submitted|unknown` and looks them up on the chain (hash, or `from` + nonce) and, for ops-wallet redeems, via Circle (idempotency key or `refId`). An approval that was never signed becomes `not_sent`.
- **On app open:** show what happened to each pending write.
- **Chain events:** `UNIQUE(chain_id, tx_hash, log_index)`. Payments are projected from the system emitter `0xffff…FFFE` only, because it emits a double log. `workflowID = "{chainId}:{tx}:{log}"`.
- **Circle webhooks:** deduplicated by `notificationId` in `provider_webhook_events`.
- **Concurrent spending:** a per-(user, network) advisory lock plus `spend_ledger` reservations (`reserved → committed | released`). Window sums count reserved and committed rows together.

**As built for sends (Stage 5a, 2026-10-01)**
- `apps/api/src/send/service.ts` holds the whole path; `packages/policy` (`evaluateSend`) and `packages/intents` (`SendDraft`, `sendDraftHash`, the state table) are pure.
- **Checks before the lock, reservation under it.** Approve and signature-submit first re-run resolution and the policy on fresh facts (chain reads included) *outside* any transaction; only then do they take the intent's row lock plus `pg_advisory_xact_lock(hashtextextended('{user}:{network}'))` and, on that one connection, re-check state, version and the app limits (`fitsLimits`) before inserting the approval, the `spend_ledger` reservation and the `tx_attempts` row. A transaction must never borrow a second pooled connection: the first build did, and two simultaneous taps deadlocked the pool (found by the testnet test).
- **Allowance route:** the prepared redeem (`to`, `data`, `grantId`) is stored in `tx_attempts.receipt.prepared` with the v4 key before Circle is called, so a lost answer is recovered by calling Circle again with the same key and body (Circle returns the same transaction). `refId = {intentId}:v{version}`.
- **Wallet route:** the api builds the transfer (nonce from `pending`, fees floored at 20 gwei, gas × 1.3), stores it on the approval row, and on submit checks signer, chain, token, calldata, value, nonce and `gas × maxFeePerGas ≤ draft.maxFee`. The hash (`keccak256(signedTx)`) is stored before broadcast. A node refusal that is clearly pre-acceptance (nonce too low, insufficient funds) settles as `not_sent`; anything unclear is left to the tracker.
- **Tracking lives in the api for now** (`track()` after approve for ~90 s, on `GET /sends/:id` while in flight, and a sweeper every `RECONCILE_INTERVAL_MS`). It moves into the DBOS executor in Stage 8, with no change to the guarantees. After `SEND_UNKNOWN_AFTER_S` without a witness the intent shows `unknown_outcome` ("still checking") and is only ever re-checked.
- **Witness:** completed only when the receipt has a `Transfer` log from the draft's token with the draft's from, to and amount; on success the ledger row commits, the contact address's per-network trust is bumped, and `send.completed` goes to the outbox.
- **Chat:** `propose_send` takes the person's words; an `0x…` recipient must appear verbatim in their latest message (checked in the tool). A newer proposal in the same thread cancels any earlier open one, so an old card cannot be approved by mistake. The model sees `summarizeSend()` (plain English, formatted amounts); the card gets the intent and follows it live.

**As built for swaps (Stage 6a, 2026-10-01)** — replaces spike 3's "kit runs in a DBOS workflow, one PIN per step" plan.
- **App Kit builds, the wallet signs once.** `packages/integrations/app-kit` runs `kit.swap` with a *capture* `SigningStrategy` (`atomicBatch: true`, `allowanceStrategy: "approve"`) that takes the prepared `evm-calls` payload (approve + adapter `execute`) and stops the kit before anything is signed. The api wraps the calls into one transaction the wallet sends to itself, `executeWithMode(BatchDefault, calls)` on its EIP-7702 StatelessDeleGator code (`encodeSelfBatch`), so approve + swap is one Face ID and all-or-nothing. No kit process has to stay alive while the person decides; a crash between approval and signature leaves only a pending approval row.
- **Checked before the wallet is asked** (`checkSwapCalls`): only the App Kit adapter as target and spender, an approval of exactly `amountIn`, no native value, every output's beneficiary the wallet itself, `tokenInputs` exactly `amountIn`, the route deadline not passed, and the calls' own `minTokenOut` ≥ the draft's `minOut`. A route below the shown minimum makes a new version (the price moved); a route that cannot be built is `quote_unavailable` (try again), never a new version.
- **Draft and witness:** `SwapDraft` (EIP-712: chainId, from, tokenIn, tokenOut, amountIn, minOut, maxFee) is hashed; the estimate, Circle's market rate and the fees are shown but not hashed. The signed transaction must equal the handed-out one (to = from, data, nonce, value 0, fee cap). Completed only when the receipt's `Transfer` logs show exactly `amountIn` of `tokenIn` leaving the wallet and at least `minOut` of `tokenOut` arriving; the amount that arrived is stored and shown.
- **Slippage:** the "at least" floor shown is `maxSlippageStableBps` (2% testnet, 1% mainnet); the route is built at half of it (`SWAP_ROUTE_SLIPPAGE_DIVISOR`), so a small tick between quote and Face ID still clears the floor. The rate is compared with Circle's token rates: a warning above `warnRateGapBps`, a refusal above `maxRateGapBps`.
- **Not covered by the allowance:** a swap is always the owner's own confirmation (Face ID, an email code on the web); the agent's `propose_swap` never approves.
- **Own transactions are not income:** the incoming watcher skips a transfer whose transaction is one of the person's own `tx_attempts`; Activity folds one currency out + another in, in one transaction, into one "Swapped" item.

**As built for bridges (Stage 6b, 2026-10-01)** — the swap shape, plus a second chain.
- App Kit's `bridge` (CCTP V2 with Circle's forwarder) is captured like a swap: approve + `bridgeWithPreapprovalAndHook` → one self-batch transaction. `checkBridgeCalls` decodes the bridge params (amount, USDC, `mintRecipient` = the person's own address, the destination's CCTP domain, no developer fee, open destination caller, the forwarder hook, `maxFee` ≤ the cap shown).
- `BridgeDraft` (EIP-712: chainId, from, token, amount, destinationDomain, recipient, maxRouteFee, maxFee). The cap is the quoted fee + 20%; the version stands while the fresh *raw* fee is within it.
- Tracking is three-legged: the burn receipt (exactly `amount` out of the wallet) → IRIS `/v2/messages/{arcDomain}?transactionHash=` (attestation, `forwardState`, `forwardTxHash`; `CONFIRMED` or `COMPLETE` = delivered) → the mint's receipt on the destination chain (USDC to the person ≥ amount − cap). Progress lives in the attempt's `receipt` JSON (`burnConfirmed`, `forward`, `mintTxHash`, `received`); the intent stays `executing` until delivered, `unknown_outcome` if the forward fails.
- `compare_bridge_routes` fetches LI.FI (both networks), Relay and deBridge (mainnet) quotes for the same transfer and shows them ranked, with reason codes; only the CCTP route executes today.
- Activity labels a transfer whose transaction is the person's own bridge intent as "Bridged to {chain}".

**As built for earn (Stage 6c, 2026-10-01)** — the swap shape with a vault on the other side.
- App Kit Earn deposits and withdraws through the same adapter as swaps (approve + `execute`); the vault's ERC-4626 shares are the other token. `checkEarnCalls` = `checkSwapCalls` with the draft's bounds: a deposit takes exactly `amount` USDC and must mint at least `minOut` shares; a withdrawal burns at most `maxIn` shares (App Kit picks the number) and must pay at least `minOut` USDC; approvals may be one base unit over what is taken (App Kit's rounding buffer).
- `EarnDraft` (EIP-712: chainId, from, vault, action, amount, maxIn, minOut, maxFee); floors and the share ceiling come from the vault's own previews (`EARN_FLOOR_BPS` 99%, `EARN_SHARES_CEILING_BPS` 101%). The vault is inferred when not named (best active one for a deposit, largest position for a withdrawal).
- Positions are read from the vaults on chain, never stored; the receipt witness checks USDC and share transfers for the wallet in each direction.

**As built for automations (Stage 8a, 2026-10-01)**
- `automations` (schedule in the person's zone, action with the resolved recipient, status, grant, next run) and `automation_runs` (unique per automation and scheduled time: the claim that makes each occurrence run once).
- The grant (`buildAutomationGrant`): transfer-only, recipient pinned by `AllowedCalldata`, `ERC20PeriodTransfer` cap = the amount per period (day / week / 28 days), redeemer = the ops wallet, expiry = the automation's end. Signed once by the wallet (Face ID); revoked by the wallet on cancel.
- The runner (`AutomationService.tick`, every 30 s in the api for now): claim → re-check with the send rules on fresh facts and the grant's on-chain room → `SendService.runAutomation` (intent `originSurface: automation`, approval `route: automation`, ledger, attempt, ops redeem) → the usual tracking and witness; runs settle from their intent's state. Skips carry a reason code and an inbox item.

**Circle webhooks (decided by spike #13, `plan/spikes/13-webhooks.md`)**
- `POST /webhooks/circle` verifies `X-Circle-Signature` (ECDSA-SHA256) over the **raw** body with the public key for `X-Circle-Key-Id` (cached), then inserts `(source, notificationId)` under a unique key and acts only when the insert is new. HEAD returns 200 for Circle's URL check.
- Notifications can arrive out of order and are retried within seconds; every handler is driven by the state in the payload. `webhooks.test` (all-zero id) is a ping.

## 6. Outbox

1. `db/tx.ts withOutbox(tx, events)` writes the event in the same transaction as the change. In the executor this is a DBOS `DrizzleDataSource` transaction step.
2. After commit, `pg_notify('kawase_events', id)`.
3. The api LISTENs and pushes to per-user SSE streams (app, web, voice worker).
4. The executor's notify queue drains undispatched rows into `deliveries UNIQUE(outbox_id, channel, target_ref)`. It applies prefs, quiet hours and network prefixes. Security events are never muted, and a delivered message is never re-sent.
5. Every user-facing event is also written to `inbox_items`, which is the source of truth.

## 7. Drizzle schema

**Conventions**
- IDs are UUIDv7 generated by the app. Circle idempotency keys are separate v4 columns.
- Money is `numeric(78,0)` base units, handled as bigint in TypeScript.
- `network` is a pg enum `('mainnet','testnet')`. On-chain rows also store `chain_id`.
- Identity: `user` (+ `turnkey_sub_organization_id`, `turnkey_user_id`, `email`, `is_anonymous`), `sessions` (token hash, device, expiry) and `sign_in_nonces` are Kawase tables. Turnkey owns the credentials (email, Apple, Google, passkeys).

| Table | Key columns | Unique / index |
|---|---|---|
| user | email, turnkey_sub_organization_id, turnkey_user_id, is_anonymous, locale, reply_language, display_currency, timezone, theme, active_network (default testnet), risk_mode, practice_mode, paused_all_at | UNIQUE(email), UNIQUE(turnkey_sub_organization_id) |
| sessions | user_id, device_id, token_hash, expires_at, revoked_at | UNIQUE(token_hash) |
| sign_in_nonces | nonce, expires_at, used_at | PK(nonce) |
| devices | user_id, platform, expo_push_token, app_version, locale, biometric_enrolled, last_seen_at, revoked_at | UNIQUE(expo_push_token) |
| user_wallet_setup | user_id, network, delegator_impl, setup_tx_attempt_id, setup_at, allowance_grant_id | PK(user_id, network) |
| wallets | user_id?, network?, role (user/marketplace/external/ops_redeemer/relayer/faucet_drip), custody (turnkey/circle_dcw/external), address, provider_ref (Turnkey sub-organization + wallet id, or Circle wallet id), status | UNIQUE(role, network, address); the `user` wallet is one row with `network` null (one address on both networks) |
| contacts | user_id, display_name, aliases[], phonetic, notes (untrusted), deleted_at | UNIQUE(user_id, lower(display_name)) live |
| contact_addresses | contact_id, user_id, chain_key, address, version, is_preferred, source, source_detail, status (pending_cooldown/active/retired/blocked), supersedes_id, activates_at, approval_id | UNIQUE(contact_id, chain_key, address); partial UNIQUE preferred |
| contact_address_trust | contact_address_id, network, first_paid_at, last_paid_at, payment_count, verified_at, verified_method, cooldown_ends_at, allowlisted, allowlist_approval_id, change_hold | PK(contact_address_id, network) |
| contact_address_events | contact_id, old/new_address_id, requested_by, approved_by, cooldown_ends_at, reason (append-only) | idx(contact_id, created_at) |
| threads | user_id, title, origin_surface, rolling_summary, summary_upto_seq, last_message_at, archived_at | idx(user_id, last_message_at) |
| messages | id (UIMessage id), thread_id, seq, role, parts jsonb, metadata jsonb, search tsvector | UNIQUE(thread_id, seq); GIN(search) |
| intents | user_id, thread_id, network, kind, origin_surface, a2a_state, current_draft_version, blockers jsonb, policy_version, practice, expires_at, parent_intent_id, occurrence_id, resume_token_hash, completed_at | idx(user_id, a2a_state); UNIQUE(resume_token_hash) |
| intent_drafts | intent_id, version, payload jsonb, draft_hash, quote_ref, quote_expires_at, created_by, policy_report, voided_at, void_reason | PK(intent_id, version) |
| approvals | intent_id, draft_version, draft_hash, user_id, network, tier, route (allowance/wallet_signature), signed_payload, signature, signer_address, passkey_verified, device_id, status, decided_via_surface, expires_at | partial UNIQUE(intent_id, draft_version) live |
| grants | user_id, network, kind (allowance/automation), scope, automation_id, delegator_wallet_id, delegate_address, delegation jsonb, delegation_hash, receipt jsonb, period_amount, period_seconds, recipient_address, expires_at, status, revoke_tx_attempt_id, approval_id | UNIQUE(network, delegation_hash) |
| automations | user_id, network, kind, version, status, authority_mode (attended/delegated/practice), rule jsonb, timezone, recipient_contact_address_id, asset, amount, per_run_cap, period_cap, ends_at, missed_run_policy, next_run_at, grant_id, paused_reason | idx(status, next_run_at) |
| automation_versions | automation_id, version, snapshot, changed_by, approval_id | UNIQUE(automation_id, version) |
| occurrences | automation_id, automation_version, network, scheduled_for, trigger_evidence, status, reason_code, intent_id, workflow_id | UNIQUE(a_id, a_version, scheduled_for) + UNIQUE(a_id, scheduled_for) |
| tx_attempts | intent_id, occurrence_id, network, chain_id, attempt_no, kind, provider, idempotency_key uuid, provider_ref, from/to, nonce, tx_hash, status (prepared/signature_pending/submitted/pending_chain/confirmed/reverted/dropped/not_sent/unknown), receipt, error_code, last_reconciled_at | UNIQUE(idempotency_key); UNIQUE(intent_id, attempt_no); partial UNIQUE(chain_id, tx_hash); partial UNIQUE(network, from, nonce) |
| spend_ledger | user_id, network, intent_id, category, amount_usd_base, state, window_at | UNIQUE(intent_id, category) |
| chain_events | network, chain_id, block, block_hash, tx_hash, log_index, emitter, kind, from, to, asset, amount, decimals, matched_user_id, matched_wallet_id, workflow_id, processed_at | UNIQUE(chain_id, tx_hash, log_index) |
| indexer_cursors | network, stream, last_block | PK(network, stream) |
| provider_webhook_events | provider, external_id, payload, received_at, processed_at | UNIQUE(provider, external_id) |
| outbox | aggregate_type, aggregate_id, user_id, network, event_type, payload, dedupe_key, dispatched_at, attempts | UNIQUE(dedupe_key); partial idx undispatched |
| deliveries | outbox_id, user_id, channel, target_ref, status, attempts, last_error, provider_message_id | UNIQUE(outbox_id, channel, target_ref) |
| inbox_items | user_id, network, category, severity, title_key, params, intent_id, read_at, acted_at, expires_at | idx(user_id, read_at) |
| notification_prefs | user_id, scope (mainnet/testnet/any), category, channel, enabled, min_amount, quiet_start, quiet_end | PK(user_id, scope, category, channel); CHECK security never disabled |
| token_rules | user_id, access_level, unverified_per_trade_cap, unverified_daily_budget, max_price_impact_bps, max_slippage_bps, approval_id | PK(user_id) |
| token_rule_entries | user_id, network, token_address, action (allow/block), reason, approval_id | UNIQUE(user_id, network, token_address) |
| limits | user_id, network, kind (per_tx/daily/weekly/approval_threshold/new_recipient_cooldown_s/new_recipient_cap/gas_float), value, temp_value, temp_until, approval_id | PK(user_id, network, kind) |
| marketplace_budgets | user_id, network, per_call_max, session_max, daily_max, auto_approve_under, enabled, marketplace_wallet_id, approval_id | PK(user_id, network) |
| marketplace_purchases | user_id, network, intent_id, thread_id, listing_id, service_host, service_url, price, pay_to, payment_identifier, tx_attempt_id, status, response_digest, response_bytes | UNIQUE(payment_identifier) |
| audit_log | user_id, actor, actor_ref, action, subject_type, subject_id, network, intent_id, policy_version, checks, decision, reason_code, model_id, tool_call_id, device_id, prev_hash, hash (append-only; UPDATE/DELETE revoked) | idx(user_id, created_at) |
| faucet_claims | user_id, wallet_address, amount, claim_day, status, tx_attempt_id, ip_hash | per-day partial UNIQUEs; CHECK testnet |
| consents | user_id, kind (terms/mainnet_real_money/meme_risk/marketplace_risk/voice_retention), version, locale, accepted_at | PK(user_id, kind, version) |
| payment_requests | user_id, network, amount, asset, memo_id, token_hash, status, paid_chain_event_id | UNIQUE(token_hash) |
| memory_facts | user_id, text, source_message_id, deleted_at | — |
| voice_sessions | user_id, thread_id, room, pipeline, language, stt, tts, started_at, ended_at | UNIQUE(room) |
| api_idempotency | user_id, key, request_hash, response | UNIQUE(user_id, key) |

## 8. Tool → policy checks

- **resolve_recipient**
  - Emits `CLARIFY_RECIPIENT_UNKNOWN`, `CLARIFY_RECIPIENT_AMBIGUOUS` or `CLARIFY_RECIPIENT_FUZZY`, `POLICY_ADDRESS_CHANGED_HOLD`, `STOP_LOOKALIKE`.
  - Addresses may only come from contacts or appear verbatim in the user's own message.
- **propose_send** checks:
  - capability, network, consent, wallet-ready
  - recipient trust: cooldown, allowlist, change-hold, first-payment warning, mismatch with the last paid address
  - limits (per_tx, daily, weekly), counting reservations
  - balance + `gas_float`
  - `PRECOND_FEE_RESERVE`: offers an editable new draft
  - `CLARIFY_ASSET`, pause-all, practice mode, and a PII warning on the memo
- **propose_swap**
  - `POLICY_TOKEN_RULE`: access level, per-trade cap, unverified daily budget.
  - Blocks GoPlus high-risk tokens.
  - `POLICY_PRICE_IMPACT` / slippage: a warning below the user's max, a refusal above it.
  - Also checks limits and balance, and applies the brake (S17).
- **compare_bridge_routes** checks per-provider capability on the network and minimum amounts, then ranks routes by net amount received (`02-defi-bridge-trade/cheapest-route-design.md`).
- **buy_service**
  - Checks the budget (per-call, session, daily), consent, and that `payTo`/asset/network/amount match the payment requirements.
  - The listing must come from Discovery.
  - Not allowed in a tainted turn; capped at `MAX_PURCHASES_PER_TURN`.
- **draft_automation** checks:
  - `CLARIFY_SCHEDULE`, `CLARIFY_TZ`, `CLARIFY_ASSET`
  - the recipient is *verified* before any unattended use
  - `PRECOND_GRANT_REQUIRED`
  - `PRECOND_CHANNEL_NOT_LINKED` when the automation is attended
  - read-back plus a dry run showing the next three dates
- **Settings tools**
  - Loosening a setting needs `step_up_wallet_sign`; tightening needs only a tap.
  - `propose_contact_address_change` puts the new address on cooldown plus hold. If the change was suggested by external content, it is flagged.
- **Channels:** `connect_channel` shows a `ConnectChannelCard` with an async wait state. Security notifications cannot be muted.

## 9. Constants (`packages/config`, `packages/networks`)

**`config`** holds `as const` values with units in the names (`_MS`, `_S`, `_BPS`, `_BASE_UNITS`); money values are bigint.

| File | Contents |
|---|---|
| `limits.ts` | `DEFAULT_LIMITS` per network (24 h new-recipient cooldown, slippage 50/300 bps), `DEFAULT_ALLOWANCE_PER_DAY_BASE_UNITS`, `NEW_RECIPIENT_PROMPT_BASE_UNITS`, `ALLOWANCE_GRANT_TTL_S` |
| `timeouts.ts` | `INTENT_TTL_S`, `QUOTE_TTL_S`, `APPROVAL_TTL_S`, `PROVIDER_QUOTE_TIMEOUT_MS=3000`, `STEP_UP_MAX_AGE_S` |
| `fees.ts` | `MIN_MAX_FEE_PER_GAS_GWEI=20n`, `GAS_FLOAT_USDC` |
| `cache.ts` | `QUOTE_CACHE_TTL_MS=15_000` |
| `automation.ts` | `AUTOMATION_TICK_MS`, `LATE_GRACE_S`, `AUTOMATION_APPROVAL_TIMEOUT_S`, `DCA_MIN_INTERVAL_S`, `ALERT_HYSTERESIS_BPS`, `RECONCILE_INTERVAL_MS` |
| `models.ts` | `agentChat`/`agentVoice` = `claude-sonnet-5-5`, `utility` = `claude-haiku-4-5` plus a fallback constant (Haiku retires no earlier than 2026-10-15) |
| `voice.ts` | per-locale STT/TTS vendor and pipeline |
| `locales.ts` | `SUPPORTED_LOCALES=[en,zh,hi,es,fr,ar,bn,pt,ru,ur]`, `RTL_LOCALES` |
| `queues.ts`, `events.ts` | DBOS queue/workflow names, the outbox event enum |
| `marketplace.ts`, `faucet.ts` | marketplace and faucet constants |

**`networks`**
- `addresses.ts`, with a source comment on every entry:
  - USDC `0x3600000000000000000000000000000000000000`
  - EURC
  - system emitter `0xffff…FFFE`
  - Memo, Multicall3From, Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`
  - DelegationManager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`
  - EIP7702StatelessDeleGator `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` (the user account's code after setup)
  - HybridDeleGator `0x48dBe696A4D990079e039489bA2053B36E8FFEC4` (only for the Circle fallback)
  - SimpleFactory `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c`
  - ERC20PeriodTransfer `0x474e3Ae7E169e940607cC624Da8A15Eb120139aB`
  - ERC20TransferAmount `0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc`
  - AllowedTargets `0x7F20f61b1f09b08D970938F6fa563634d65c4EeB`
  - AllowedMethods `0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5`
  - AllowedCalldata `0xc2b0d624c1c4319760C96503BA27C347F3260f55`
  - Redeemer `0xE144b0b2618071B4E56f746313528a669c7E65c5`
  - Timestamp `0x1046bb45C8d673d4ea75321280DB34899413c069`
  - LimitedCalls `0x04658B29F6b82ed55274221a06Fc97D318E25416`
  - ValueLte `0x92Bf12322527cAA612fd31a0e810472BBB106A8F`
  - NativeTokenPeriodTransfer `0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9`
  - EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  - P256 precompile `0x100`
  - These are identical on both networks; source: `context/08-product-research/03-wallets-custody-limits/delegation-session-keys-limits.md` §2a.
- `providers.ts`
- `contexts.ts`
  - Mainnet: RPC `https://rpc.mainnet.arc.io`, Circle `ARC`, App Kit `Arc`.
  - Testnet: RPC `https://rpc.testnet.arc.io` / `.arc.network`, Circle `ARC-TESTNET`, App Kit `Arc_Testnet`.
  - `circleKeyRef` gives the key name only.

**`env`** is the only reader of `process.env`, with a zod schema per app. User limits, rules and budgets live in the database; `config` only supplies defaults.

## 10. Security, performance and spikes

See MASTER-PLAN §Security, §Performance and Stage 1. Results go to `plan/spikes/`.
