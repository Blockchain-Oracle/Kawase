# Docs pack: wallet lane (Privy replaces Turnkey)

Checked 2026-10-14 against docs.privy.io (`.md` pages), the published type files of the packages below (unpacked, not installed in the repo), and a viem 2.57.0 run. UNVERIFIED = not confirmed.

## 1. Versions
| Package | Version | Note |
|---|---|---|
| `@privy-io/expo` | 0.76.3 (Apache-2.0) | native only; docs say "Web is not supported". Built against expo 56.0.9 / RN 0.85.3; **Expo 57 / RN 0.86 UNVERIFIED** |
| `@privy-io/react-auth` | 3.49.0 | web build only |
| `@privy-io/node` | 0.35.0 | api; `server-auth` 1.32.5 is the older line, skip |
| `react-native-webview` 14.0.1, `react-native-passkeys` 0.4.2 | | webview is a required peer |

Native install (dev client only, not Expo Go; add `host.exp.Exponent` to allowed ids only for Go):
`npx expo install @privy-io/expo expo-application expo-crypto expo-linking expo-secure-store expo-web-browser react-native-webview expo-apple-authentication react-native-passkeys @privy-io/expo-native-extensions`
Polyfills (docs): `fast-text-encoding`, `react-native-get-random-values` (already in `src/polyfills.native.ts`), `@ethersproject/shims`, imported before `expo-router/entry`. Web: `pnpm add @privy-io/react-auth` (+ `@privy-io/chains` if overriding an RPC). Api: `pnpm add @privy-io/node`. Remove `@turnkey/*`.
Peer `viem` is pinned `2.57.5` (optional, so 2.57.0 only warns; bump the catalog to silence).
`metro.config.js`: replace the `@turnkey/` special case with Privy's (keep `withUniwindConfig` outermost): resolve `isows` and any `zustand*` with `unstable_enablePackageExports:false`; resolve `jose` with `unstable_conditionNames:['browser']`. `tsconfig` `moduleResolution: "Bundler"`.

## 2. Config
- Dashboard (owner): create app, copy App ID; create an **app client** (gives Client ID). Allowed app identifiers: `xyz.kawase.app` (iOS bundle, Android package). Allowed URL schemes: `kawase`. **Empty lists reject everything.** Enable Email, Google, Apple. Web client: allowed origins `https://app.getkawase.xyz`, `http://localhost:8081`. Turn on "Return user data in an identity token". Copy the app's JWT verification key (Settings).
- Apple: Client ID in Privy = iOS **bundle id** for native; **Services ID** for web/Android. `app.json`: `ios.usesAppleSignIn: true`, plugin `"expo-apple-authentication"`. Passkeys later: `ios.associatedDomains ["webcredentials:<domain>"]` + AASA file.
- Env: `EXPO_PUBLIC_PRIVY_APP_ID`, `EXPO_PUBLIC_PRIVY_CLIENT_ID`, api `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY` (PEM). No secret is needed for the api path in section 6.

## 3. Native: provider, login, wallet (`apps/mobile/src/wallet/wallet-provider.native.tsx`)
```tsx
import { PrivyProvider } from "@privy-io/expo";
import { defineChain } from "viem";
export const arcTestnet = defineChain({ id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, // confirm decimals vs packages/config
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } }, blockExplorers: { default: { name: "Arcscan", url: ARC_EXPLORER } } });
// arcMainnet: same with id 5042
<PrivyProvider appId={APP_ID} clientId={CLIENT_ID}
  supportedChains={[arcTestnet, arcMainnet]}  // first = wallet default; sendTransaction/switchChain on others throws
  config={{ embedded: { ethereum: { createOnLogin: "users-without-wallets" } } }}>{children}</PrivyProvider>
```
Gate everything on `const { isReady } = usePrivy()` (it already includes wallet init; do not wait on another flag). Replaces `TurnkeyAccount.available`.

Email OTP (replaces `sendCode`/`verifyCode`):
```ts
const { sendCode, loginWithCode, state } = useLoginWithEmail();
await sendCode({ email });                      // state: sending-code -> awaiting-code-input
await loginWithCode({ code, email });           // -> done; callbacks onLoginSuccess(user, isNewUser)
```
Social (replaces `signInWith`): `const { login } = useLoginWithOAuth(); await login({ provider: "google" | "apple" })` returns the user. Uses the allowed URL scheme; Apple is native on iOS, web flow on Android (`isLegacyAppleIosBehaviorEnabled: true` forces web flow).

