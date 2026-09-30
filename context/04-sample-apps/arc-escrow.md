# arc-escrow
Freelance escrow on Arc testnet: an LLM extracts amount + deliverables from an uploaded contract (PDF/DOCX), a per-agreement Refund Protocol contract is deployed via Circle Smart Contract Platform, the client deposits USDC, and a GPT-4o vision check of the submitted image decides whether funds are released to the freelancer (withdraw) or the freelancer refunds.
Sources: https://github.com/circlefin/arc-escrow, refs/circlefin/arc-escrow @ d5006bc, https://docs.arc.io/build/sample-apps/arc-escrow (listed at .firecrawl/docs/arc-llms-full.txt:18871; card text at :34845-34848 "AI-powered work validation and USDC settlement ... using Circle Wallets, Refund Protocol, and Contract Platform"; also cited as the "Programmable escrow" example at :35321-35325). Upstream contract: https://github.com/circlefin/refund-protocol (master a7ae494, 2026-06-18).
Verified: 2026-09-29
Organizer mapping: this is the designated starting point for RFB3.

## 1. What it does
- Sign up (email/password or Google via Supabase). Server action creates a Circle wallet set named after the user's email + one SCA dev-controlled wallet on `CIRCLE_BLOCKCHAIN` and stores it in `wallets` (`app/actions/index.ts:63-117`, calls `app/api/wallet-set/route.ts:33` and `app/api/wallet/route.ts:38`). Faucet button hits Circle faucet API (`app/api/wallet/balance/request/route.ts:36`).
- Depositor (client) picks a beneficiary and uploads a PDF/DOCX agreement. Text is extracted (pdf-parse / mammoth) and `gpt-4o-mini` returns JSON `{amounts[], tasks[]}` (`app/api/contracts/analyze/route.ts:40-113`). A `transactions` row (type defaults to `DEPLOY_CONTRACT`, `app/services/agreement.service.ts:39`) and `escrow_agreements` row (terms JSON) are created (`app/hooks/useContractUpload.ts:135-171`).
- "Deploy" -> `POST /api/contracts/escrow` deploys a fresh RefundProtocol contract per agreement from the agent (arbiter) wallet via `circleContractSdk.deployContract` (`app/api/contracts/escrow/route.ts:112-131`). Circle webhook COMPLETE -> agreement `OPEN` (`app/api/webhooks/circle/route.ts:63-71`).
- Depositor clicks "Deposit funds" (`components/escrow-agreements-item.tsx:260-270`): server signs USDC `approve(escrow, amount)` with depositor's wallet (`app/api/contracts/escrow/deposit/approve/route.ts:115-126`); when the approval tx row flips to COMPLETE (Supabase Realtime, `components/escrow-agreements.tsx:137-185,302`) the client calls `/deposit`, which signs `pay(beneficiary, amount, refundTo=depositor)` (`app/api/contracts/escrow/deposit/route.ts:121-136`). Webhook COMPLETE -> `LOCKED` (`webhooks/circle/route.ts:109-124`).
- Beneficiary (freelancer), in LOCKED state, either "Submit work" (upload image) or "Issue refund" (`components/escrow-agreements-item.tsx:275-309`). Submit -> GPT-4o vision validates image against extracted tasks; only `valid && confidence==="HIGH"` passes, then the server signs `withdraw([0])` from the beneficiary's wallet (`app/api/contracts/validate-work/route.ts:102-270`). Webhook COMPLETE -> `CLOSED` (`:127-140`). Refund -> server signs `refundByRecipient(0)` from the beneficiary's wallet (`app/api/contracts/escrow/refund/route.ts:116-127`); webhook COMPLETE deletes the agreement row (`webhooks/circle/route.ts:93-107`).
- Status machine: INITIATED -> PENDING (deploy submitted) -> OPEN -> PENDING (approve/pay) -> LOCKED -> PENDING (withdraw/refund) -> CLOSED | deleted. Buy/Sell USDC buttons create Circle ramp sessions (`lib/utils/create-circle-ramp-session.ts:27-51`).

