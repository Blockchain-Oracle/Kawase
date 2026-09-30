# Landscape map: existing products × our feature groups A–U, the whitespace, and the "agents on Arc" direction

Purpose: one comparison table of the nine products in `tour.md` against the feature groups in `../FEATURE-INVENTORY.md`, then where the open space is, and what Circle's "agents on Arc" push implies for our product.

Sources: `tour.md` (every cell's evidence is in that product's section); `../FEATURE-INVENTORY.md`; `.firecrawl/product/census/arcio-blog-mainnet.md`; `.firecrawl/product/15/agents-circle.md`, `agents-circle-services.md`, `8004scan-arc-top.json`; `context/02-circle-agent-stack/marketplace-and-discovery.md`, `identity-and-a2a.md`; `context/05-canteen-ecosystem/canteen-and-prior-events.md`; `../DECISIONS-FROM-ABU.md`.
Verified: 2026-09-29

## Comparison table

Legend:
- ✅ = present (verified or reported, per `tour.md`).
- ◐ = partial or limited.
- — = not present on what was seen.
- ? = unknown (behind a login, or not documented).
- The table covers public pages and docs only [INFERENCE for "—" cells: seeing nothing is not proof of absence].

| Group | Arc Portal | Circle Agent Stack | Bankr | Circle sample apps | Canteen winners (Keryx, Mimir) | HeyElsa | Robinhood Cortex | Coinbase agents | 8004scan |
|---|---|---|---|---|---|---|---|---|---|
| **Live on Arc?** | ✅ mainnet | ✅ mainnet + testnet | ◐ mainnet, no swaps | testnet repos | testnet | ? ("Arc" listed, chain unproven) | — | — ("soon") | ✅ mainnet (336 agents) |
| **Modality** | web | CLI + coding agent + web catalog | web, X, Telegram, Farcaster, CLI, API | web (Next.js) | web + MCP (Keryx) | web, CLI, x402 API | iOS app | MCP in ChatGPT/Claude, CLI, wallet chat | web + API |
| A Onboarding / wallet | ✅ | ✅ (email OTP, auto wallets) | ✅ | ✅ (passkey, email) | ◐ connect wallet | ✅ | ✅ (brokerage) | ✅ | — |
| B Balances / portfolio | ◐ | ✅ | ✅ PnL | ✅ multi-chain | — | ✅ | ✅ | ✅ | — |
| C Money movement | ✅ Send | ✅ | ✅ (handles) | ✅ | — | ✅ | ✅ | ✅ | — |
| D Trading / meme | ◐ USDC↔EURC | ◐ swap | ✅ (not on Arc) | ◐ FX only | — | ✅ | ✅ | ✅ | — |
| E Bridging (compare) | ◐ bridge-in only | ◐ CCTP only | ◐ cross-chain, no comparison | ◐ CCTP/Gateway | — | ◐ "best path" | — | ? | — |
| F Yield | ✅ Morpho vaults | ◐ undocumented `earn` | ◐ LP skills | ✅ Earn kit | — | ✅ "autopilot" | — | ✅ via Base MCP apps | — |
| G Marketplace (x402) | ◐ price teaser | ✅ catalog + pay | ✅ buy + sell | ◐ seller demo | ✅ autonomous buying | ◐ sells APIs | — | ✅ x402 | ◐ agent directory |
| H Automations | — (BYO agent) | — | ✅ Agent Commands, DCA | — | — | ◐ limit orders | ◐ alerts | ◐ strategies | — |
| I Contacts | ? | ◐ allowlist | ◐ nicknames in memory | — | — | ? | — | ? | — |
| J Notifications / channels | ? | — | ◐ chat on X/Telegram | — | — | ? | ◐ alerts | ? | — |
| K Voice + languages | — | — | ? | — | — | ✅ claimed (multi-language, "talk") | ◐ voice input, audio digests; languages ? | — | — |
| L Generative UI cards | — (forms) | — (terminal) | ◐ "Apps" mini-dashboards | — | ◐ answer + receipt views | ◐ chat | ✅ pre-filled order tickets | ◐ review sheet | — |
| M Agent intelligence / memory | — | BYO agent | ✅ memory | — | ✅ rationale per decision | ◐ multi-model | ✅ | BYO (ChatGPT/Claude) | ◐ reputation scores |
| N Safety / limits | ✅ agent spend caps | ✅ caps (mainnet only) + OTP | ✅ strongest set | ◐ screening | ✅ hard spend cap | ◐ "risk protection" | ✅ explicit confirm | ✅ caps, isolated portfolio | — |
| O History / reporting | ◐ activity | ◐ | ✅ | ✅ tables | ✅ public proof ledger | ? | ✅ | ✅ | ✅ (registry) |
| P Settings hub | ? | CLI config | ✅ security page | — | — | ? | ✅ | ✅ | — |
| Q Platforms (iOS/Android/desktop/web) | web | CLI | web + bots | web | web | web | iOS only | inside other apps | web |
| R Business mode | — | ◐ sell to agents | ◐ token launch | ✅ commerce, escrow, treasury | ◐ creators | — | — | — | — |
| S Friction removal / trust | ◐ disclaimers, guarded vaults | ◐ approval gate | ◐ | ◐ faucet buttons | ✅ proof pages | ? | ✅ disclosures | ◐ | — |
| T Resolve and resume | ? | — | ◐ asks when unclear | — | — | ? | ◐ handoff to support with context | ? | — |
| U A11y / privacy / x402 boundary | ? | ◐ y/N gate | ? | — | ◐ per-question cap | ◐ dry-run API | ◐ no social / open web | ◐ service allowlist | — |
| **Mainnet ↔ testnet toggle (A3)** | — | ✅ (flag) | — | testnet only | testnet only | ? | — | — | ✅ network filter |

