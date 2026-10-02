# Capability matrix

Purpose: object × verb, with the **symmetry rule**. If a verb works for one instance of a type, it works for every instance, in practice and real money, on every platform, unless the cell names its reason. ✓ = supported via the named route; ✗ = not possible, with the reason and the nearest path (rules R1–R2). Cells were resolved by the live fact sheets of 2026-10-02 (trading, rails, x402); UNVERIFIED marks what still needs a build-time check.
Sources: `objects.md`, `rules.md`, the census and DeFi research, live checks (see `cards/*`).
Verified: 2026-10-02

## Assets × money verbs (mainnet)
Key: **S** send on Arc · **X** send/withdraw to another chain as itself · **E** withdraw to an exchange · **B** to a bank · **F** buy with fiat · **W** swap, buy or sell with crypto · **Y** earn · **L** borrow against · **M** perp margin · **A** automate · **R** request or invoice · **H** hide

| Instance | S | X | E | B | F | W | Y | L | M | A | R | H |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| USDC | ✓ transfer | ✓ CCTP, Across, Relay, LI.FI | ✓ Kraken, Bybit (live), OKX (likely), Binance (deposits), Bitget; Coinbase via Base | ✓ via exchange, or bridge to Base + sell ramp | ✓ Onramp Kit (Apple Pay/Google Pay/debit), Transak, MoonPay | ✓ all venues | ✓ Aave V4, Morpho vaults, Morpho markets, LP | ✓ Aave V4 collateral (powers shorts) | ✓ Kawase Margin (Aave V4); Hibachi if connected | ✓ | ✓ | ✗ never hidden |
| EURC | ✓ | ✓ CCTP to Avalanche, Base, Ethereum, World Chain; deBridge | ✗ no exchange lists EURC on Arc → convert, or bridge EURC to Base/Ethereum | ✓ via convert → USDC path | ✓ Onramp Kit (EURC) | ✓ | ✓ Galaxy EURC, Morpho EURC | ✓ Aave V4 borrow EURC | convert first | ✓ | ✓ | ✗ |
| Other fiat stables (GBPA, wARS…) | ✓ | GBPA via LayerZero VT (UNVERIFIED); else convert | convert first | convert first | ✗ no provider sells them → buy USDC + swap | ✓ where quoted | where a source exists | — | convert | ✓ | ✓ | user choice |
| cirBTC | ✓ | ✓ CCTP to Ethereum | per exchange table | convert first | ✗ → buy USDC + swap | ✓ deep Uniswap v3 pool | Aave V4 supply | ✓ Aave V4 / Morpho collateral | convert | ✓ | ✓ | ✗ |
| WETH | ✓ | App Kit lists WETH (UNVERIFIED route); else convert | per table | convert | ✗ → buy + swap | ✓ | Aave V4 | ✓ Aave V4 collateral | convert | ✓ | ✓ | ✗ |
| Public RWA (XAUm) | ✓ | ✗ no route → convert first | ✗ → convert | convert | ✗ → buy + swap | ✓ Circle swap / Uniswap v3 (thin: warn above ~$5k) | ✗ no source | ✗ | ✗ | ✓ | ✓ | user choice |
| Permissioned RWA (USYC) | display; transfer only between allowlisted holders | ✗ allowlisted | ✗ | ✗ | ✗ | ✗ no route | it is the yield | ✗ | ✗ | ✗ | ✗ | user choice |
| Graduated meme token | ✓ | via LI.FI/Relay when they quote; else convert | ✗ mostly → convert | convert | ✗ → buy + swap | ✓ KyberSwap, Circle App Kit Swap, LI.FI (live 10-02), within token rules + copycat rule | ✗ | ✗ | ✗ | ✓ DCA/limits | ✓ | ✓ |
| Pre-graduation meme token | ✓ | ✗ → sell on the curve first | ✗ | convert | ✗ → buy + curve | routable ones trade normally; others show graduation progress + link; in-app curve per launchpad after decoding | ✗ | ✗ | ✗ | limited | ✗ | ✓ |
| Position shares (vault/LP/wrapped) | shown as positions; transfer only where safe | ✗ | ✗ | via withdraw-from-position | ✗ | via withdraw-from-position | ✓ (it is the position) | Morpho/Aave where accepted | ✗ | ✓ auto-save | ✗ | ✗ |
| Unknown / spam | in Hidden; transfer allowed after unhide | ✗ | ✗ | ✗ | ✗ | if quoted, with a warning | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ default |
| Holding on another chain | via "Bring to Arc" first | ✓ "Bring to Arc" (Relay permit gasless, or CCTP + sponsor, or Gateway) | — | — | — | after bringing | after bringing | — | — | ✓ auto-bring rule | — | — |