## 2. RFB fit
- Primary: RFB3 Contractor & Vendor Network Manager. It already has: contract ingestion -> structured milestones (LLM), per-engagement on-chain escrow, AI deliverable check gating release, refund path, per-user dev-controlled wallets, webhook-driven state, audit rows in `transactions`.
- Secondary: RFB2 (contract/invoice parsing prompt at `analyze/route.ts:40-67` is reusable for invoice extraction); RFB4 (agent/arbiter wallet pattern, server-side signing for users); RFB5 (none, but the arbiter role is where screening would gate `pay`).
- Missing for RFB3: only ONE milestone/amount is used (`terms.amounts[0]`, paymentID hardcoded `0`); no multi-milestone release; no reputation/scoring of contractors; no counterparty screening (Compliance Engine) before deploy/pay; no dispute flow (`dispute_resolutions` table exists in schema, `supabase/migrations/20241112172956_create_initial_schema.sql:165`, but is unused); arbiter functions (`refundByArbiter`, `earlyWithdrawByArbiter`, lockups) are never called; no autonomous agent loop - every step is a user button click; no human escalation for MEDIUM confidence.

## 3. Tech stack + versions
- Next.js `latest` in package.json, lockfile resolves 14.2.15 (App Router, `middleware.ts`), React 18.2.0, TypeScript 5.3.3, Tailwind 4, shadcn/Radix, sonner, react-confetti.
- Circle: `@circle-fin/developer-controlled-wallets` ^4.6.0 (lock 4.6.0), `@circle-fin/smart-contract-platform` ^4.3.0 (lock 4.3.0), `@circle-fin/user-controlled-wallets` ^4.5.0 (declared, unused). These are OLD major versions (other Arc samples use dev-controlled-wallets v10).
- AI: `openai` ^6.22.0 (Chat Completions). Docs: `pdf-parse` ^1.1.1, `pdfjs-dist` ^4.7.76, `mammoth` ^1.8.0. `zod` ^3.23.8, `@ethersproject/abi` ^5.7.0 (unused).
- Supabase: `@supabase/ssr` latest, `@supabase/supabase-js` latest (lock 2.45.4), `supabase` CLI ^2.2.1 dev.
- Node v22+ (README:19). npm (package-lock.json). Replit config present (`.replit`, `replit.nix`, nodejs-20).
- Solidity ^0.8.24 + OpenZeppelin EIP712 for the contract, but NO Foundry/Hardhat project: contract is shipped as source + precompiled bytecode string.

