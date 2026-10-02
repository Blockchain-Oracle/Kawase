# Objects: everything a user sees, holds or acts on

Purpose: the noun inventory for the how-tree. Each type lists **every instance**, the awkward ones included, and the **identity** each must show. Identity rules: real marks from `packages/identity` (first-party sources only); people get authored avatars or a generated monogram; unknown things get a neutral labelled mark, **never a fake logo**.
Sources: `01-arc-ecosystem-census/*`, `02-defi-bridge-trade/*`, `packages/identity`, live checks in `cards/*`.
Verified: 2026-10-02

## Asset (any token the user holds or can get)
| Instance | Examples on Arc | Identity | Notes |
|---|---|---|---|
| Dollar stablecoin | USDC (native gas + ERC-20 view, shown as **one** balance) | USDC mark | gas asset on Arc |
| Other fiat stablecoins | EURC, GBPA, wARS, other local stables where live | issuer mark, else a currency monogram | |
| Bitcoin / Ether | cirBTC, WETH | Circle cirBTC mark, ETH mark | |
| Tokenized real-world assets | XAUm (Matrixdock gold), USYC (allowlisted T-bill fund), announced BUIDL/JAAA/JTRSY | issuer mark | permissioned ones are display-only with the reason |
| Meme / launchpad tokens, **graduated** | ARGUS, TOLLY, FAZE, … (Uniswap v4) | token image from token lists / GeckoTerminal; else a generated monogram + "unverified" | copycats exist (two ARGUS, two CRCL) |
| Meme / launchpad tokens, **pre-graduation** | tokens on a bonding curve (Argus, Tolly, LIFT, Load, Mercurifi…) | launchpad mark + token image | tradable only through the launchpad's curve |
| Position shares | Morpho vault shares, Aave wrapped tokens, LP positions | protocol mark + underlying mark | shown as positions, not loose tokens |
| Unknown / spam / dust | unsolicited airdrops, lookalikes | neutral mark + "Hidden" | Hidden by default; unhide possible |
| On another chain | anything at the same address on Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche… | asset mark + chain badge | "Bring to Arc" when a route exists |
| Testnet asset | test USDC/EURC, mock vault shares | the same marks + TESTNET eyebrow | never mixed with mainnet |

## Chain and network
- **Network:** Arc mainnet (5042), Arc testnet (5042002). The header pill is the one-tap toggle (D15).
- **Chains reached by bridges:** Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, World Chain, Unichain, and more where a provider routes. Each has a chain mark and a "Testnet" label on testnets.

## Market
| Instance | Identity | Notes |
|---|---|---|
| Spot pair (token ↔ token) | both marks + venue mark on the quote | venues: App Kit Swap, KyberSwap, LI.FI, 1inch, 0x, Uniswap, Aero |
| Perp market (BTC, ETH, FX, stocks, commodities, crypto) | underlying mark + venue mark (Hibachi, edgeX) | leverage, funding, open interest |
| Launchpad curve | launchpad mark + token | pre-graduation only |
| Closed / paused / delisted market | the same marks + state chip | read-only, with the reason |

## Position and order
- **Earn:** vault shares or supplied asset, with APY, withdrawable now, P&L.
- **Borrow:** collateral, debt, health factor, liquidation price.
- **Perp:** side, size, leverage, entry, mark, liquidation price, P&L (price / funding), TP/SL.
- **LP:** range, fees, rewards (Merkl).
- **Order:** TP/SL, limit, DCA/TWAP (as automations), each with its trigger and state.

## Money movement records
Send, receive, request, invoice, withdrawal, buy (on-ramp), swap, bridge, deposit or withdraw from a position, perp open/close, automation run, marketplace purchase. Each carries an intent id, a network, a state (pending → confirmed / failed / unknown→checking) and a receipt.

## Counterparts and destinations
| Instance | Identity |
|---|---|
| Me (my own address, on any chain) | my avatar |
| Kawase user (@handle) | their avatar + @handle |
| Contact (one address per chain, verification method, per-network trust) | avatar or monogram |
| New 0x address | monogram + "new" + the first-time warning |
| `.arc` name | resolved address + the registry's mark |
| Exchange (Kraken, OKX, Binance, Bybit, KuCoin, Coinbase…) | exchange mark; lives in **My places** |
| My other wallet (MetaMask, Phantom, Rabby, Ledger…) | wallet mark; lives in **My places** |
| Bank (via an exchange or a sell ramp) | bank glyph + the provider's mark |
| Token contract pasted as a recipient | hard stop |

## Agent and services
- **Thread:** chat and voice share one history.
- **Card:** the 25 card kinds in plan §C.
- **x402 service:** seller, endpoint, price per call, network, receipt.
- **Marketplace grant:** caps per call and per day.
- **Memory fact:** visible and editable.

## Automations and authority
- **Automation:** schedule or rule, action, grant cap, next run, practice/live state.
- **Allowance:** per-token daily caps.
- **Grant:** automation or marketplace, on chain.
- **Limits:** per payment, cooldown, allowlist.
- **Controls:** pause-all state, risk dial, practice mode.

## Account
- Sign-in methods (email, Apple, Google, passkey later).
- Devices and sessions.
- @handle, display name, avatar.
- Business profile.
- Consent versions.
- Language, theme, display currency, sounds, haptics, narration, voice, notification preferences, quiet hours, token rules.

## Notifications
In-app inbox items, push and email, each tied to an intent or event, with its network and a deep link (`/i/[intentId]`).