**Testnet:** USDC and EURC follow the rows above wherever testnet providers exist (CCTP, App Kit swap, App Kit Earn mock vaults, faucet). Every other cell reads "mainnet only — switch?" (R2, R11).

## Markets × verbs
| Instance | View/chart | Trade | Alert | Watch | Share | Automate |
|---|---|---|---|---|---|---|
| Spot pair | ✓ | ✓ swap ticket | ✓ price | ✓ | ✓ | ✓ DCA/limit |
| Perp market | ✓ | ✓ Kawase Margin (Aave V4: cirBTC and WETH long/short; EURC short only, CF 0); Hibachi markets if connected | ✓ | ✓ | ✓ | TP/SL; DCA ✗ |
| Launchpad curve | ✓ progress to graduation | ✓ where an aggregator routes; else link + alert | ✓ graduation alert | ✓ | ✓ | ✗ |
| Closed / delisted | read-only + reason | ✗ | ✗ | ✓ | ✓ | ✗ |

## Positions × verbs
| Instance | View | Add | Reduce / partial close | Close all | TP/SL | Alerts | Share |
|---|---|---|---|---|---|---|---|
| Earn | ✓ APY, withdrawable now | ✓ | ✓ (liquidity-aware) | ✓ | — | APY drop, liquidity | ✓ |
| Borrow | ✓ health | add collateral / borrow more | repay | repay all | — | health warnings | ✓ |
| Perp | ✓ P&L split | ✓ | ✓ 25/50/75 | ✓ slide | ✓ | liquidation risk | ✓ share card |
| LP | ✓ range, fees, rewards | ✓ | ✓ | ✓ | — | out of range | ✓ |

## Counterparts × verbs
| Instance | Save | Verify | Edit | Pay | Request | Address change | Block/remove |
|---|---|---|---|---|---|---|---|
| Kawase user | ✓ | ✓ via @handle | ✓ name | ✓ | ✓ in-app | follows their account | ✓ |
| Contact (any chain) | ✓ | ✓ in person / test payment | ✓ | ✓ | ✓ link | held until reviewed with Face ID | ✓ |
| New address | ✓ after first pay or before | — | — | ✓ with first-time check | ✓ link | — | — |
| Exchange / own wallet (My places) | ✓ | test amount | ✓ | ✓ withdraw | — | held until reviewed | ✓ |

## Account, agent, services
| Object | Verbs |
|---|---|
| Account | sign in (email/Apple/Google), link methods, change email, devices (sign out one/all), export wallet, delete account, set handle/avatar, business profile |
| Thread | chat, talk, search all, rename, delete, export transcript |
| Memory fact | view, edit, forget, turn memory off |
| Automation | create (screen/chat/voice), practice, go live, edit, pause/resume, skip, cancel + revoke, view runs and why |
| Allowance / limits | view, tighten (instant), loosen (Face ID + grant), add a token, temporary raise, pause all, revoke, risk dial |
| x402 service | discover (2,136 listings), inspect price, buy within budget from the per-user agent wallet (Gateway + EIP-3009), receipt, refund request, block seller |
| Notification | view, act (deep link), mute kind, quiet hours, channel per kind |

## Symmetry checks (from this matrix)
- Withdraw, send, request and automate accept **every** asset the user holds (fixes "dollars-only").
- Buy with fiat delivers a provider-sold asset and then swaps, so **any** listed token can be bought with Apple Pay.
- Every asset has a token page (`surfaces.md`), not only USDC.
- Every capability works on web as well as mobile, except camera QR scan (web shows the QR instead) and Apple Pay (web uses the provider's card flow).