## Where the whitespace is [INFERENCE]

The evidence for each point is the table above plus `tour.md`.

1. **No consumer agent on Arc that actually talks.** Arc Portal is the official consumer hub, but it is forms plus "bring your own coding agent". The Agent Stack is CLI-only. Bankr on Arc can't swap. HeyElsa's Arc support is unproven. So a chat-plus-voice agent that runs swap, bridge, earn and marketplace on Arc for a non-developer has no incumbent.
2. **Voice plus multilingual plus money movement together.** HeyElsa claims multi-language chat and talk. Cortex has voice, but only on iOS and only in the US. Nobody on Arc has either.
3. **Contacts, automations and notification connectors on Arc.** Bankr has automations, but not with Arc swaps. Nobody shows a contacts book with "unknown name → add contact", or a settings page to connect Telegram or Discord.
4. **Bridge comparison.** Everyone shows a single route (Portal bridge-in, CCTP-only CLI, "best path" in Elsa). A visible "cheapest vs fastest across LI.FI/Relay/Across/deBridge/CCTP" card is unclaimed.
5. **Generative confirmation cards.** Only Cortex (pre-filled tickets) and Coinbase (review sheet) do this well, and neither is on Arc. Portal and the samples are static forms.
6. **Mainnet and testnet in one consumer app.** Portal is mainnet-only, the samples and winners are testnet-only, and the marketplace is mainnet-only. A one-tap toggle is a real differentiator for the hackathon (judges can use testnet safely).
7. **The look.** The Arc-native products all converge on the same dark-navy fintech dashboard: Portal, the samples, Mimir. The standouts visually are Keryx (editorial), HeyElsa (painterly and friendly) and Robinhood (native, data-dense). A warm, friendly consumer identity would stand out on Arc.

## The "agents on Arc" direction Circle is pushing

### Evidence
- **Portal hands the agent a wallet, not a UI.** "Create a wallet with a spending cap, hand the setup prompt to Claude Code, Codex, or any AI agent — and it transacts on its own." [VERIFIED `img/site-portal-agent.png`]
- **Circle's stated thesis.**
  - "AI agents are moving from tools people operate to labor people delegate, and every one of those agents needs to transact" (`arcio-blog-mainnet.md:103`) [VERIFIED].
  - "An agent hiring three other agents, paying them in under a second, and earning a fraction of a cent for its own work is no longer science fiction. It's possible on Arc today." (`:98`) [VERIFIED]
