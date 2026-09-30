# 15: Existing products tour (index)

Purpose: answers Abu's question "the previous stuff and the current existing ones — how do they look? What are those tools?" It is a visual and product tour of what already exists in and around the Arc/Circle agent ecosystem, and where our product fits.

Sources: see `tour.md` and `landscape-map.md`. Raw evidence: `.firecrawl/product/15/` (page scrapes as `.md`/`.json`, 8004scan API JSON, `og-images.txt`) and screenshots in `.firecrawl/product/15/img/`.
Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| [tour.md](tour.md) | One section per product: Arc Portal, Circle Agent Stack (CLI, marketplace, starter kits), Bankr, Circle sample apps, Canteen winners (Keryx, Mimir, Rubicon), HeyElsa, Robinhood Cortex, Coinbase agents, 8004scan. Each covers who it's for, screens and journey, look, modality, which of our features it has or lacks, and Arc status. Screenshots are embedded |
| [landscape-map.md](landscape-map.md) | A products × feature groups A–U table, the whitespace [INFERENCE], and the "agents on Arc" direction with its implications (agent-to-agent, exposing our capabilities) |

## Screenshot index (`.firecrawl/product/15/img/`)

- **Live sites (Firecrawl, 2026-09-29):**
  - `site-portal-home.png`, `site-portal-earn.png`, `site-portal-swap.png`, `site-portal-send.png`, `site-portal-agent.png`
  - `site-agents-circle.png`, `site-agents-circle-services.png`
  - `site-bankr.png`, `site-heyelsa.png`
  - `site-keryx.png`, `site-mimir.png`, `site-rubicon.png`
  - `site-8004scan.png`
- **From Circle repos:** `sample-arc-*.png` (10 apps), `agent-stack-starter-kits-demo.gif` and `-frame.png`, `circle-skills-readme.png`.
- **Press:** `robinhood-cortex-2025.png` (the Robinhood newsroom launch image, concept art).

## Five things to take away

1. **Circle already ships the forms-based Arc super-app (Portal), and it tells users to bring their own agent** (Claude Code or Codex) with a capped wallet. Our product is the agent for people who don't have one [INFERENCE]. Portal is live on mainnet [VERIFIED].
2. **Nobody on Arc has a conversational, voice-capable consumer agent.**
   - Bankr is on Arc mainnet but can't swap there [VERIFIED docs].
   - The Agent Stack is CLI-only [VERIFIED].
   - HeyElsa claims voice and many languages, but its Arc support is unproven [REPORTED].
   - Robinhood Cortex shows the bar for voice plus pre-filled confirmation tickets, on iOS only and not on crypto rails [VERIFIED disclosure].
3. **Circle's sample apps and past winners are all dashboards or agent back ends on testnet.**
   - No sample has an LLM loop that moves money [VERIFIED].
   - The winners (Keryx, Mimir) won on autonomous paid decisions with a written rationale and hard spending caps, not on wallet UX [VERIFIED showcase].
4. **The visual default on Arc is dark-navy fintech** (Portal, the samples, Mimir). The memorable looks are Keryx (editorial), HeyElsa (friendly and illustrated) and Cortex (native, data-dense) [INFERENCE from the screenshots].
5. **"Agents on Arc" is two-sided.**
   - Circle's marketplace has a "Sell to Agents" side.
   - 336 ERC-8004 agents are on Arc mainnet, and 95 of the top 100 accept x402 [VERIFIED API].
   - The winners exposed MCP servers.
   - Consider listing read-only capabilities (bridge-route quotes, token safety) as x402 services, and registering our agent in ERC-8004. Never let outside agents move user money. This is **new scope for Abu to decide** (`landscape-map.md`).

## Gaps
- Nothing behind a login was inspected: Portal agent-wallet creation, the Bankr chat, the HeyElsa app, the Mimir app.
- There is no primary screenshot of the Coinbase or Base agent UIs (403, and a docs URL that moved).
- HeyElsa's "Arc" chain listing is not tied to chain ID 5042.
- Firecrawl credits used: 15 of the 60 allowed.