## 4. Architecture
- `refs/circlefin/arc-escrow/contracts/escrow_smart_contract/RefundProtocol.sol` - vendored Refund Protocol (lockup removed, see section 8).
- `refs/circlefin/arc-escrow/lib/constants.ts` - `REFUND_PROTOCOL_BYTECODE` (:33) + `REFUND_PROTOCOL_ABI_JSON` (:36-312) used for deployment; hardcoded `SYSTEM_AGENT_ADDRESS`/`SYSTEM_AGENT_WALLET_ID` (:28-30).
- `refs/circlefin/arc-escrow/generate-wallet.mjs` - one-shot script: wallet set "Escrow Agent Wallet" + SCA wallet on ARC-TESTNET, writes id/address/blockchain into `.env.local`.
- `refs/circlefin/arc-escrow/lib/utils/developer-controlled-wallets-client.ts` / `smart-contract-platform-client.ts` - SDK singletons.
- `refs/circlefin/arc-escrow/lib/utils/executeContract.ts` - generic `createContractExecutionTransaction` wrapper (not used by routes; routes inline the call).
- `refs/circlefin/arc-escrow/app/api/contracts/analyze/route.ts` - contract doc -> JSON amounts/tasks (gpt-4o-mini).
- `refs/circlefin/arc-escrow/app/api/contracts/escrow/route.ts` - POST deploy RefundProtocol; GET polls tx status (10 x 1 s).
- `refs/circlefin/arc-escrow/app/api/contracts/escrow/deposit/approve/route.ts` - USDC approve from depositor wallet.
- `refs/circlefin/arc-escrow/app/api/contracts/escrow/deposit/route.ts` - `pay()` from depositor wallet.
- `refs/circlefin/arc-escrow/app/api/contracts/validate-work/route.ts` - GPT-4o vision check + `withdraw([0])` release.
- `refs/circlefin/arc-escrow/app/api/contracts/escrow/refund/route.ts` - `refundByRecipient(0)`.
- `refs/circlefin/arc-escrow/app/api/webhooks/circle/route.ts` - Circle notification signature verify + agreement state machine.
- `refs/circlefin/arc-escrow/app/api/wallet*/`, `app/api/usdc/{buy,sell}` - wallet set/wallet creation, balance, tx list, faucet, ramp.
- `refs/circlefin/arc-escrow/components/escrow-agreements.tsx`, `escrow-agreements-item.tsx` - dashboard; realtime subscriptions that chain approve -> pay client-side.
- `refs/circlefin/arc-escrow/supabase/migrations/` - schema (profiles, wallets, transactions, escrow_agreements, dispute_resolutions), storage bucket `agreement-documents`, realtime, and `20241112173214_remove_rsl_policies_for_development.sql` (RLS DISABLED on all tables).

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Dev-Controlled Wallets | `initiateDeveloperControlledWalletsClient` | `lib/utils/developer-controlled-wallets-client.ts:22`, `generate-wallet.mjs:35` | SDK init with API key + entity secret |
| Dev-Controlled Wallets | `createWalletSet` | `generate-wallet.mjs:44`, `app/api/wallet-set/route.ts:33` | agent wallet set; per-user wallet set named by email |
| Dev-Controlled Wallets | `createWallets({accountType:"SCA"})` | `generate-wallet.mjs:51-55`, `app/api/wallet/route.ts:38-43` | SCA wallet on ARC-TESTNET (agent + every user) |
| Dev-Controlled Wallets | `createContractExecutionTransaction` | `deposit/approve/route.ts:115`, `deposit/route.ts:121`, `validate-work/route.ts:257`, `escrow/refund/route.ts:116` | server signs approve / pay / withdraw / refundByRecipient on behalf of users (fee level MEDIUM) |
| Dev-Controlled Wallets | `getTransaction`, `listTransactions`, `getWalletTokenBalance` | `app/api/contracts/escrow/route.ts:40`, `app/api/wallet/transactions/route.ts:67`, `app/api/wallet/balance/route.ts:50` | poll status, history, USDC balance (filters `symbol==="USDC"`) |
| Smart Contract Platform | `initiateSmartContractPlatformClient`, `deployContract` | `lib/utils/smart-contract-platform-client.ts:22`, `app/api/contracts/escrow/route.ts:112-131` | deploys RefundProtocol bytecode+ABI with constructor `(agentAddress, USDC, "EscrowProtocol", "1.0")` from the agent wallet |
| Smart Contract Platform | `getContract({id})` | `deposit/route.ts:103`, `approve/route.ts:97`, `validate-work/route.ts:224`, `refund/route.ts:99` | resolves `circle_contract_id` -> deployed `contractAddress` |
| Webhooks | REST `GET /v2/notifications/publicKey/{keyId}` + ECDSA SHA256 verify | `app/api/webhooks/circle/route.ts:147-166,213-259` | verifies `x-circle-signature` / `x-circle-key-id` then updates tx + agreement status |
| Faucet | REST `POST /v1/faucet/drips` | `app/api/wallet/balance/request/route.ts:36-47` | testnet USDC drip to a wallet address |
| Ramp (on/off-ramp) | REST `POST /v1/w3s/ramp/sessions` | `lib/utils/create-circle-ramp-session.ts:27-51` | BUY/SELL USDC quote-screen session URL (US/USD) |
| User-Controlled Wallets | `@circle-fin/user-controlled-wallets` | package.json only | declared, never imported |
Not used: CCTP/Bridge/App Kit, Gateway, x402, Compliance Engine, USYC, StableFX, Modular Wallets.

