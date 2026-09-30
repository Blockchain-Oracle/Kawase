# Spike 2: the user's wallet signs the exact payload (Circle UCW `signTypedData`)

> **Superseded on 2026-09-30 (D33): the user's wallet is no longer a Circle PIN wallet. Still used from this spike: the `KawaseAuthorization` typed data and its viem verification, and the rule that the api verifies every signature itself. The PIN sheet, challenge and relay details below no longer apply. See `15-eip7702-limits.md` and `plan/ARCHITECTURE.md` §4.**

Purpose: prove that a Circle user-controlled wallet (the vault), a PIN user keyed by **our** user id with an **EOA** on ARC-TESTNET, can sign EIP-712 typed data that the server verifies with viem. This is the approval binding for settings and authority changes (ARCHITECTURE §4). Spike #4's production path is then rerun with this real UCW as the DeleGator owner.
Code: `plan/spikes/code/02-ucw-typed-data/` (`node run.mjs [--cancel-test] [--delegation-only]`, then open `http://localhost:5199/` and enter the PIN for each challenge; `node check1271.mjs`). Raw results: `results.testnet.json`, `run.part1.log`, `run.log`. State (testnet only) lives in the gitignored `.spike-state.testnet.json`.
Date: 2026-09-30
**Result: testnet PASS (13/13 as expected, after correcting one test that was checking the wrong digest).** Abu entered the PIN; Claude never handles it. LIVE is not tested, because Circle LIVE still returns 403.

