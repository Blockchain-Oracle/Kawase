# Spike 16: the Turnkey-held wallet in the app (sign in with an email code, no PIN, on-chain limits)

Purpose: prove the D33 wallet from the app itself: a key held by Turnkey, signed in with an email code, that sets up EIP-7702 limits, lets the agent spend inside them with no prompt, and signs the user's own transactions. Follows spike 15 (the same flow with a local key).
Code: `packages/integrations/delegation/test/spike16-server.ts` (the server half, port 3022; `pnpm --filter @kawase/integrations-delegation spike16`), `test/spike16-local-client.ts` (the same flow with a local key, 8/8), `apps/mobile/src/spike/wallet-screen.native.tsx` (the device half; route `/spike-wallet?email=…`), `packages/wallet/src/turnkey.ts` (the signer adapter). Results appended to `test/results.spike16.json`.
Date: 2026-09-30
**Result: PASS on the iOS simulator against Arc testnet, 9/9 device steps.** The passkey (Face ID) half is not run yet: passkeys need a real domain (`EXPO_PUBLIC_PASSKEY_RP_ID`).

## Setup
Codex set up Turnkey from `plan/prompts/codex-turnkey-setup.md`: Auth Proxy on, email code (6 digits), passkeys, Google and Apple sign-in, 30-day sessions; the two public ids are in `.env` and `apps/mobile/.env`, the `kawase-server` API key in `.env` only. The live config was checked with `POST https://authproxy.turnkey.com/v1/wallet_kit_config` (providers: google, apple, passkey, email).

The run used a throwaway inbox (`kawase-spike16-…@uberip.com`, mail.tm) so that no personal email was involved; the sign-in code arrived from `no-reply@mail.turnkey.com` within seconds. The resulting sub-organization and wallet `0x2B3fb337797ED2A7894aa1271940756A208f4e0D` are test data in Abu's Turnkey organization and can be left or deleted from the dashboard. The taps were scripted with `idb`.

## What was tested (device)
| # | Step | Signer path | Got |
|---|---|---|---|
| 1 | Email me a code | Auth Proxy `initOtp` | ✅ 0.8 s |
| 2 | Sign in | `completeOtp` | ✅ 3.9 s, session held by the kit |
| 3 | Create my wallet | `createWallet` | ✅ 1.5 s, `0x2B3f…4e0D` |
| 4 | Get 1 test USDC | server: Circle ops wallet | ✅ [`0x672d…191c`](https://explorer.testnet.arc.io/tx/0x672d94b4d030cc6f0c23ea01c902ab7f1f902b7e22a0af65be104ffc4c49191c) |
| 5 | Set up (no prompt) | `signAuthorization` → `PAYLOAD_ENCODING_EIP7702_AUTHORIZATION`, session stamper; relayer sends the type-4 tx | ✅ 3.1 s, no prompt, [`0x3030…e091`](https://explorer.testnet.arc.io/tx/0x3030030852c9bc822c273f4b7066c83e14ea2aa158df6d3e0cdc848de5d7e091) |
| 6 | Accept an allowance of 0.3 USDC | `signTypedData` → EIP-712 digest hashed with viem, signed as `PAYLOAD_ENCODING_HEXADECIMAL` | ✅ verified by the server in 0.45 s (see finding 1) |
| 7 | Agent sends 0.1 inside the allowance | none (ops wallet redeems) | ✅ [`0xfd9e…c995`](https://explorer.testnet.arc.io/tx/0xfd9e28ef23f8e1506ca18ad12f22d59e962aec2763fe87e586e9257f6089c995) |
| 8 | Agent tries 0.5 | none | ✅ refused (`ESTIMATION_ERROR`, the caveat reverts) |
| 9 | I send 0.4 myself | `signTransaction` → kit `signTransaction` | ✅ 2.3 s, [`0x8dba…9a8b`](https://explorer.testnet.arc.io/tx/0x8dba5c8a757f3418653fe2b5e1c5fdf83ee9a60df7c0d485cb0ce38c9e9e9a8b) |
| 10 | Revoke the allowance | `signTransaction` | ✅ 3.1 s, [`0x329a…1547`](https://explorer.testnet.arc.io/tx/0x329a14ed5f9a04047f71d613e2d5a026cc803bc969719807c4e8b7e835e81547) |
| 11 | Agent tries again | none | ✅ refused |

Steps 5, 6, 9 and 10 each used one Turnkey signature (4 of the 25 free ones this month).

## Findings
1. **Turnkey's EIP-712 encoding did not verify for the delegation typed data.** Signing the serialized typed data with `PAYLOAD_ENCODING_EIP712` returned a signature the server rejected ("the signature does not match the wallet"); the same typed data signed by a local key verifies, and the 7702 authorization signed through Turnkey's own encoding verified fine. Not diagnosed further (the delegation struct has nested caveat arrays and `bytes` fields). The adapter now hashes typed data with viem (`hashTypedData`) and signs the digest as a hexadecimal payload; the server verifies with `verifyTypedData`. Consequence: Turnkey's policy engine cannot inspect the typed data, which we do not need (the limits live on chain).
2. **The email field needs `autoCorrect={false}`**: iOS turned "kawase" into "Kawasaki" and the code request failed with "Failed to initialize OTP".
3. The kit's session stamper signs with no user prompt, as designed for "inside the allowance". Face ID (`StamperType.Passkey`) is wired in `use-wallet-signer.native.ts` but needs a passkey on the user, which needs the domain.
4. Sign-in to wallet-ready took about 7 seconds of network time in total (code request 0.8 s, sign-in 3.9 s, wallet 1.5 s), before the relayed setup (3.1 s).

## Decision: one sign-in (Claude's, from the spike; Abu can veto)
Turnkey's sign-in is the app's sign-in. The email code, Apple and Google all go through Turnkey's Auth Proxy, and the API trusts a **proof of the Turnkey session**: the client sends its session claims (sub-organization id, user id, session public key, expiry) and signs a server nonce with the session key; the server checks with the parent organization's API key that this public key is registered on that user (parent organizations have read access to all sub-organizations, Turnkey docs) and verifies the signature, then issues Kawase's own session. Better Auth is no longer needed: a second email code from it would defeat "one sign-in", and Turnkey now covers email codes, Apple, Google and passkeys. Guests stay possible as Kawase users without a sub-organization until their first sign-in. Stage 3 implements this; `plan/spikes/10-better-auth.md` stays as the record of what was learned.

## Still open
- Passkey (Face ID) enrolment and signing: needs the domain (`EXPO_PUBLIC_PASSKEY_RP_ID`) and the two association files.
- Apple and Google sign-in on a device (the dashboard side is done; Google's consent screen is in Testing).
- Web: the web kit (`@turnkey/react-wallet-kit`) is not wired yet (`wallet-provider.tsx` is a stub).
- The temporary `/spike-wallet` route and the spike server are removed when Stage 3 replaces them.