## 6. Env vars
`VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_AGENT_WALLET_ID`, `NEXT_PUBLIC_AGENT_WALLET_ADDRESS`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_BLOCKCHAIN` (e.g. `ARC-TESTNET`), `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (.env.example). Also typed in `environment.d.ts`: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_ASSISTANT_ID` (only read by unused `lib/utils/assistant-config.ts`).
Set `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` to Arc USDC ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals; amounts are converted with `amount * 1000000`, `lib/utils/amount.ts:35-37`). The repo does not hardcode it.

## 7. How to run
1. `npm install`; `cp .env.example .env.local`; fill Circle API key + entity secret, Supabase, OpenAI, USDC address.
2. `npm run generate-wallet` (writes `NEXT_PUBLIC_AGENT_WALLET_ID/ADDRESS`, `CIRCLE_BLOCKCHAIN=ARC-TESTNET`). Fund the agent wallet with testnet USDC for gas (Arc gas is USDC; SCA wallets may be Gas-Station sponsored depending on console config).
3. DB: local `npx supabase start && npx supabase migration up` (Docker) or remote `npx supabase link --project-ref <ref> && npx supabase db push`.
4. `npm run dev` (http://localhost:3000).
5. `ngrok http 3000` and register `https://<ngrok>/api/webhooks/circle` in Circle Console -> Webhooks. REQUIRED: the whole state machine (OPEN/LOCKED/CLOSED) is webhook-driven.
6. Create two users (depositor + beneficiary; Supabase limits email signups to 2/hour, README:176-183), faucet both, upload `contracts/example_agreement/example_content_creation_agreement.pdf`, deploy, deposit, then as beneficiary submit `contracts/example_agreement/good_submission.jpg`.

## 8. Smart contracts
- `contracts/escrow_smart_contract/RefundProtocol.sol` - Circle Refund Protocol (EIP-712, Apache-2.0, unaudited). State: `payments[id]{to,amount,releaseTimestamp,refundTo,withdrawnAmount,refunded}`, internal `balances`, `debts`, single `arbiter`, `nonce`.
  - `pay(to, amount, refundTo)` :95 - pulls USDC via transferFrom, credits `balances[to]`, emits PaymentCreated; paymentID = nonce (so first payment is 0).
  - `refundByRecipient(paymentID)` :113 - only `payment.to`; debits recipient balance, sends full amount to `refundTo`.
  - `refundByArbiter(paymentID)` :137 - arbiter-only; uses recipient balance, else arbiter's own balance and records `debts[to]`.
  - `withdraw(paymentIDs[])` :199 - recipient pulls funds; settles debts first.
  - `earlyWithdrawByArbiter(...)` :239 - arbiter executes a recipient-signed EIP-712 early withdrawal with optional fee to arbiter.
  - `depositArbiterFunds` :172, `withdrawArbiterFunds` :182, `settleDebt` :163, `updateRefundTo` :309 (only current refundTo), `hashEarlyWithdrawalInfo` :329.
