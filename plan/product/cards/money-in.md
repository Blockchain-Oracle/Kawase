# Card: Put money in (buy, receive, from an exchange, from another chain)

Purpose: the how-ladder for every way money arrives. Rules: R1, R2, R9, R12, R13.
Sources (live checks 2026-10-02 ~11:38 UTC, no secrets printed):
- `@circle-fin/onramp-kit` 1.0.3 source (published 09-30) and `docs.arc.io/app-kit/onramp`; a LIVE session mint returned 201;
- Relay `POST api.relay.link/quote` (Base→Arc with `usePermit:true`, 200);
- Across `suggested-fees` (200); CCTP iris v2 fees;
- exchange announcements (Kraken blog, Bybit announcement, OKX/Binance/KuCoin reports).

Verified: 2026-10-02

## Buy with Apple Pay / Google Pay / debit (Circle Onramp Kit first)
| Lens | Answer |
|---|---|
| Entry | Add money sheet (first row) · Home action row and empty states · guest hero "Buy with Apple Pay" (signs in, then resumes) · a token page's Buy when short · chat (`start_buy`, "buy $20 of ARGUS with Apple Pay") |
| Which | The provider delivers **USDC or EURC on Arc mainnet**. Any other token = buy USDC, then a one-approval swap (both fees shown up front) |
| How | Server: `POST https://api.circle.com/v1/stablecoinKits/sessions` with `Authorization: Bearer <CIRCLE_LIVE_API_KEY>` and body `appUserId`, `walletAddress` (the user's address), `traceId`, optional `amount`/`currency`/`email`/`metadata`. It returns `{sessionToken, expiresAt}` (~30 min). The SDK builds the widget URL. Client: a page **hosted on our KYB-registered domain** mounts `kit.onramp.mountIframe({session, container, onDepositSettled})`. The app opens it in the system browser sheet (`expo-web-browser`), not a WebView, because Apple Pay is restricted in WebViews (inference) and `openWindow` refuses in-app browsers. The return comes by deep link |
| Methods | Apple Pay, Google Pay, Debit (and bank transfer for USDC in some regions). **Debit/Apple Pay/Google Pay require our `referrerDomain` to be in Circle KYB `web_url`.** Session minting does not check this, so the KYB registration is a prerequisite (Codex prompt) |
| Who / when | Signed in (guests sign in first, in place); **mainnet only**, with no public sandbox, so testnet says "Buying is real money on mainnet" and offers test money; country per provider ("US, UK, select EU; varies by method") |
| How much | Provider min/max; fees shown by the provider; Kawase shows "you'll receive ~X" and, for a token buy, the swap quote too |
| How long | Card: minutes. Events: `onDepositSubmitted` → `onDepositSettled` (then confirmed by our on-chain watcher, never by the client event alone) |
| What if | `SESSION_TIMEOUT`, `CANCELED_BY_CUSTOMER`, `NO_PAYMENT_OPTIONS` (offer Transak/MoonPay or From an exchange), `CUSTOMER_PENDING_REVIEW` (KYC pending: notify when done), `CUSTOMER_REJECTED`, `PAYMENT_PROVIDER_ERROR`; startup `PAGE_NOT_LOADED`/`INVALID_SESSION_TOKEN` → remint |
| After | "You're funded" moment (koban + sound) → the swap step if a token was chosen → receipt; Activity "Bought 20 USDC with Apple Pay" |
| Fallbacks | Transak (an Arc provider), MoonPay (`usdc_arc`); both need partner keys (Codex prompt) |

## Receive any token
- **Entry:** fan · Add money · token page More · chat (`show_receive`).
- **How:** the address QR (bare address, scans everywhere) labelled with the network; "Any token on Arc arrives here"; the same address on supported chains (chain chooser, with Bring to Arc noted); request-with-amount QR (EIP-681: amount, asset, chain).
- **After:** the incoming watcher (EIP-7708 emitter for native USDC, Transfer logs for ERC-20s) → push "Received 20 EURC from @sam" → Activity; unknown tokens go to Hidden.

## From an exchange
- **Which (USDC on Arc, as of 10-02):**

  | Exchange | Status |
  |---|---|
  | Kraken | deposits and withdrawals, network "Arc" |
  | Bybit | deposits and withdrawals, zero-fee withdrawals |
  | OKX | both, likely (unverified) |
  | Binance | withdrawals to Arc "gated on liquidity"; deposits open |
  | KuCoin | unclear |
  | Bitget | "USDC-ARC" |
  | Coinbase | not supported, so: withdraw USDC on Base to the same address, then **Bring to Arc** |

  **No exchange supports EURC on Arc.** No memo needed (EVM).
- **How:** pick the exchange (logo) → that exchange's steps ("withdraw USDC, network: Arc, to this address") with the address/QR → the watcher announces arrival.
- **What if:** the user picked another network → the money lands at the same address on that chain → Bring to Arc.

## From another chain (Bring to Arc)
- **Entry:** Add money → From another chain · Home "On other chains" · a push "Found 25 USDC on Base".
- **Routes (50 USDC Base→Arc, live 10-02):**

  | Route | Fee | You receive | Gas | Speed |
  |---|---|---|---|---|
  | **Relay with permit** (default) | $0.033 | 49.966 | **gasless**: one EIP-712 `ReceiveWithAuthorization` signature (Privy, the same key) | ~1 s |
  | Across | $0.008 (cheapest) | 49.992 | needs ETH on Base, so offered only when the user has it or Kawase sponsors | ~instant |
  | CCTP fast/standard | ~0.0016 / 0 | — | needs Base gas or sponsorship; the forwarder mints on Arc | seconds / ~15 min |

- **Rule:** rank by received minus source gas the user would pay; routes needing gas the user lacks count only when sponsored.
- **After:** tracker → arrival → Activity "Brought 50 USDC from Base".

## Test money (testnet)
Circle faucet drip (20 USDC + 20 EURC); when the drip is empty or claimed → faucet.circle.com prefilled.

## Acceptance
- [ ] Guest taps "Buy with Apple Pay" → sign-in → amount → provider sheet → (after KYB) Apple Pay → settled → funded moment → Activity.
- [ ] "Buy $10 of cirBTC with Apple Pay" → shows the onramp fee plus the swap quote → after USDC lands, one approval → cirBTC in holdings.
- [ ] Send USDC on Base from a test wallet to my address → "Found on Base" → Bring to Arc via Relay permit, with no ETH → arrives.
- [ ] From an exchange → Kraken → steps show network "Arc".
