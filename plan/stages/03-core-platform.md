# Stage 3: Core platform

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: started early (pure packages done while Stage 1 spikes run)

## Scope (from the master plan)
- `packages/{config,env,networks,money,i18n,db,log}`; Drizzle schema + migrations; the api skeleton (Hono, problem+json, idempotency, rate limits).
- Better Auth: email OTP, passkey, guest.
- Wallet creation at sign-up (Turnkey, one EOA for both networks), the relayed 7702 setup per network, and the default allowance grant with one Face ID. The first-mainnet sheet + consent; the network pill toggle + testnet bar + REAL MONEY eyebrows; server-authoritative network + MMKV cache.
- Capability registry + runtime overlay + the public availability page.
- i18n for 10 locales with RTL reload.
- Settings hub skeleton. Expo app shell (tabs/drawer, routes), web output, PWA manifest.
- Deploy `api` + `web` to Coolify.
- **Exit:** sign up as a guest → pick a language (including ar) → sign up with an email code and get a wallet with no PIN → accept the default allowance with one Face ID → toggle to mainnet (one-time sheet, mainnet setup relayed) and back instantly, same address; balances are separated per network; running on the Coolify domain.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- 2026-09-29: `packages/networks` done: 2 NetworkContexts (viem `arc`/`arcTestnet`), all verified addresses (assets, CCTP V2, Gateway, StableFX, Memo, Multicall3From, delegation framework + 10 enforcers), `assertSameNetwork` hard stop. **All 29 addresses verified on-chain on both networks** (valid checksum + deployed code).
- 2026-09-29: `packages/money` done: branded bigint `Amount`, `rescale` (18↔6), locale-aware `parseAmount` (ASCII, Arabic-Indic, Extended Arabic-Indic, Devanagari and Bengali digits; Arabic ٫ ٬ marks; rejects excess decimals), `formatAmount` (no Intl currency code for USDC), `canonicalAmount`. Checked en/fr/es/ar/hi/bn/ur: all parse to the exact same base units.
- 2026-09-29: `packages/config` done: units, `DEFAULT_LIMITS` per network (from limits-and-safety.md; judgment-call defaults), timeouts, fees (20 gwei floor), cache, the 10 locales + RTL, model ids.
- Note: `formatAmount` relies on `Intl.NumberFormat.format(string)` (ES2023). Confirm Hermes supports it in spike 11; fall back to formatting via parts if not.