- **agents.circle.com is two-sided.**
  - It has a "Sell to Agents" tab, "Your API is a storefront", and "Agents paying agents for work too small to invoice" [VERIFIED `15/agents-circle.md`].
  - The marketplace lists 107 services and 1,336 endpoints [VERIFIED screenshot]; 687 are payable on Arc mainnet and 0 on testnet [VERIFIED census].
  - It publishes an A2A card for the Discovery API (`agents.circle.com/.well-known/a2a.json`) [VERIFIED `identity-and-a2a.md`].
  - It already sells **voice as a service to agents**: AgentPhone ("Voice and SMS telephony for AI agents"), and a "Brief me by phone" use case at about $5.55 [VERIFIED].
- **ERC-8004 on Arc is active.**
  - 336 mainnet agents. In the top 100, 95 are x402-enabled, 39 expose A2A and 26 expose MCP.
  - Agents like "APEX Watchtower" ping every Arc agent hourly and record who answers [VERIFIED API].
- **What judges rewarded.**
  - Keryx (Lepton 1st) ships `keryx-mcp`, so any MCP agent can use it. Rubicon ships a CLI and an agent SDK. Arcox is an MCP server [VERIFIED showcase].
  - Lepton's RFB 3 was "agent-to-agent nanopayment networks".
  - The Tameion judging weights include 30% traction and 20% Circle tool usage [VERIFIED `canteen-and-prior-events.md`].
- **Incumbents.**
  - Bankr is reachable from Claude Code (plugin), a CLI and an Agent API, and sells x402 endpoints.
  - Coinbase and MetaMask put their wallets inside ChatGPT, Claude or Claude Code rather than building a chat app [VERIFIED/REPORTED `04-analogs-and-competitors/ai-crypto-agents.md` §1, §3].

### What it implies for our product [INFERENCE]

1. **Position against Portal as "the agent you don't have to bring".** Portal assumes the user owns Claude Code or Codex. Our app is that agent, for people who don't. This is the cleanest one-line differentiation from Circle's own product. It also means we should reuse Portal-grade primitives (Circle agent wallets or App Kit, spend caps) rather than invent our own.
2. **Be a consumer of other agents, not only of APIs.** D14 already has the agent buying from the x402 marketplace. The next step is to also read the **ERC-8004 registry** (8004scan API, or the IdentityRegistry directly) as a second catalog, and show a reputation or health signal before paying. Keep all of it inside the U3 boundary: per-call and session caps, an allowlist, and responses treated as data, never commands (M8).
3. **Expose a small, safe slice of our capabilities to other agents (agent-to-agent).** There are three possible levels, from cheapest to most ambitious:
   - **(a) Read-only paid services**: x402 endpoints such as "cheapest bridge route for X→Arc", "token safety check for an Arc contract" and "Arc yield snapshot", listed on Circle's marketplace ("Sell to Agents"). This is the direct traction lever: every paid call is on-chain proof of use. It is mainnet-only for the listing, because the catalog has 0 testnet entries.
   - **(b) Register our agent in ERC-8004** on Arc mainnet and testnet, with an A2A card and an MCP endpoint for those read-only tools. It is cheap, and it makes us discoverable on 8004scan next to the 336 existing agents.
   - **(c) "Bring your own agent" mode for our own users**: an MCP server so a user's Claude Code or ChatGPT can act on *their own* wallet in our app, under the same envelope (caps, allowlist, passkey for out-of-policy actions). This mirrors Portal and Coinbase, but with our contacts, automations and confirmation cards behind it.
4. **Never let a third-party agent move a user's money.** Incoming agent requests are data. Any money action that originates outside the user's own authenticated session is at most a *proposal* that lands in the user's "Needs you" queue (S23) and requires a passkey. The Grok→Bankr drain is the cautionary example (`04-analogs-and-competitors/README.md` #5).
5. **Scope.** D16 says "everything is MVP", but the items in point 3 are **new scope that Abu has not asked for**. Recommendation: (a) and (b) are small and help the traction score; (c) is larger. Flag all three as a decision for Abu, not something to assume.

## Open questions for Abu
- Should our agent also *sell* read-only capabilities to other agents (x402 listing plus ERC-8004 registration), or stay consumer-only?
- Should "bring your own agent" (an MCP server over the user's own wallet) be in scope?
