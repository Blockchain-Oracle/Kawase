# Cross-cutting rules (binding)

Purpose: the patterns every capability obeys. A screen, tool or card that breaks one of these is a bug. They were found by asking "how?" across every verb (`capability-matrix.md`) and by Abu's corrections on 2026-10-02.
Sources: D1–D36, `12-network-toggle/recommendation.md`, `SMART-PRECONDITIONS.md`, the approved plan §A.
Verified: 2026-10-02

## R1 — Every asset is first-class
- Kawase shows every token the user's address holds, on Arc and on every supported chain. A balance indexer finds them; no hand-picked list does.
- Capabilities are **computed per asset × chain × network from live sources**: venue quotes, bridge quotes, yield sources, lending markets, perp venues.
- No flow logic names a specific asset. The only exceptions are protocol facts kept as data (e.g. USDC is Arc's gas token).
- **The same picker** (holdings across chains, real marks, value, search, sorted by value) opens in Send, Withdraw, Swap, Bridge, Earn, Borrow, Request, Automations, the perps margin field and chat.

## R2 — Unavailable is never silent
A verb unavailable for an instance stays **visible with its reason and the nearest path**. Examples:
- "No bridge carries this token to Base, so convert to USDC first? Both steps in one approval."
- "This exchange doesn't accept this token on Arc."
- "Only on mainnet, so switch?"
- "Allowlisted asset."

The same words are used in UI, chat and voice (blocker-as-label, D13/D15).

## R3 — Many providers, compared
For every capability (spot, perps, buy, yield, borrow, bridge, marketplace), Kawase integrates **several Arc providers behind one adapter**. It fans out fresh executable quotes, recommends one with a reason, and shows the alternatives on the card. Any protocol serving Arc users is allowed (D6, D36).

## R4 — One flow shape
- What → to whom/where → how much → review → approve → pending → receipt.
- The same steps run from a screen, the fan, a token page, chat, voice, an automation, a notification or a deep link. Chat and voice fill the steps; **the card is the review**.

## R5 — Approval tiers (D33)
- **No prompt:** inside the daily allowance, which is per-token on-chain caps for the tokens the user includes (default: the stablecoins they hold; any token can be added).
- **Face ID:** above the allowance; tokens outside it; every swap, bridge, withdraw, perp order and borrow.
- **Face ID plus a new on-chain grant:** loosening any limit or rule.
- **Voice:** money always needs the card tap, because speech can mishear amounts and names. Typed chat inside the allowance needs none.
- **Perps and swaps:** **slide to confirm**. It resets on any change of market, side, amount, leverage, quote freshness or a move to the background.

## R6 — Recipient check, everywhere money leaves
This runs on every send, withdraw, request payment, batch line, automation and marketplace payout:
- **Address shape:** checksum.
- **Who it belongs to:**
  - a Kawase user → show the @handle;
  - my own address → "That's you";
  - a token contract → hard stop;
  - any other contract (`eth_getCode`): smart wallets are OK, otherwise a warning.
- **Is it safe to pay:**
  - the issuer blocklist, wherever the token has one: hard stop;
  - a lookalike of a saved contact: hard stop;
  - first-time recipient: warning plus an offer to send a test amount first.
- **Where it goes:**
  - a `.arc` name: show the registry and confirm;
  - another chain: the asset goes as itself only if a bridge quotes it, otherwise "convert first";
  - an exchange: its accepted assets and networks are checked, with a strong warning plus a convert offer when they don't match.

## R7 — Outcomes are honest and exactly-once
- Every write has an intent id and an idempotency key.
- States: pending → confirmed / failed (not sent) / unknown → checking (reconciled on reopen).
- **Nothing is ever re-broadcast automatically.**
- Each outcome writes one Activity row with a "why", a receipt and a notification.
- Sounds and the hanko stamp play only on confirmed outcomes, once.

## R8 — The network is explicit
- Every draft, card, receipt, notification and spoken read-back names its network.
- A switch voids open drafts. Automations keep running on their own network.
- Balances and history are per network. Contacts are shared, with per-network trust.

## R9 — Fees never dead-end
- Arc gas is USDC; the reserve shows "~N actions left".
- When it is short, the EIP-3009 relayer (single transfers) or the 7702 relayer (batches) carries the transaction with the fee shown.
- Source-chain gas for "bring to Arc" is avoided through gasless routes (Relay permit) or sponsorship.

## R10 — Real identity, never placeholders
- Every asset, chain, venue, exchange, wallet and provider shows its real mark from first-party sources.
- People show authored avatars or monograms.
- Unknowns show a neutral labelled mark.

## R11 — Practice and real are one product
- Testnet is practice: real flows with test money, labelled "TESTNET · no real money" everywhere.
- A capability that doesn't exist on testnet says so (R2) and never pretends.
- A paper simulator, if used for perps practice, is labelled as one.

## R12 — Resume, never restart
- An interrupted precondition (sign-in, setup, contact, limit, rule, network, consent) resumes **the same intent** with fresh checks (D13).
- Completing sign-in never submits a payment by itself.

## R13 — Guests can look at everything real
- Without an account: prices, markets, token pages, the docs and chat.
- Any write opens the sign-in sheet **in place**, then resumes (R12).

## R14 — Words are few
- Primary screens use a title, one line and marks. Explanations sit behind "More", "Why" or an info sheet.
- No "how it works" walls.
- Copy lives in all ten catalogs.
