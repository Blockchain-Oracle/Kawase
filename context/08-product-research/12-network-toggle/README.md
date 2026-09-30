# 12 · Mainnet ↔ testnet toggle and network-aware agent

Purpose: research for D15. Abu wants a one-tap mainnet ↔ testnet toggle "like dark mode", and an agent that is smart about what exists on each network. He is unsure whether "you're on testnet, want to switch?" is good or bad UX.
Sources: the three files below; raw evidence in `.firecrawl/product/12/` (Stripe, Plaid, NN/g, Nielsen, Smashing pages; MetaMask and Rainbow source; viem, App Kit and AppKit package contents; live Relay, Across, LI.FI and RPC checks; Arc app PRs). Rules: `../RESEARCH-RULES.md`.
Verified: 2026-09-29

## Files
- [ux-precedents.md](ux-precedents.md): Stripe, MetaMask, Rainbow, Phantom, Coinbase, Trust, Solflare, Plaid, Circle Console, Arc Portal and Arc apps; NN/g on modes; hide vs disable vs offer-to-switch
- [libraries-and-implementation.md](libraries-and-implementation.md): per-network keys and endpoints, viem/App Kit chain definitions, wagmi/AppKit/TanStack/Zustand/Jotai/Expo storage, and a network-agnostic tool layer
- [recommendation.md](recommendation.md) [INFERENCE]: toggle UX, data separation, agent wording, in-flight handling, the registry, and the new `SMART-PRECONDITIONS` entry

## Headline findings
1. **Offering to switch is established practice, but only after explaining and with explicit consent.** Rainbow: "Testnets are not supported by Swap. Disable Testnet Mode to continue." and a "Switching to X? … [Disable and Switch] [Cancel]" sheet. MetaMask disables buttons with "Unavailable on this network" and requires approval for a switch. **No product found hides features silently or switches on its own.** [VERIFIED source code]
2. **Recommended answer to Abu's question** [INFERENCE]: explain, give alternatives, then offer the switch. Asymmetric: switching to testnet may auto-resume; switching to mainnet never auto-resumes a money action (fresh "real money" draft and confirmation).
3. **NN/g warns about modes over high-stakes actions.** It recommends at least **two redundant indicators** and constructive "wrong mode" messages [VERIFIED]. Stripe moved from a test toggle with an orange banner to **named sandboxes in an account picker** [VERIFIED]. So the network must be named inside every card, read-back and signed payload, not only in the chrome.
4. **Circle credentials are per environment**: `TEST_API_KEY` vs `LIVE_API_KEY`, and a mismatched `blockchain` is rejected. The cross-environment kit key is legacy [VERIFIED]. So: two server-side keys and two Circle identities per user.
5. **Providers split differently**: Circle uses the same host with a different key; Relay and Across use separate testnet hosts, and **neither has Arc testnet today**; LI.FI uses the same host, keyed by chain id [VERIFIED live]. **viem 2.57.0 ships `arc` and `arcTestnet`**; App Kit 1.15.3 has `Arc`/`Arc_Testnet` with `isTestnet` [VERIFIED].
6. **Arc apps that shipped toggles already hit the bugs:**
   - testnet fallbacks shown "as real money" (Splitsy)
   - one ungated balance hook leaking testnet assets (Kaleido)
   - over-separated UI state (Nest)
   
   The fix: one network module, fail toward testnet, every key prefixed by `chainId` [VERIFIED PRs].

## Gaps
- No usability study compares "offer to switch" with "explain only". No conversational wallet agent's network-unavailable reply was found to quote.
- Whether a Circle user-controlled-wallet user can span both environments: needs a day-1 test with both keys.
- Coinbase, Trust and Solflare behaviour is [REPORTED] only.
