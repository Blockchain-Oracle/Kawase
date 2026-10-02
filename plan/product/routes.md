# Route tables (where routes vary by instance)

Purpose: for each asset × destination, which route runs, ranked by what the user receives minus gas they would have to pay. These are computed live (R1, R3); the tables record what the live checks returned on 2026-10-02 and the ranking rule, not a fixed list.
Sources: the rails fact sheet (Relay, Across and CCTP quotes, 50 USDC, live), the yield/bridge fact sheet, the asset fact sheet (CCTPx for EURC/cirBTC), exchange announcements.
Verified: 2026-10-02

## Ranking rule
1. Fan out quotes in parallel (≈3 s timeout) to every provider that lists both ends for that asset.
2. `net = out × price(out) − gas the user pays in-app − fixed fees`. A route that needs source-chain gas the user doesn't have **counts only if sponsored**.
3. Drop expired quotes and those over provider limits or over the user's speed preference.
4. Show up to 3 on the card (provider mark, you receive, fee, ETA, trust label: "Circle burn/mint" vs "solver/intent"). Recommend the best `net`; ties go to the faster.

## Into Arc (Bring to Arc), USDC from Base, 50 USDC
| Route | Fee | Out | User gas | ETA | Default? |
|---|---|---|---|---|---|
| Relay `usePermit` | $0.033 | 49.966 | **none** (one EIP-3009 signature) | ~1 s | **yes** |
| Across | $0.008 | 49.992 | ETH on Base | ~instant | when the user has ETH or Kawase sponsors |
| CCTP fast / standard | ~$0.0016 / $0 | ~50 | Base gas (or 7702 sponsor / Circle Paymaster) | s / ~15 min | when sponsored |

## Out of Arc, USDC to Base (any recipient)
| Route | Fee | Out | User gas | ETA |
|---|---|---|---|---|
| CCTP (App Kit, forwarder) | $0 | ~50 | Arc gas (USDC, cents) | seconds–minutes |
| Across | ~$0.009 | ~49.991 | Arc gas | ~2 s |
| Relay | ~$0.047 + $0.0017 gas | 49.953 | Arc gas (approve + deposit, one 7702 batch) | ~2 s |

## Other assets leaving Arc as themselves
| Asset | Routes (as of 10-02) | Else |
|---|---|---|
| EURC | CCTP to Avalanche, Base, Ethereum, World Chain; deBridge (needs native gas fee) | convert to USDC |
| cirBTC | CCTP to Ethereum | convert |
| WETH | App Kit lists it (UNVERIFIED route); LI.FI/deBridge where they quote | convert |
| Meme / other tokens | LI.FI / Relay when they quote | convert to USDC first (one batch) |
| XAUm, USYC, pre-graduation tokens | none | convert (XAUm) / not transferable (USYC) / sell on the curve first |

## Withdraw to an exchange (USDC unless noted)
| Exchange | Network to choose | Status 10-02 | Kawase route |
|---|---|---|---|
| Kraken | Arc | deposits + withdrawals live | transfer on Arc |
| Bybit | Arc | deposits + withdrawals (zero-fee withdrawals) | transfer on Arc |
| OKX | Arc | likely live (page unreachable; UNVERIFIED) | transfer on Arc, with a "check your OKX shows Arc" note |
| Binance | Arc | deposits open | transfer on Arc |
| KuCoin | Arc | supported; withdrawals unclear | transfer on Arc |
| Bitget | USDC-ARC | supported | transfer on Arc |
| Coinbase | **Base** (no Arc) | — | bridge to Base → the user's Coinbase Base address |
| Any exchange, EURC | — | **no exchange lists EURC on Arc** | convert to USDC, or bridge EURC to an exchange-supported chain |

## Bank cash-out
Through an exchange above (deposit on Arc → sell/withdraw at the exchange), or bridge to Base → a sell ramp (Transak/MoonPay sell on Base, partner key needed). **No ramp pays out from Arc directly** (MoonPay `isSellSupported:false`; Onramp Kit "offramp not yet available").

## Buy (fiat → asset)
| Asset wanted | Route |
|---|---|
| USDC, EURC | Onramp Kit (Apple Pay / Google Pay / debit after KYB; bank transfer USDC) → Arc |
| Any other token | Onramp USDC → swap (best venue quote) in one approval |
| Outside Onramp Kit coverage | Transak / MoonPay (partner keys) |