- Deployment: no Foundry script. Deployed per agreement at runtime through Circle SCP `deployContract` with `lib/constants.ts` bytecode/ABI (`app/api/contracts/escrow/route.ts:112-131`). Arbiter = `NEXT_PUBLIC_AGENT_WALLET_ADDRESS`. No fixed Arc testnet addresses in the repo (one contract per agreement).
- IMPORTANT - source vs bytecode mismatch: the `.sol` is upstream minus lockups (diff vs circlefin/refund-protocol master: removed `MAX_LOCKUP_SECONDS`, `lockupSeconds`, `setLockupSeconds`, the `PaymentIsStillLocked` check in `withdraw`; migration `20260219193800_remove_lockup_columns.sql`). But `REFUND_PROTOCOL_BYTECODE` (`lib/constants.ts:33`) still contains the upstream lockup code: its dispatcher has selectors `0x69093f4d setLockupSeconds(address,uint256)`, `0x4042c3a3 lockupSeconds(address)`, `0x3b31630f MAX_LOCKUP_SECONDS()` and the constant `0xed4e00` (180 days). The ABI omits them. Default lockup is 0 so behavior matches the .sol unless the arbiter sets one. If you edit the .sol you must recompile and replace the bytecode yourself.
- SECURITY - known arbiter-drain flaw IS vendored. circlefin/refund-protocol README "Security Notice": "an issue resulting from the early withdrawal function that allows an arbiter to drain other user's payments. A fix is in development." (fetched 2026-09-29; latest upstream commit 2026-06-18 is CI-only, no fix). arc-escrow's `earlyWithdrawByArbiter` (:239-302) is byte-for-byte the upstream function (diff shows only the lockup deltas). Observed weaknesses in that function: per-item check is only `withdrawalAmount > payment.amount` (:275) - it ignores the already `withdrawnAmount` and does not reject duplicate paymentIDs, so cumulative withdrawals can exceed a payment; refunds (`_executeRefund` :344) ignore `withdrawnAmount`, so an early-withdrawn payment can still be refunded in full out of other funds in `balances`; fee is credited to the arbiter (:295). The app itself never calls `earlyWithdrawByArbiter`, but the deployed contract exposes it and the arbiter key is the server's agent wallet. Mitigation for a hackathon: remove `earlyWithdrawByArbiter` or write a simpler milestone escrow; with one contract per agreement the blast radius is that agreement.
- Also note: without a lockup, "escrow" is enforced off-chain only - `withdraw` has no release condition, so the beneficiary could withdraw right after `pay`. It works in this app only because the beneficiary's wallet is a Circle dev-controlled wallet whose signing the server gates behind the AI check.

## 9. AI/LLM usage
- Provider: OpenAI via `openai` SDK (`lib/utils/openAIClient.ts:21-25`, maxRetries 3, timeout 60 s). Error mapping in `lib/utils/openai-error-handler.ts`.
- Contract extraction: model `gpt-4o-mini`, `response_format: json_object`, temperature 0; prompt `app/api/contracts/analyze/route.ts:40-67`, call :97-107. Output `{amounts:[{amount,currency,for,location}], tasks:[string]}`. Decides the escrow amount (`amounts[0]`) and the acceptance criteria.
- Deliverable validation: model `gpt-4o` vision, temperature 0, no response_format (raw `JSON.parse`), image sent as `data:image/png;base64` (`app/api/contracts/validate-work/route.ts:102-179`). Prompt tells the model to ignore requirements that are not properties of the image (:128-131). Output `{valid, confidence: LOW|MEDIUM|HIGH, reasons[]}`. Release gate: `valid && confidence==="HIGH"` (:205-207); otherwise returns reasons (400) and UI shows `validation-failed-dialog`. Submitted file is stored in bucket `agreement-documents/<agreementId>/(in)valid-<ts>-<name>` (:185-195).
- `lib/utils/assistant-config.ts` (OpenAI Assistants id) is dead code.