Wallet (replaces `ensureWallet`): do not rely on `createOnLogin` for headless flows (the web docs say it does not fire for whitelabel login; Expo behavior UNVERIFIED). Always:
```ts
const { wallets, create } = useEmbeddedEthereumWallet();
if (!wallets.length) await create();            // { createAdditional?: boolean }
const address = wallets[0]?.address;
```
Sign-out: `usePrivy().logout()`. Tokens: `useIdentityToken().getIdentityToken()`; access token `usePrivy().getAccessToken()` (auto-refreshes, about 1 h life).

## 4. Signing (the adapter): `packages/wallet/src/privy.ts` replaces `turnkey.ts`
Everything is a raw 32-byte digest through the wallet's EIP-1193 provider, exactly the pattern `turnkey.ts` already uses (viem hashes, wallet signs raw, `checks.ts` runs first):
```ts
const provider = await wallets[0].getProvider();       // cache in a ref; do not refetch per signature
const signHash = async (hash: Hex) =>
  (await provider.request({ method: "secp256k1_sign", params: [hash] })) as Hex;   // returns 0x signature
```
`privySigner({ address, signHash, approval })` then: `signMessage` = `hashMessage`; `signTypedData` = `checkTypedData` then `hashTypedData`; `signAuthorization` = `checkAuthorization` then `hashAuthorization({contractAddress, chainId, nonce})` (import from `viem/utils`; not exported from `viem` root in 2.57.0); `signTransaction` = `keccak256(serializeTransaction(tx))` then `serializeTransaction(tx, signature)` (how viem's own local account works, so no `eth_signTransaction` needed). Parse with `parseSignature(sig)`: I ran viem 2.57.0 with `v` = 27/28 and 0/1, both give the right `yParity`. Whether Privy returns 27/28 or 0/1 is UNVERIFIED; `parseSignature` covers both. Authorization nonce: pass viem's nonce through; do not use `executor:"self"` (our relayer submits, so nonce is the EOA's current nonce).
Test gate (copy the research list): `recoverAddress({hash, signature})` equals the wallet address for message, typed data, authorization and tx hashes; no UI appears.
Alternatives that exist, not needed: `provider.request({method:"personal_sign", params:[message, address]})`; `eth_signTypedData_v4` `params:[address, typedData]` (docs type says `{signature}` but example uses a string: UNVERIFIED shape); `useSign7702Authorization()` in Expo `signAuthorization({contractAddress, chainId, nonce?, executor?}, {address?})` returns viem `SignedAuthorization` (exists in 0.76.3 types; the docs page shows an older provider recipe with typos `'viem;'` and `walletClient`). The Expo docs say typed-data has no built-in UI.
`ApprovalStrength "passkey"`: Privy keys are not device-bound, so there is no per-signature system passkey sheet. Move "Face ID above the allowance" to the app: call `biometric.ts` before `signHash` when `approval === "passkey"`. Privy MFA (passkey/TOTP) exists but its Expo flow is UNVERIFIED; skip.

## 5. Web (`wallet-provider.tsx`, same screens)
```tsx
import { PrivyProvider, useLoginWithEmail, useLoginWithOAuth, useWallets, useCreateWallet } from "@privy-io/react-auth";
<PrivyProvider appId={APP_ID} config={{ supportedChains:[arcTestnet, arcMainnet], defaultChain: arcTestnet,
  loginMethods:["email","google","apple"], embeddedWallets:{ showWalletUIs:false, ethereum:{ createOnLogin:"users-without-wallets" } } }}>
```
Differences: `useLoginWithOAuth` exposes `initOAuth({provider})` (not `login`); email hook is the same `sendCode`/`loginWithCode`; wallet from `useWallets()`, provider via `wallet.getEthereumProvider()`, create with `useCreateWallet().createWallet()`. **`showWalletUIs:false` is required**, otherwise Privy opens its own confirm modal on message, typed-data and tx signing (whether raw `secp256k1_sign` shows one is UNVERIFIED; test). `useSign7702Authorization().signAuthorization({contractAddress, chainId, nonce})` exists on web too, but use the same `hashAuthorization` + `secp256k1_sign` path so one adapter serves both. Embedded wallets need https (localhost allowed). Tokens: `getAccessToken`/`getIdentityToken` (imports from `@privy-io/react-auth`); send as `Authorization: Bearer` and `privy-id-token` headers, never cookies for the Hono api. Platform split follows the existing `.native.tsx` / `.tsx` pair; the `.tsx` file must not import `@privy-io/expo`.

## 6. Api: verify tokens in Hono (`apps/api/src/auth/privy.ts`)
No secret and no network call: both functions verify locally with jose (ES256, issuer `privy.io`, audience = app id). The docs call the key "Ed25519"; the code imports it as ES256 SPKI.
```ts
import { verifyAccessToken, verifyIdentityToken } from "@privy-io/node";
const claims = await verifyAccessToken({ access_token, app_id: env.PRIVY_APP_ID, verification_key: env.PRIVY_VERIFICATION_KEY });
// { user_id: "did:privy:...", session_id, expiration, ... }; throws on bad/expired
const user = await verifyIdentityToken({ identity_token, app_id: env.PRIVY_APP_ID, verification_key: env.PRIVY_VERIFICATION_KEY });
const email = user.linked_accounts.find((a) => a.type === "email")?.address;               // proved by OTP
const wallet = user.linked_accounts.find((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.wallet_client_type === "privy")?.address;
```
Google/Apple logins carry their email on `google_oauth`/`apple_oauth` accounts (read both; IDEA: handle Apple private-relay addresses). The identity token "may be incomplete due to size"; the REST fallback (`GET https://api.privy.io/v1/users/{did}`, basic auth app id:secret) is UNVERIFIED here. Legacy `privy.utils().auth().verifyAccessToken(string)` takes a string in 0.35.0 types, while the docs show `{access_token}`: use the standalone function above. Without the key string, JWKS is `https://api.privy.io/v1/apps/<appId>/jwks.json` (cached 60 min).
Mapping: `POST /auth/turnkey` becomes `POST /auth/privy` with `{ accessToken, identityToken, device }`; `providerRef` = DID; email/address come from the identity token, never from the client body; keep the single-use nonce only if replay matters (access tokens are valid about 1 h). `custody` enum gets `privy`; `turnkey_*` columns go neutral.
**M12 replacement (IDEA):** `turnkey-proof.ts` stamps no longer exist. Cheapest: each proofed request carries a fresh Privy access token (`x-kawase-privy-token`) whose `user_id`/`session_id` match the Kawase session (a leaked Kawase bearer alone no longer spends; the token itself is replayable for up to about 1 h). Stronger: the device `personal_sign`s `kawase:<ms>:<sha256 of METHOD path\nbody>` (the existing `proofActivity` string) and the api `verifyMessage`s it against the registered wallet; 1 signature per proofed request, well inside 50K free.

## 7. Key export
Only `exportWallet()` in `@privy-io/react-auth` (web). Mobile pattern: host a tiny page on `app.getkawase.xyz/export` that logs in and calls `exportWallet()`, open it from the app in `react-native-webview`/`expo-web-browser`, and post `{status}` back via `window.ReactNativeWebView.postMessage` (recipe: docs.privy.io/recipes/mobile-key-export). Keys exist as a private key (not a phrase): change `export-wallet-screen.tsx` copy. By default the user's own access token can always export or sign; there is no Kawase-side veto unless a 2-of-2 key quorum is set (not needed).

## 8. Money-path defaults and limits
- Free (privy.io/pricing, fetched today): 0-499 MAU, 50K signatures and $1M volume a month. 500-2,499 MAU **$299/mo**; 2,500-9,999 **$499/mo**. MAU = user with a session in 30 days. If a free app passes 500 and does not upgrade, new sign-ups are blocked. Policy engine is listed under Developer in the matrix, limits UNVERIFIED.
- Privy's default RPCs are rate limited; we broadcast through our own RPC, so only pass an explicit `nonce` (Expo auto-fetches nonce from the chain RPC otherwise).
- Never sign before `isReady`; wallet calls before it can throw.
- Session length is set per app client (days); the SDK stores tokens in SecureStore.

## 9. Gotchas
- Expo 57 / RN 0.86 + new architecture with `@privy-io/expo` 0.76.3 UNVERIFIED: spike on the simulator first (Metro `isows`/`zustand`/`jose` rules are the usual breakers).
- Docs mix `config.embedded` (Expo) and `config.embeddedWallets` (web); types confirm both.
- Google OAuth is blocked in embedded webviews (Google policy). Tauri desktop wraps the web URL: Google inside it UNVERIFIED, fall back to email OTP there.
- Existing Turnkey users get new addresses; match by verified email.

## Sources
docs.privy.io: basics/react-native/{installation,setup,quickstart}, basics/react-native/advanced/{setup-apple-login,automatic-wallet-creation,configure-evm-networks,setup-passkeys}, basics/get-started/dashboard/app-clients, authentication/user-authentication/{login-methods/oauth,login-methods/email,access-tokens}, user-management/users/identity-tokens, wallets/using-wallets/ethereum/{sign-a-raw-hash,sign-7702-authorization,sign-a-message,sign-typed-data}, wallets/wallets/export, recipes/mobile-key-export, basics/react/advanced/automatic-wallet-creation; privy.io/pricing; npm registry; unpacked `.d.ts`/`lib/auth.js` of @privy-io/expo 0.76.3, js-sdk-core 0.78.3, react-auth 3.49.0, node 0.35.0.
Context7: `/llmstxt/privy_io_llms_txt` (best), `/llmstxt/privy_io_llms-full_txt`, `/privy-io/expo-starter` (example app).
