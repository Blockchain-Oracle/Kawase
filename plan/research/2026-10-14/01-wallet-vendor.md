# Replacing Turnkey: wallet and sign-in vendor (research, 2026-10-14)

Tags: VERIFIED = seen in current docs, code or a live response today. REPORTED = search snippet or a secondary source. IDEA = mine.

## 1. Short answer

- "Tempo" is almost certainly Turnkey. Turnkey is the only vendor in Kawase with "25 free signatures a month" (https://www.turnkey.com/pricing, VERIFIED), and it is what the app uses (`apps/mobile/package.json:32-33`, `packages/wallet/src/turnkey.ts`). Tempo is a separate blockchain (Ithaca, the Porto team, joined it: REPORTED). Turnkey is closed-source as a service and cannot be self-hosted; only its SDKs are MIT.
- Turnkey cost: free = 25 signatures a month, 1,000 wallets. Past 25 you must "connect a credit card and select a plan"; Pay-as-you-go is then $0.10 a signature, Pro is $99/month minimum at $0.05 (the FAQ says "as low as $0.01"; the page contradicts itself). Gas sponsorship is Enterprise only (turnkey.com/pricing, VERIFIED). IDEA: 1,000 new users at about 3 signatures each (7702 authorization, allowance, one send; spike 16 used 4 per user, `plan/spikes/16-turnkey-wallet.md:30`) is 3,000 signatures, about $297 a month.
- Best replacement: **Magic** (free to 1,000 monthly users and 50,000 signatures). Second: **Coinbase CDP Embedded Wallets** (free to 5,000 operations a month, no per-user fee). Privy is the best-documented fallback, but costs $299 a month from 500 users.
- Key insight (VERIFIED in code): Kawase does not need vendor-side background signing. The agent acts while the app is closed by redeeming an on-chain delegation with Kawase's own ops wallet (spike 16 steps 7, 8, 11). The user's key signs only the one-time 7702 authorization, the allowance typed data, and the user's own sends. So the vendor only has to offer: email code, Apple, Google, a secp256k1 key that signs a raw digest, sessions without prompts, and export. The adapter already hashes typed data in viem and signs the digest raw (`packages/wallet/src/turnkey.ts:70-75`), because Turnkey's own EIP-712 encoding failed to verify for the delegation (spike 16, finding 1). Any vendor that signs a raw 32-byte hash can plug in.

## 2. Comparison (0 to 1,000 monthly users)

| Vendor | Cost at 0-1,000 users | Expo / new arch | 7702 signAuthorization | Arc | Background signing and policies | Lock-in |
|---|---|---|---|---|---|---|
| **Turnkey** (today) | 25 free sigs, then $0.10 each, card required | RN kit 2.3.9, works (spike 16) | Yes, `PAYLOAD_ENCODING_EIP7702_AUTHORIZATION` (VERIFIED, code) | Own docs page, `eip155:5042` in API types | Yes: policy engine, default deny | Key export works; not self-hostable |
| **Magic** | Free: 1,000 MAW + 50,000 sigs. Over: $0.045/MAW, $0.005/sig. Startup $99 = 2,500 MAW (magic.link/pricing) | `@magic-sdk/react-native-expo` 34.12.0, MIT, updated 2026-09-01; WebView-based (peer `react-native-webview >=12.4.0`); new arch NOT documented | Yes: `wallet.sign7702Authorization({contractAddress, chainId, nonce})`, headless, RN Expo 34.2.0+ (docs.magic.link/.../eip-7702, VERIFIED) | Custom `rpcUrl`+`chainId` (`@magic-ext/evm`, VERIFIED); no Arc artefact | "Server Wallets" (Express API, TEE) are separate wallets, not the user's login key; policies UNKNOWN | Export via `revealEVMPrivateKey()`; sessions default 7 days |
| **Coinbase CDP** | Free: 5,000 ops/month, then $0.005/op; sign = 1 op; no MAU fee (docs.cdp.coinbase.com/embedded-wallets/pricing) | RN supported since 2025-09 (changelog); `@coinbase/cdp-core` 0.0.127 (pre-1.0); peers `expo-secure-store ^15`, `expo-web-browser ^15` vs Kawase ~57 (mismatch) | Hooks include `useSignEvmHash`, `useSignEvmTransaction` ("any EVM network"); 7702 delegation exists (2026-03). Raw-hash authorization on Arc: untested | Not in managed network list; sign-only plus own RPC (INFERENCE) | Yes: time-bound delegated signing for offline users (2026-04); signs transaction/message/typed data; no policy rules described; raw hash not listed for delegated | Only the user can export; Coinbase custody (TEE) |
| **Privy** | Free 0-499 MAU, 50K sigs. 500-2,499 MAU = **$299/month**; 2,500-9,999 = $499 (privy.io/pricing) | `@privy-io/expo` 0.76.3, Apache-2.0, updated 2026-10-13; peer pins `viem 2.57.5` (Kawase 2.57.0); needs `react-native-webview`, `react-native-passkeys`; new arch not mentioned | Node `sign7702Authorization`, REST `eth_sign7702Authorization`; in Expo via provider `secp256k1_sign` (docs example, with typos) | `@privy-io/chains` has `arcMainnet` 5042 and `arcTestnet` (earlier research); custom chains via `supportedChains` | Best: signers, authorization keys, policy engine, stateful rolling caps (1-72 h, sum only). Plan for policies not stated | Key export on mobile only through a hosted web page in a WebView |
| **Openfort** | Free 2,000 ops/month (rate-limited), then $0.01; backend wallets, policies, export in all plans (openfort.io/pricing) | `@openfort/react-native` 2.2.0, MIT; RN pages for 7702, export, EIP-712 | RN page: manual route signs a raw hash for "other chains" | Not listed; custom chain = email them (VERIFIED) | Yes (backend wallets + policies) | OpenSigner is MIT and self-hostable (Docker, Shamir 3 shares, audit by Quantstamp in progress); RN not documented for it |
| **Dynamic** | Free to 1,000 MAU; $249 to 5,000 | JS SDK 1.39.1 supports RN | Viem `signAuthorization` on the JS SDK; RN not mentioned | "Arc compatible" | Delegated access Enterprise-only in production | - |
| **Para** | Free 1,200 MAU; Starter $200 | RN 3.22.0; heavy peers (quick-crypto, nitro, keychain) | In REST/core; RN unconfirmed | Not confirmed | Server SDK/permissions not on the pricing page | - |
| **thirdweb** | Free 1,000 MAW, then $0.015 | RN supported | `executionMode: EIP7702` only on 7702 chains; manual sign unconfirmed | Chain listed in API | Server wallets $1 per 1k requests | Programmatic export "not possible", UI only |
| **Web3Auth / MetaMask EW** | Free 1,000 MAW, then $0.05; passkeys need $69 plan; MPC only on Enterprise | Expo 48+, dev build | Not documented | Custom chains | None documented | Key export opt-in |
| **Circle Modular / UCW** | Not confirmed | No RN package (`circle-wallet-options.md:121`) | Passkey smart account, not an EOA | Yes | User present for each signature | Fails "no prompt" |
| **Porto** | - | - | - | - | - | **Deprecated, repo archived 2026-08-19** (github.com/ithacaxyz/porto) |
| **Magic alternative: self-built** | Free | - | Any local key | Any | None | IDEA only: Better Auth (already spiked, `plan/spikes/10-better-auth.md`) plus a key in the Keychain with an encrypted backup. Kawase would own key loss and security. Not recommended before Saturday |

Not checked in depth (marked UNKNOWN): Dynamic, Para and thirdweb on RN with Arc; Magic and CDP on Expo 57 / RN 0.86 with the new architecture.

## 3. Ranking

1. **Magic.** Only option where every hard requirement is stated in current docs and the free tier covers the whole 0-1,000 range: email OTP, Google and Apple (`loginWithEmailOTP`, `loginWithPopup`), headless `sign7702Authorization` on Expo, EIP-712 v3/v4 through the provider, custom chain by `rpcUrl`+`chainId`, export, 50,000 free signatures versus Turnkey's 25. Risks: WebView-based, so cold-start time and new-architecture behavior must be measured; no policy-bound background signing of the user's own key (not needed); passkeys not documented on RN.
2. **Coinbase CDP.** Cheapest at scale (about $0 to 1,000 users), the only one besides Privy and Turnkey with first-class offline delegated signing of the user's key, RN with email, Apple, Google. Risks: version 0.0.x, peer mismatch with Expo 57, Arc not in the managed list, raw-hash 7702 authorization untested.
3. (Fallback) **Privy**: safest engineering, free only to 499 users. Use it if both spikes fail and traffic is under 500.

Test gate before committing (about 1 hour, IDEA): on the iOS simulator with a throwaway email, (a) sign a 7702 authorization for the MetaMask DeleGator on chain 5042002 and check the recovered signer in viem; (b) sign the allowance typed data and check `verifyTypedData` (Turnkey's own encoding failed here, so test the nested caveat structure); (c) sign a type-2 transaction for 5042002; (d) confirm no UI appears; (e) build on Expo 57 / RN 0.86 with the new architecture.

## 4. Migration steps in Kawase (for Magic; same shape for CDP)

Unchanged: `packages/integrations/delegation/*` and the `WalletSigner` interface (`packages/wallet/src/signer.ts`); the adapter does not import Turnkey's SDK (`packages/wallet/src/turnkey.ts:2-3`).

Mobile and web (`apps/mobile`):
- `package.json`: remove `@turnkey/react-native-wallet-kit` and `@turnkey/react-wallet-kit`; add `@magic-sdk/react-native-expo`, `@magic-ext/react-native-expo-oauth`, `@magic-ext/evm`, `react-native-webview`, `@react-native-community/netinfo`, and the web `magic-sdk`. `src/polyfills.native.ts` stays (still needs random bytes).
- `src/wallet/wallet-provider.native.tsx`, `wallet-provider.tsx`, `config.ts`: replace the Turnkey provider and ids with the Magic publishable key; keep the Apple and Google ids only if Magic's dashboard needs them.
- `src/wallet/turnkey-account-core.ts`, `use-turnkey-account.ts`, `use-turnkey-account.native.ts`: rename and rewrite to `sendCode` / `verifyCode` / `signInWith` / `ensureWallet` over Magic. The exported `TurnkeyAccount` shape stays, so `sign-in/sign-in-sheet.tsx`, `request/*`, `contacts/*`, `send/*` need only import renames.
- `src/wallet/use-wallet-signer.native.ts`, `use-wallet-signer.ts`: new hook returning the signer; `packages/wallet/src/turnkey.ts` becomes `magic.ts`, keeping `checks.ts` (M6) before every signature.
- `src/session/device-proof.ts`, `src/wallet/device-proof-sync*.tsx`: M12 proof. Replace the Turnkey stamp over a "get activity" body with a per-request Magic identity token that carries the request hash (IDEA; Magic's `getIdToken` accepts a lifespan and attachment, REPORTED from memory, confirm) or a device-held P-256 key registered at sign-in.
- `src/screens/export-wallet-screen.tsx` and `src/account/use-account-methods*.ts`: call `revealEVMPrivateKey()`; the current screen shows a recovery phrase, Magic reveals a private key, so the copy changes.
- `app.config.ts`: Magic OAuth redirect scheme (the `kawase` scheme already exists).

API (`apps/api`) and shared:
- `src/auth/turnkey.ts`, `turnkey-proof.ts`, `device-proof.ts`, `service.ts`, `routes.ts`: replace "stamp verified against the parent organization" with Magic's server-side token check (`@magic-sdk/admin`: validate the token, read the email and address; REPORTED from memory, confirm). `src/wallet/service.ts:171-190` (`register`, `providerRef`), `wallet/routes.ts`, `account/service.ts`, `app.ts:124,187,276,334-358`, `main.ts:35-38`, `types.ts`.
- `packages/env/src/index.ts:32-36`: swap the four `TURNKEY_*` vars for `MAGIC_SECRET_KEY`.
- `packages/db/src/schema/identity.ts:26-27,83` and `wallets.ts:17,30`: rename `turnkey_*` columns to provider-neutral ones, add `magic` to the `custody` enum, add a migration (the table is small: 2 accounts).
- `packages/api-client/src/{account,types,index,client-events}.ts`: rename fields.
- Tests: `packages/integrations/delegation/test/spike16-*`, `device-checks.test.ts`, `packages/env/test`, `packages/api-client/test`. Help text mentioning Turnkey in `packages/i18n/src/catalog/*/help.ts` (10 languages).

Existing 2 users (production has 2 accounts, 0 completed money actions, per context): their addresses will change, so they sign in again, a new wallet is created, and the 7702 setup and allowance are redone. Match them by verified email so the Kawase user rows survive. Any testnet dust can be moved with the existing export screen before the switch (IDEA). Keep Turnkey code behind a flag for one build, never add a card to Turnkey.

## 5. What only the owner must do

- Create the free Magic dashboard account (no card), get the publishable and secret keys, put the secret in Coolify env, and add the app scheme and `app.getkawase.xyz` as allowed origins. I did not sign up for anything.
- In the Magic dashboard, enable email OTP, Google (existing web client) and Apple (existing Services ID and key); update the redirect URLs in the Apple and Google consoles.
- If the 1-hour test fails: create a Coinbase CDP project (free, no business verification, per the CDP docs) or a Privy app.
- Decide whether passkeys stay in scope (not documented on Magic RN).

Note on injected text: none of the fetched pages contained instructions aimed at me beyond a documentation-index header on Privy and Coinbase pages, which I ignored.

Sources: turnkey.com/pricing; magic.link/pricing; docs.magic.link/embedded-wallets/wallets/features/eip-7702; docs.magic.link/embedded-wallets/sdk/client-side/react-native; privy.io/pricing; docs.privy.io (sign-7702-authorization, stateful-policies, mobile-key-export, installation, configure-evm-networks); docs.cdp.coinbase.com (embedded-wallets/pricing, delegated-signing, react-native quickstart, changelog); openfort.io (pricing, docs/configuration/chains, RN 7702 page); dynamic.xyz (pricing, 7702 recipe); getpara.com/pricing; web3auth.io/pricing.html; thirdweb.com/pricing; github.com/ithacaxyz/porto; github.com/openfort-xyz/opensigner; npm registry metadata (`npm view`, 2026-10-14); repo files `plan/spikes/16-turnkey-wallet.md`, `context/08-product-research/03-wallets-custody-limits/{third-party-wallet-infra,circle-wallet-options,recommended-architectures}.md`.