## 10. Reusable for a hackathon entry
- Lift the vision-validation prompt + gate from `app/api/contracts/validate-work/route.ts:96-207` as the "deliverable checker" tool of an RFB3 agent; add `response_format: {type:"json_object"}` and a zod schema, route MEDIUM to human review.
- Lift the contract/invoice extraction prompt `app/api/contracts/analyze/route.ts:40-107` (pdf-parse/mammoth + gpt-4o-mini JSON) to turn SOWs into milestones (RFB3) or invoices into payables (RFB2). Swap `tasks` for `milestones:[{description, amount, due}]`.
- Lift runtime contract deployment via Circle SCP from `app/api/contracts/escrow/route.ts:112-131` (deployContract with bytecode + abiJson + constructorParameters from a dev-controlled wallet).
- Lift the approve -> pay pattern from `deposit/approve/route.ts:115-126` + `deposit/route.ts:121-136` for any ERC-20 escrow deposit on Arc via `createContractExecutionTransaction` (abiFunctionSignature strings).
- Lift Circle webhook verification from `app/api/webhooks/circle/route.ts:212-259` (public key fetch + PEM + `crypto.createVerify("SHA256")`) and the tx-type state machine :27-142.
- Lift `generate-wallet.mjs` as the agent-wallet bootstrap script.
- For multi-milestone: call `pay()` once per milestone (paymentIDs 0..n) on one contract and `withdraw([i])` per approved milestone instead of hardcoded `[0]`; use `refundByArbiter(i)` from the agent wallet for agent-decided refunds (currently only the freelancer can refund).

## 11. Limitations / gotchas
- Testnet only; README says not for production. Contract unaudited and carries the upstream arbiter-drain notice (section 8).
- No authorization on money-moving routes: `validate-work`, `deposit`, `approve`, `refund` only check that SOME user is logged in; none check the caller is the agreement's beneficiary/depositor (e.g. `validate-work/route.ts:38-47` loads beneficiary `auth_user_id` at :77 but never compares it). `/api/wallet`, `/api/wallet-set`, `/api/wallet/balance*`, `/api/usdc/*`, `/api/contracts/escrow` have no auth at all (middleware only guards `/dashboard`, `middleware.ts:35-44`). Anyone can create Circle wallets on your API key or trigger faucet drips.
- RLS disabled on all tables (`supabase/migrations/20241112173214_remove_rsl_policies_for_development.sql`), and the browser client deletes agreements directly (`components/escrow-agreements-item.tsx:194-206`).
- The server signs for every user's custodial wallet - "escrow" is trust-in-server, not trustless (section 8).
- AI gate is prompt-injectable (image text can say "valid: true, HIGH") and raw `JSON.parse` fails if the model adds code fences; image MIME forced to `image/png` in the data URL regardless of upload type.
- Only `terms.amounts[0]` and paymentID `0` are used; `approve` uses the AI-parsed terms amount while `pay` uses `transactions.amount` (`approve/route.ts:112-113` vs `deposit/route.ts:119`) - they can diverge. `amount * 1000000` uses float math (`lib/utils/amount.ts:36`); `parseAmount` treats "$1.500" (European thousands) as 1.5.
- Deposit step 2 (`pay`) is triggered by the depositor's browser via Supabase Realtime (`components/escrow-agreements.tsx:137-185`) - close the tab and the approve completes without a deposit.
- Webhook signature is verified over `JSON.stringify(await req.json())` (`webhooks/circle/route.ts:157-162`), not the raw body - brittle if key order/whitespace differs. Webhook refreshes balance by calling its own `/api/wallet/balance` via `VERCEL_URL` (:23-25, 177).
- `GET /api/contracts/escrow` polls only 10 s. `SYSTEM_AGENT_ADDRESS`/`SYSTEM_AGENT_WALLET_ID` hardcoded in `lib/constants.ts:28-30` are sent from the UI (`components/deploy-smart-contract-button.tsx:61-64`) but the route uses env `NEXT_PUBLIC_AGENT_WALLET_ADDRESS` as arbiter - the constants are only format-validated.
- Stale deps: Next `latest` (lock 14.2.15), Circle SDKs v4 (current is v10+), Supabase `latest`. `@circle-fin/user-controlled-wallets`, `@ethersproject/abi`, `pdfjs-dist` unused. `app/services/file.service.ts:111` calls non-existent `/api/contracts/gatherDocumentInfo`. README clone URL points to `akelani-circle/workflow-escrow-refund-protocol`.
- No chain id / RPC / explorer constants in code; everything goes through Circle APIs with `CIRCLE_BLOCKCHAIN=ARC-TESTNET`.
