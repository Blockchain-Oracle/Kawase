# Arc sample applications (index)

Purpose: the official list of Arc sample apps, plus the extra repo the hackathon references, with one line each, the stack, and which hackathon RFB it maps to. This is a list only; deep repo cards live elsewhere in this library.

Sources:
- https://docs.arc.io/arc/references/sample-applications
- https://docs.arc.io/build/{agentic-economy,payments,ecommerce,stablecoin-fx,borrow-and-lend,prediction-markets}
- `.firecrawl/tameion.md` and `.firecrawl/kickoff-slides.txt` (hackathon's RFB mapping)
- GitHub API (`gh api repos/circlefin/<repo>`), 2026-09-29 (last push dates and stars)

Verified: 2026-09-29

| Repo | Docs card | What it demonstrates (stack per docs) | Hackathon fit | Last push · ★ |
|---|---|---|---|---|
| [circlefin/arc-fintech](https://github.com/circlefin/arc-fintech) | Wallets and treasury | Multichain **treasury console**: crosschain capital movement with Circle dev-controlled wallets, Gateway, and Bridge Kit | **RFB 1** Treasury (slides: "start here") | 2026-09-16 · 41 |
| [circlefin/arc-escrow](https://github.com/circlefin/arc-escrow) | Payments and checkout | **AI-validated** freelance escrow with USDC release or refund via the Refund Protocol, Circle Wallets, and Contract Platform | **RFB 3** Contractor and vendor | 2026-06-18 · 128 |
| [circlefin/arc-x402-circle-wallets](https://github.com/circlefin/arc-x402-circle-wallets) | *(not in docs index)* | AI agent autonomously pays x402-paywalled services from a Circle dev-controlled wallet, settling USDC on Arc testnet | **RFB 4** Autonomous operator | 2026-08-11 · 0 |
| [circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments) | Payments and checkout | Autonomous agent pays for API endpoints in **USDC fractions** via Circle Nanopayments and x402 (gasless) | RFB 4, agent spend | 2026-06-29 · 44 |
| [circlefin/arc-multichain-wallet](https://github.com/circlefin/arc-multichain-wallet) | Wallets and treasury | **Unified USDC balance** and crosschain transfers via Circle Gateway, Next.js, Supabase | RFB 1 (one balance across chains) | 2026-06-18 · 44 |
| [circlefin/arc-stablecoin-fx](https://github.com/circlefin/arc-stablecoin-fx) | Stablecoin FX | Real-time **USDC↔EURC** swaps with platform fee collection via the App Kit Swap SDK, dev-controlled wallets, Supabase | Pay EU vendors in EUR (RFB 2/3) | 2026-09-07 · 20 |
| [circlefin/arc-p2p-payments](https://github.com/circlefin/arc-p2p-payments) | Payments and checkout | **Gasless** P2P USDC with **passkey** modular wallets (ERC-4337) | Payer UX | 2026-07-28 · 20 |
| [circlefin/arc-commerce](https://github.com/circlefin/arc-commerce) | Payments and checkout | USDC credit purchases with dev-controlled wallets and **webhook-driven settlement** (Next.js, Supabase) | RFB 2 AR (incoming payments) | 2026-07-15 · 68 |
| [circlefin/arc-ecommerce-payments](https://github.com/circlefin/arc-ecommerce-payments) | Payments and checkout | Onchain storefront, **escrow checkout** (authorize, capture, void, refund) in USDC or EURC using the Commerce Payments Protocol (Coinbase × Shopify) | RFB 2 AR | 2026-09-13 · 12 |
| [circlefin/arc-defi-lend-borrow](https://github.com/circlefin/arc-defi-lend-borrow) | DeFi | Deposit **cirBTC**, borrow USDC through a custom lending contract, Circle Modular Wallets, Supabase | Treasury credit line | 2026-09-18 · 13 |
| [circlefin/arc-prediction-markets](https://github.com/circlefin/arc-prediction-markets) | DeFi | Prediction markets with **UMA Optimistic Oracle V2** resolution and a constant-product AMM | Oracle and escrow patterns | 2026-09-13 · 15 |

Docs detail pages live at `https://docs.arc.io/build/sample-apps/<repo-name>` (e.g. `/build/sample-apps/arc-escrow`).

Related repos: [circlefin/docs-examples](https://github.com/circlefin/docs-examples) (runnable docs snippets, e.g. `app-kit-bridge-solana`), [circlefin/skills](https://github.com/circlefin/skills), [circlefin/arc-foundry](https://github.com/circlefin/arc-foundry), [circlefin/arc-node](https://github.com/circlefin/arc-node). Arc Studio templates (prediction market, USDC checkout, crosschain bridge, onchain profile) are at https://studio.arc.io.