## Setup
- Packages: `@circle-fin/user-controlled-wallets@10.8.1` (server), `@circle-fin/w3s-pw-web-sdk@1.1.11` (browser; stands in for the device's `WalletSdk.execute`), `@metamask/smart-accounts-kit@2.0.0`, `viem@2.57.1`, `vite@8.3.1` + `vite-plugin-node-polyfills@0.28.0`.
- **Circle user** `a3ca8196-6a64-4b65-beb6-014ddc85ae2e`, which is our id (the app will pass its UUIDv7). `createUserPinWithWallets({ blockchains: ['ARC-TESTNET'], accountType: 'EOA' })` → one INITIALIZE challenge covers the PIN, the security questions and the wallet.
- **Vault (UCW EOA)** `0xb7eddcc7b3b8c8fd4c1f99d5e336023feec8efca` (wallet `8776b207-…`, state LIVE).
- **Signing relay:** the server creates a challenge and parks it; the page polls, runs `sdk.execute`, and posts the result back. This is the same shape as the app's approval endpoint returning `{challengeId, userToken, encryptionKey}` to the device.
- **UCW-backed viem account:** `toAccount({ address: vault, signTypedData })`, where each call is a UCW `signTypedData` challenge. It plugs into `toMetaMaskSmartAccount({ signer: { account } })` unchanged, so the kit signs delegations and UserOps through the user's wallet.
- **DeleGator (UCW-owned)** `0xb99b5132c169322A31E451240c3b4d12F56ABd85`, deployed by the ops DCW from spike #4 (`0x2d9b…b6b9`).

## Results
| # | Test | Expected | Got | Evidence |
|---|---|---|---|---|
| 1 | PIN + security questions + EOA wallet (INITIALIZE challenge) | pass | ✅ wallet LIVE | `pinStatus: ENABLED`; first try hit 155704 in-sheet, retried in place |
| 2 | UCW signs `KawaseAuthorization`; viem `verifyTypedData` against the vault | pass | ✅ recovered `0xb7ed…efCA` | challenge `9ce2f60a-…` |
| 3 | Same signature, tampered `subjectAfter` | fail | ✅ does not verify | — |
| 4 | Same signature under the **mainnet** chainId (5042) | fail | ✅ does not verify | — |
| 5 | Server reads the challenge via `getUserChallenge` | COMPLETE | ✅ `{type: SIGN_TYPEDDATA, status: COMPLETE}` (no signature in it) | — |
| 6 | User presses × on the PIN sheet | error to app | ✅ callback `155701 "User canceled"`, then the sheet closes | challenge `7d0fd293-…` |
| 7 | Ops DCW deploys the UCW-owned HybridDeleGator (SimpleFactory) | pass | ✅ | [`0x1ced…5022`](https://explorer.testnet.arc.io/tx/0x1ced13964f66cf47c5f5e5da3bcaa6c622b39d6596c6379d905f38f63e475022) (funded 1 USDC: [`0xb9ac…dc8d`](https://explorer.testnet.arc.io/tx/0xb9ac99d459da6c250d8c132305b885f4c4da5490e6ab64d141d058109bf2dc8d)) |
| 8 | UCW-signed delegation valid via ERC-1271 on the DeleGator | `0x1626ba7e` | ✅ with the full EIP-712 digest (`check1271.mjs`) | the struct hash alone gives `0xffffffff`, see finding 7 |
| 9 | Ops DCW redeems 0.2 USDC to the pinned recipient | pass | ✅ | [`0x4ada…d3ef`](https://explorer.testnet.arc.io/tx/0x4adaeafcf18ee4b2c04b340178dbf2c99003dc20dc1b9f22dda3abd089fed3ef) |
| 10 | Ops DCW redeems 0.4 more (0.6 > 0.5 cap) | fail | ✅ `ESTIMATION_ERROR` | — |
| 11 | Ops DCW redeems to a different recipient | fail | ✅ `ESTIMATION_ERROR` | — |
| 12 | Revoke: UCW signs the EntryPoint v0.7 UserOp; the **ops DCW** submits `handleOps` | pass | ✅ `disabled=true`; the DeleGator paid 0.01624 USDC gas | [`0xea48…4985`](https://explorer.testnet.arc.io/tx/0xea4818884a985d05689627822eb1155ba40bf8f98493c5e68708de33f85f4985) |
| 13 | Ops DCW redeems after the revoke | fail | ✅ `ESTIMATION_ERROR` | — |

Spike #4's "owner = local test key" limitation is now closed: the whole grant → redeem → cap → revoke path works with a real Circle user wallet as the owner, on testnet.

## Findings (these change the plan)
1. **Circle never gives the server the signature.** `getUserChallenge` returns only `{id, type, status}`, and the signature comes back only in the device SDK callback (`result.data.signature`). So the device must POST the signature to the api, and the api accepts it only after viem `verifyTypedData` against the vault address. That check is enough, because an ECDSA signature proves who made it. The api should also confirm that the challenge is `COMPLETE` as a cheap second check.
2. **Circle validates typed data strictly (156026, "extra data provided in the message").** A message field that is not in `types` rejects the whole challenge, and the dead challenge then answers `Forbidden` (code 3). viem ignores extra fields, but the MetaMask kit passes the whole `Delegation` (including `signature`, and `args` on every caveat). **Rule for the UCW signer adapter:** project the message onto `types` before sending it (`projectToTypes` in `run.mjs`; the digest was checked unchanged). Also add `EIP712Domain` to `types` and send bigints as decimal strings. Both worked.
3. **The PIN sheet shows nothing about what is signed.** It says only "Enter your PIN, Let us know if it's really you". The `memo` and the typed-data fields are not shown in Web SDK 1.1.11. **Kawase's own confirm card is therefore the only place the user sees the payload**, so it must render the decoded, exact draft (and the delegation's can/can-never receipt decoded from the caveat bytes) immediately before opening the sheet. Still to check: whether the RN SDK (spike #1) shows more.
4. **Web SDK callback semantics** (read from `dist/src/index.js` and observed):
   - `onError` → `callback(error)` while the sheet **stays open** for in-sheet errors: `155704` (PIN has repeating or consecutive digits) and `155112` (wrong PIN). These are **not terminal**.
   - `155701 "User canceled"` arrives when the user presses ×, then the sheet closes. **Terminal.**
   - `onComplete` → the iframe is removed and `callback(undefined, result)` is called. **The only terminal success.**
   - So the device code treats the callback as a stream. It ends on success, 155701, or a sheet it can no longer see. Treating the first callback as final (my first version) breaks on a single mistyped PIN.
5. **The Web SDK needs Node polyfills in a browser build** (`Buffer`, `util.inherits`). Fixed with `vite-plugin-node-polyfills`. This matters for Expo web and for the "Circle web SDK in a DOM component" fallback from spike #1.
6. **`@circle-fin/*-controlled-wallets` 10.x throws `{ message, code, status, url, method }`, not axios errors.** Match on `e.code` (for example `155101` = user already exists). Spike #4's `e.response?.status` pattern would miss these; `packages/integrations/circle` must use the 10.x shape.
7. **ERC-1271 digest:** the DelegationManager calls `isValidSignature` with the **full EIP-712 digest** (`hashTypedData` with domain `DelegationManager`, `1`, chainId, the manager address). `hashDelegation()` is only the struct hash, and passing it returns `0xffffffff`. Any "is this grant valid" check in our code must use the full digest.
8. **PIN prompts per flow** (measured here, except where marked): a settings/authority change = 1; signing a delegation = 1; revoking = 1 (plus about 0.016 USDC gas from the DeleGator); deploying the DeleGator = 0, because the ops DCW does it. [Inference, not measured: in production the user also funds the allowance account from the vault, which is one UCW transfer challenge, so a grant costs 2 PINs unless it is batched.]

## Not covered (still open)
- The **LIVE** key and ARC mainnet (Circle LIVE is 403 until the account is activated), and the LIVE entity secret for the ops DCW.
- The **RN SDK** 2.2.5 on the Expo 57 dev build (spike #1). The same challenges should run there; that spike also shows whether the native sheet displays the memo.
- PIN lockout after repeated wrong PINs, biometrics-for-PIN (`setBiometricsPin`), and the "Forgot PIN" restore flow.
- A webhook-verified challenge (the fallback) was not needed.

## Decision
**Pass → keep K3 and the §4 approval binding as designed.** The vault is a UCW EOA keyed by our user id. Settings and authority changes are bound by `KawaseAuthorization` via UCW `signTypedData`, verified server-side with viem. Delegations and revoke UserOps are signed by the same UCW through a viem `toAccount` adapter. The adapter rules (projection, EIP712Domain, decimal bigints, the callback stream, the 10.x error shape) go into `packages/integrations/circle` and the device approval sheet.
