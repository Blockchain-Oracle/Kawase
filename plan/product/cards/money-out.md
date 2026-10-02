# Card: Move money to people, and take money out

Purpose: the how-ladder for Send (any asset), Request and Pay, Batch and Split, and Withdraw. Rules: R1, R2, R4–R9, R12.
Sources: `apps/api/src/send/*`, `requests/*`, `bridge/*`; `context/01-arc/transactions-memo-batching.md` (Memo, Multicall3From, EIP-3009); the census exchange list; the rails fact sheet (`cards/money-in.md` evidence).
Verified: 2026-10-02

## Send any asset
| Lens | Answer |
|---|---|
| Entry | Home action row · fan · a token page's More sheet · a contact's page · chat/voice ("send 20 to Amina") · a request to pay · an automation |
| Which | Asset: the universal picker (holdings across chains, value-sorted, search). Recipient: contacts (avatars), @handle, 0x, QR scan (camera; the web shows the QR instead), `.arc` name |
| From → To | From Arc (or from another chain after Bring to Arc). To the same chain = a transfer; to another chain = any bridge that quotes the asset, else "convert first?" with both in one batch |
| Who / when | Signed in and set up (else sign-in in place → resume); paused → blocked with a "Resume" link; practice mode → simulated |
| How much | Keypad; units ↔ fiat toggle; **Max = balance − fee reserve**; decimals per token; per-payment cap and daily allowance shown as a meter |
| How | Review card: identity, recipient-check rows (R6), allowance meter, tier, network, cross-chain line, memo. Tier: inside the allowance (allowance tokens) = no prompt (typed) / tap (voice); otherwise Face ID |
| How long | Arc: seconds. Cross-chain: provider ETA on the tracker |
| What if | Insufficient balance (one-tap fix: Max, or Add money); insufficient gas (relayer carries it, fee shown); blocklisted recipient (hard stop); lookalike (hard stop); first-time recipient (test amount offered); quote expired (re-quote); unknown outcome → "checking", reconciled; app killed mid-send → resumes as checking, never re-sent |
| After | Receipt (hanko stamp, sound, haptic); Activity row with why; the recipient gets a push if a Kawase user; "save as contact" if new |
| Consistency | Same picker, check and tiers as Withdraw, Request and Automations |
| Copy & identity | "Send 20 USDC to @amina on Arc mainnet": the network always named; real marks |

## Request / pay a request
- **Entry:** fan · a contact page · chat ("ask Sam for 30").
- **Which:** any asset (default: my main stablecoin); one person or split across several.
- **How:** amount → note → share (link plus EIP-681 QR) or send in-app. Each request carries an **on-chain Memo reference**.
- **Payer side:**
  - a Kawase user pays from the inbox card, in that asset or any asset converted in the same batch;
  - an outside payer uses `/r/[token]` with any wallet (web connect) or the address plus amount.
- **What if:**
  - partial ("$20 of $30");
  - overpaid ("paid, $X extra");
  - paid in another asset ("Received 30 USDC — mark as paid?");
  - expired after 30 days;
  - cancelled.
- **After:** a paid-progress card; reminders (automation); a receipt to both sides.

## Batch and split
- **Entry:** Send → "+ Add person"; chat ("pay these 4 people"); payroll automation.
- **How:** lines (recipient, asset, amount) → one 7702 batch (Multicall-style) → one approval. Every line passes R6.
- **What if:** one line fails a check → the whole batch waits with that line marked; nothing is partially sent unless the user removes the line.

## Withdraw (any asset, anywhere)
| Lens | Answer |
|---|---|
| Entry | Home action row · token page · chat/voice ("cash out", "withdraw my cirBTC to Kraken") · exit kit · delete-account flow |
| Which | **One asset, several, or everything**, from the universal picker across chains. Each "as itself" or "as cash" (converted to a stablecoin on the way) |
| From → To | To **My places** (saved), a new **exchange** (logos; the exchange table gives accepted assets × networks), **my other wallet** (chain picker), or **my bank** (through an exchange that takes Arc deposits, or a sell ramp after a bridge; the path is stated) |
| Route | Per asset: same chain → transfer; other chain → the cheapest bridge quoting that asset; neither → convert, then send. Shown as lines before approval |
| Who / when | Signed in; mainnet or testnet (testnet: own wallets only, exchanges are mainnet); paused → blocked |
| How much | Per asset: amount or Max (net of fees and reserve); "everything" fills all |
| How | Review lines → **Face ID always** → one batch (swaps + transfers/burns) |
| How long | Arc transfers: seconds; bridges: provider ETA; exchange crediting: the exchange's confirmations (stated) |
| What if | The exchange doesn't accept the asset/network → strong warning + convert offer; first-time destination → test amount; an address on the wrong chain for that exchange → stop; a partial route failure → the tracker shows which leg, with "Finish it" |
| After | Receipt per leg; Activity "Withdrawn to Kraken"; a push on completion |
| Consistency | Uses the Send engine, R6 and the bridge adapter; the same in chat and voice (voice needs the card tap) |
| Copy & identity | Exchange and wallet marks; "you receive" per asset; the network named on every line |

## Acceptance (walk on a phone)
- [ ] Send EURC to a contact on Base: the route line shows CCTP; approve; the tracker completes.
- [ ] Send a meme token to a new 0x: the first-time warning plus test-amount offer; the token-contract-as-recipient case is blocked.
- [ ] Withdraw two assets at once (USDC as itself, cirBTC as cash) to a saved Kraken place: the lines show the conversion and route; Face ID; both legs done.
- [ ] Withdraw everything to my own wallet on Base: every asset shows as itself or converted, with a reason per line.
- [ ] Request 30 EURC split across 2 people; one pays from a web wallet; progress reads "15 of 30".
