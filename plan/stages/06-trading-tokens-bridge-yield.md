# Stage 6: Trading, tokens, bridge, yield

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- Swap via App Kit (LI.FI underneath) + KyberSwap/LI.FI for arbitrary tokens.
- Token search, trending and safety (GoPlus, copycat detection); user token rules (D12) enforced by policy; price impact and slippage caps; the brake behavior.
- `compare_bridge_routes` across CCTP/App Kit, Across, Relay, LI.FI, deBridge and Socket (fresh quotes, net received, trust labels) + bridge execution and status + stuck-transfer recovery.
- Earn vaults (App Kit Earn / Morpho) with APY + TVL + liquidity warnings, deposit and withdraw, positions.
- Prices and charts; portfolio.
- **Exit:** a mainnet swap, a meme-token buy blocked by a default rule then allowed after a signed rule change, a bridge that picks the cheapest route and explains why, an earn deposit + withdraw; testnet shows the mock vaults and correct "mainnet-only" explanations.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
